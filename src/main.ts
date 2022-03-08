/**
 * ioBroker ODL adapter.
 *
 * (C) 2019-2022 Peter Müller <peter@crycode.de> (https://github.com/crycode-de/ioBroker.odl)
 */

import * as utils from '@iobroker/adapter-core';

import axios from 'axios';

/**
 * The ODL adapter.
 */
class OdlAdapter extends utils.Adapter {

  private readonly url: string = 'https://www.imis.bfs.de/ogc/opendata/ows?&service=WFS&version=1.1.0&request=GetFeature&typeName=opendata%3Aodl_brutto_1h_timeseries&outputFormat=application%2Fjson&filter=#filter#&sortBy=end_measure&viewparams=locality_code%3A#localityCode#%3B';

  private readonly filterTpl: string = '<Filter xmlns="http://www.opengis.net/ogc" xmlns:ogc="http://www.opengis.net/ogc" xmlns:gml="http://www.opengis.net/gml"><And><PropertyIsBetween><PropertyName>end_measure</PropertyName><LowerBoundary><Literal>#from#</Literal></LowerBoundary><UpperBoundary><Literal>#to#</Literal></UpperBoundary></PropertyIsBetween><Or><ogc:PropertyIsEqualTo><ogc:PropertyName>source</ogc:PropertyName><ogc:Literal>BfS</ogc:Literal></ogc:PropertyIsEqualTo></Or></And></Filter>';

  private exitTimeout: NodeJS.Timeout | null = null;

  /**
   * If the adapter is unloaded (should stop).
   */
  private unloaded: boolean = false;

  /**
   * Constructor to create a new instance of the adapter.
   * @param options The adapter options.
   */
  constructor(options: Partial<utils.AdapterOptions> = {}) {
    super({
      ...options,
      name: 'odl',
    });

    this.on('ready', this.onReady.bind(this));
    this.on('unload', this.onUnload.bind(this));

    this.exitTimeout = setTimeout(() => {
      this.unloaded = true;

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
    let instObj: ioBroker.InstanceObject | null | undefined = null;

    // adjust the schedule if not already adjusted
    try {
      instObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
      if (instObj && instObj.native && !instObj.native.scheduleAdjusted) {
        // adjust only if default schedule
        if (instObj.common.schedule === '30 * * * *') {
          // create random schedule between 15 and 45
          instObj.common.schedule = `${Math.floor(Math.random() * 31) + 15} * * * *`;
        }
        (instObj.native as ioBroker.AdapterConfig).scheduleAdjusted = true;
        this.log.info(`Schedule adjusted to spread calls better over a half hour!`);
        await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, instObj);
        this.exit(utils.EXIT_CODES.NO_ERROR);
        return;
      }
    } catch (e) {
      this.log.error(`Could not check or adjust the schedule`);
    }

    // check schedule and if it's a scheduled start (at the scheduled time) and delay some seconds to better spread API calls
    if (instObj?.common?.schedule) {
      const m = instObj.common.schedule.match(/^(\d+\s+)?([0-9,]+)(\s+\S+){4}$/);
      if (!m) {
        this.log.error(`Invalid schedule "${instObj.common.schedule}" defined! The schedule should start the adapter once per hour, e.g. "30 * * * *".`);
        this.exit(utils.EXIT_CODES.INVALID_ADAPTER_CONFIG);
        return;
      }
      const minutes = m[2].split(',').map((v) => parseInt(v, 10));
      const date = new Date();
      let delay = 0;
      for (const minute of minutes) {
        if (minute === date.getMinutes() && date.getSeconds() < 10) {
          this.log.debug(`probably scheduled adapter start detected`);
          delay = Math.floor(Math.random() * 60000) + 1;
          break;
        }
      }

      if (delay > 0) {
        this.log.debug(`delay execution by ${delay}ms to better spread API calls`);
        await this.sleep(delay);
      } else {
        this.log.debug('seems to be not a scheduled adapter start, not delaying execution');
      }
    }

    this.log.debug('start reading data...');

    try {
      await this.read();
      this.log.debug('done');
    } catch (err) {
      this.log.error(`Error loading data: ${err}`);
    }

    this.exit(utils.EXIT_CODES.NO_ERROR);
  }

  /**
   * Adapter should unload.
   */
  private onUnload (cb: () => void): void {
    this.unloaded = true;
    cb && cb();
  }

  /**
   * Wait some time and continue if not unloaded.
   * @param ms Time to wait.
   */
  private sleep (ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(() => !this.unloaded && resolve(), ms));
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

      // check unloaded
      if (this.unloaded) {
        return;
      }

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
    const res = await axios.request<FeatureCollection>({
      url,
      method: 'get',
      headers: {
        Accept: 'application/json',
        'User-Agent': `Mozilla/5.0 (compatible; ioBroker.odl/${this.version})`
      },
      timeout: (this.config.timeout || 30) * 1000,
    })
      .catch((err) => {
        this.log.warn('Error loading data from server!');
        this.log.warn(err);
        return null;
      });

    // check unloaded
    if (this.unloaded) {
      return;
    }

    if (!res?.data) {
      this.log.warn(`Got no data for ${loc}`);
      return;
    }

    this.log.debug(`got response for ${loc}, http status ${res.status} ${res.statusText}`);

    if (res.status !== 200) {
      this.log.warn('Error loading data from server!');
      this.log.warn(`HTTP status ${res.status} ${res.statusText}`);
      this.log.debug(JSON.stringify(res.data));
      return;
    }

    const featureCollection: FeatureCollection = res.data;

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
