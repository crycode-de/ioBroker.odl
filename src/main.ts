/**
 * ioBroker ODL adapter.
 *
 * (C) 2019-2021 Peter Müller <peter@crycode.de> (https://github.com/crycode-de/ioBroker.odl)
 */

import * as utils from '@iobroker/adapter-core';

import * as request from 'request';

/**
 * The ODL adapter.
 */
class OdlAdapter extends utils.Adapter {

  private readonly url: string = 'https://www.imis.bfs.de/ogc/opendata/ows?&service=WFS&version=1.1.0&request=GetFeature&typeName=opendata%3Aodl_brutto_1h_timeseries&outputFormat=application%2Fjson&filter=#filter#&sortBy=end_measure&viewparams=locality_code%3A#localityCode#%3B';

  private readonly filterTpl: string = '<Filter xmlns="http://www.opengis.net/ogc" xmlns:ogc="http://www.opengis.net/ogc" xmlns:gml="http://www.opengis.net/gml"><And><PropertyIsBetween><PropertyName>end_measure</PropertyName><LowerBoundary><Literal>#from#</Literal></LowerBoundary><UpperBoundary><Literal>#to#</Literal></UpperBoundary></PropertyIsBetween><Or><ogc:PropertyIsEqualTo><ogc:PropertyName>source</ogc:PropertyName><ogc:Literal>BfS</ogc:Literal></ogc:PropertyIsEqualTo></Or></And></Filter>';

  private exitTimeout: NodeJS.Timeout | null = null;

  /**
   * Constructor to create a new instance of the adapter.
   * @param options The adapter options.
   */
  constructor(options: Partial<utils.AdapterOptions> = {}) {
    super({
      ...options,
      name: 'odl',
    });

    this.on('ready', () => this.onReady());

    this.exitTimeout = setTimeout(() => {
      // this.log may be undefined if the adapter could not connect to states/objects db
      if (this.log) {
        this.log.warn(`Adapter did not exit within 10 minutes. Will now terminate!`);
      }
      this.exit(utils.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION);
    }, 600000); // 10 minutes
  }

  /**
   * Is called when databases are connected and adapter received configuration.
   */
  private async onReady(): Promise<void> {
    this.log.debug('start reading data...');

    try {
      await this.read();
      this.log.debug('done');
    } catch (err) {
      this.log.error(`Error loading data: ${err}`);
    }

    this.exit(0);
  }

  /**
   * Terminate or exit the adapter.
   * @param code The exit code.
   */
  private exit (code: number): void {
    if (this.exitTimeout) {
      clearTimeout(this.exitTimeout);
    }

    this.terminate ? this.terminate(code) : process.exit(code);
  }

  private async read (): Promise<void> {
    for (let i = 0; i < this.config.localityCode.length; i++) {

      // load channel and state object info
      let objChan: ioBroker.ChannelObject | null = await this.getObjectAsync(this.config.localityCode[i]) as ioBroker.ChannelObject | null;
      let objState: ioBroker.StateObject | null = await this.getObjectAsync(this.config.localityCode[i] + '.odl') as ioBroker.StateObject | null;

      // create channel if not exists or type is not channel to fix creation error from < v1.1.1
      if (!objChan || objChan.type !== 'channel') {
        objChan = {
          _id:`${this.namespace}.${this.config.localityCode[i]}`,
          type: 'channel',
          common: {
            name: this.config.localityCode[i]
          },
          native: {}
        };
        await this.setObjectAsync(this.config.localityCode[i], objChan);
        this.log.debug(`created channel ${objChan._id}`);
      }

      // create state object if not exists
      if (!objState) {
        objState = {
          _id: `${this.namespace}.${this.config.localityCode[i]}.odl`,
          type: 'state',
          common: {
            name: 'ODL ' + this.config.localityCode[i],
            role: 'value',
            type: 'number',
            unit: 'µSv/h',
            read: true,
            write: false
          },
          native: {}
        };
        await this.setObjectAsync(`${this.config.localityCode[i]}.odl`, objState);
        this.log.debug(`created state ${objState._id}`);

      // update existing object if type is not state to fix creation error from < v1.1.1
      } else if (objState.type !== 'state') {
        await this.extendObjectAsync(`${this.config.localityCode[i]}.odl`, {
          type: 'state',
          common: {
            role: 'value',
            type: 'number',
            unit: 'µSv/h',
            read: true,
            write: false
          }
        });
        this.log.debug(`updated state ${objState._id}`);
      }

      await this.readLocality(this.config.localityCode[i], objChan, objState);
    }
  }

  private async readLocality (loc: string, objChan: ioBroker.ChannelObject, objState: ioBroker.StateObject): Promise<void> {
    const odlStateId = loc + '.odl';

    const to = new Date();
    to.setMinutes(0);
    to.setSeconds(0);
    to.setMilliseconds(0);

    const from = new Date(to);
    from.setHours(from.getHours() - this.config.pastHours || 48);

    // create request url
    const filter = this.filterTpl.replace('#from#', from.toISOString()).replace('#to#', to.toISOString());
    const url = this.url.replace('#localityCode#', encodeURIComponent(loc)).replace('#filter#', encodeURIComponent(filter));

    this.log.debug(`url for ${loc}: ${url}`);

    // load data
    const featureCollection: FeatureCollection | null = await new Promise ((resolve) => {
      request({
        url,
        timeout: (this.config.timeout || 30) * 1000,
        headers: {
          'User-Agent': `Mozilla/5.0 (compatible; ioBroker.odl/${this.version})`
        }
      }, (err, res, body: string) => {
        if (err) {
          this.log.warn('Error loadind data from server!');
          this.log.warn(err);
          return resolve(null);
        }
        this.log.debug(`got ${body.length} bytes for ${loc}, http status ${res.statusCode}`);
        if (res.statusCode !== 200) {
          this.log.warn('Error loadind data from server!');
          this.log.warn(`HTTP status ${res.statusCode} ${res.statusMessage}`);
          this.log.debug(body);
          return resolve(null);
        }

        try {
          resolve(JSON.parse(body));
        } catch (e: any) {
          this.log.warn('Error parsing response from server!');
          this.log.warn(e);
          this.log.debug(body);
          resolve(null);
        }
      });
    });

    // check if we got data
    if (!featureCollection || !Array.isArray(featureCollection.features)) {
      this.log.warn(`Got no data for ${loc}`);
      return;
    }

    this.log.debug(`data contains ${featureCollection.features.length} features for ${loc}`);

    // get the last feature (current value) from the feature collection
    const lastFeature = featureCollection.features[featureCollection.features.length - 1];

    // if no last feature, there are no features and thus nothing to do
    if (!lastFeature) {
      this.log.warn(`Got no data for ${loc}`);
      return;
    }

    this.log.debug(`last value for ${loc} (${lastFeature.properties.locality_name}): ${lastFeature.properties.value}@${lastFeature.properties.end_measure}`);

    // update object name if this is not the name of the last feature
    if (objChan.common.name !== lastFeature.properties.locality_name) {
      this.log.debug(`update name for ${loc} (${lastFeature.properties.locality_name})`);

      await this.extendObjectAsync(loc, {
        common: {
          name: lastFeature.properties.locality_name
        }
      });

      await this.extendObjectAsync(odlStateId, {
        common: {
          name: 'ODL ' + lastFeature.properties.locality_name
        }
      });
    }

    // set the current state to the value of the last feature if the value or the feature changed
    const newState: ioBroker.SettableState = {
      val: lastFeature.properties.value,
      ack: true,
      ts: new Date(lastFeature.properties.end_measure).getTime(),
      lc: Date.now()
    };
    const currentState = await this.getStateAsync(odlStateId);

    if (!currentState || currentState.val !== (newState as ioBroker.State).val || currentState.ts !== (newState as ioBroker.State).ts) {
      await this.setStateAsync(odlStateId, newState);
    }

    // add older features to each enabled history instance if they are not already present
    for (const historyKey in objState.common.custom) {
      // check if history is found and enabled
      if (historyKey.match(/^(history|influxdb|sql)\.\d+$/) && objState.common.custom[historyKey].enabled === true) {
        // history instance found and enabled
        this.log.debug(`history adapter ${historyKey} found for ${loc}`);

        // load current history in the given time range
        const getHistoryResult: GetHistoryResult = await this.sendToAsync(historyKey, 'getHistory', {
          id: objState._id,
          options: {
            start: from.getTime(),
            end: to.getTime(),
            ack: true,
            aggregate: 'none'
          }
        });
        const currentHistory: ioBroker.State[] = (getHistoryResult && Array.isArray(getHistoryResult.result)) ? getHistoryResult.result : [];

        const newHistory: Partial<ioBroker.State>[] = [];

        // check each feature if it must be added to history
        featureCollection.features.forEach((feature) => {
          const endMeasure = new Date(feature.properties.end_measure).getTime();
          if (feature.properties.end_measure === lastFeature.properties.end_measure
            || currentHistory.find((state) => (state.ts === endMeasure))) return;

          this.log.debug(`adding ${feature.properties.value}@${feature.properties.end_measure} for ${loc} to ${historyKey}`);
          newHistory.push({
            ts: endMeasure,
            val: feature.properties.value,
            ack: true,
            from: 'system.adapter.' + this.namespace,
            q: 0
          });
        });

        // add sates to history
        if (newHistory.length > 0) {
          await this.sendToAsync(historyKey, 'storeState', {
            id: objState._id,
            state: newHistory
          });
        }
      }
    }
  }
}

if (module.parent) {
  // Export the constructor in compact mode
  module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new OdlAdapter(options);
} else {
  // otherwise start the instance directly
  (() => new OdlAdapter())();
}
