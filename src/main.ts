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

  /**
   * URL to get the latest data.
   */
  private readonly urlLatest: string = 'https://www.imis.bfs.de/ogc/opendata/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=opendata:odlinfo_odl_1h_latest&outputFormat=application/json';

  /**
   * URL to get the latest 168 features (24h * 7d = 168 features).
   * `#kenn#` will be replaced by the identifier.
   */
  private readonly urlTimeseries: string = 'https://www.imis.bfs.de/ogc/opendata/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=opendata:odlinfo_timeseries_odl_1h&outputFormat=application/json&viewparams=kenn:#kenn#&sortBy=end_measure+A&maxFeatures=168';

  /**
   * Timeout to force adapter exit after some time.
   */
  private exitTimeout: NodeJS.Timeout | null = null;

  /**
   * If the adapter is unloaded (should stop).
   */
  private unloaded: boolean = false;

  /**
   * Configured system language.
   */
  private systemLanguage: string = 'en';

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

    /*
     * Adjust the schedule if not already adjusted.
     * Default schedule is `30 * * * *`.
     * The adjusted schedule uses also seconds to spread API calls better.
     */
    try {
      instObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
      if (instObj?.common?.schedule === '30 * * * *') {
        const second = Math.floor(Math.random() * 60); // 0 to 59
        const minute = Math.floor(Math.random() * 31) + 15; // 15 to 45
        instObj.common.schedule = `${second} ${minute} * * * *`;
        this.log.info(`Schedule adjusted to spread calls better over a half hour!`);
        await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, instObj);
        this.exit(utils.EXIT_CODES.NO_ERROR);
        return;
      }
    } catch (e) {
      this.log.error(`Could not check or adjust the schedule`);
    }

    // get the system language
    const objSystemConfig = await this.getForeignObjectAsync('system.config');
    this.systemLanguage = objSystemConfig?.common?.language || 'en';
    this.log.debug(`system language: ${this.systemLanguage}`);

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
   * Terminate or exit the adapter.
   * @param code The exit code.
   */
  private exit (code: number): void {
    if (this.exitTimeout) {
      clearTimeout(this.exitTimeout);
    }

    this.terminate ? this.terminate(code) : process.exit(code);
  }

  /**
   * Read the data, create objects and states.
   */
  private async read (): Promise<void> {
    // read data from latest layer
    const resLatest = await axios.request<FeatureCollection<FeaturePropertiesLatest>>({
      url: this.urlLatest,
      method: 'get',
      headers: {
        Accept: 'application/json',
        'User-Agent': `Mozilla/5.0 (compatible; ioBroker.odl/${this.version})`,
      },
      timeout: (this.config.timeout || 30) * 1000,
    })
      .catch((err) => {
        this.log.warn('Error loading latest data from server!');
        this.log.warn(err);
        return null;
      });

    // check unloaded
    if (this.unloaded) {
      return;
    }

    if (!resLatest?.data) {
      this.log.warn(`Got no data for latest layer`);
      return;
    }

    this.log.debug(`got response for latest, http status ${resLatest.status} ${resLatest.statusText}`);

    if (resLatest.status !== 200) {
      this.log.warn('Error loading latest data from server!');
      this.log.warn(`HTTP status ${resLatest.status} ${resLatest.statusText}`);
      this.log.debug(JSON.stringify(resLatest.data));
      return;
    }

    const featureCollectionLatest = resLatest.data;

    // check if we got data
    if (!featureCollectionLatest || !Array.isArray(featureCollectionLatest.features) || featureCollectionLatest.features.length === 0) {
      this.log.warn(`Got no data for latest layer`);
      return;
    }

    // check if we need to migrate old configurations before v2.0.0
    if (Array.isArray(this.config.localityCode) && this.config.localityCode.length > 0) {
      this.log.info('Found outdated configuration. Will now migrate this from locality codes to identifiers.');
      try {
        const instObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
        if (instObj) {
          instObj.native = {
            ...this.config,
          };
          instObj.native.msts = instObj.native.msts || [];
          for (const loc of this.config.localityCode) {
            const feature = featureCollectionLatest.features.find((f) => f.properties.id === loc);
            if (feature) {
              instObj.native.msts.push(feature.properties.kenn);
              this.log.info(`Migrated locality code ${loc} to identifier ${feature.properties.kenn}`);
            } else {
              this.log.warn(`Locality code ${loc} not found in current BfS data!`);
            }
          }
          delete instObj.native.localityCode;
          this.log.info(`Migrated ${instObj.native.msts.length} localities`);
          if (instObj.native.msts.length > 0) {
            this.log.warn('Please check and transfer your history configurations from the old objects to the new ones. Also you may delete the old DEZ… objects as they are no longer used now.');
          }
          await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, instObj);
          this.exit(utils.EXIT_CODES.NO_ERROR);
          return;
        }
      } catch (e) {
        this.log.error(`Could not adjust outdated configuration!`);
      }
      return;
    }

    for (const mstKenn of this.config.msts) {
      // check unloaded
      if (this.unloaded) {
        return;
      }

      const featureLatest = featureCollectionLatest.features.find((f) => f.properties.kenn === mstKenn);
      if (!featureLatest) {
        this.log.warn(`Identifier ${mstKenn} not found in latest data!`);
        continue;
      }

      /*
       * channel
       */
      let objChan: ioBroker.ChannelObject | null = await this.getObjectAsync(mstKenn) as ioBroker.ChannelObject | null;
      if (objChan?.type !== 'channel') {
        objChan = {
          _id:`${this.namespace}.${mstKenn}`,
          type: 'channel',
          common: {
            name: `${mstKenn} ${featureLatest.properties.name}`,
          },
          native: {},
        };
        await this.setObjectAsync(mstKenn, objChan);
        this.log.debug(`created channel ${objChan._id}`);
      }


      /*
       * value object
       */
      let objValue: ioBroker.StateObject | null = await this.getObjectAsync(mstKenn + '.value') as ioBroker.StateObject | null;
      if (!objValue) {
        objValue = {
          _id: `${this.namespace}.${mstKenn}.value`,
          type: 'state',
          common: {
            name: this.systemLanguage === 'de' ? `${mstKenn} ${featureLatest.properties.name} ODL` : `${mstKenn} ${featureLatest.properties.name} GDR`,
            role: 'value',
            type: 'number',
            unit: 'µSv/h',
            read: true,
            write: false,
          },
          native: {},
        };
        await this.setObjectAsync(`${mstKenn}.value`, objValue);
        this.log.debug(`created state ${objValue._id}`);
      }

      /*
       * cosmic/terrestrial objects
       */
      let objValueCosmic: ioBroker.StateObject | null = null;
      let objValueTerrestrial: ioBroker.StateObject | null = null;
      if (this.config.useCosmicTerrestrial) {
        objValueCosmic = await this.getObjectAsync(mstKenn + '.valueCosmic') as ioBroker.StateObject | null;
        if (!objValueCosmic) {
          objValueCosmic = {
            _id: `${this.namespace}.${mstKenn}.valueCosmic`,
            type: 'state',
            common: {
              name: this.systemLanguage === 'de' ? `${mstKenn} ${featureLatest.properties.name} ODL kosmisch` : `${mstKenn} ${featureLatest.properties.name} GDR cosmic`,
              role: 'value',
              type: 'number',
              unit: 'µSv/h',
              read: true,
              write: false,
            },
            native: {},
          };
          await this.setObjectAsync(`${mstKenn}.valueCosmic`, objValueCosmic);
          this.log.debug(`created state ${objValueCosmic._id}`);
        }

        objValueTerrestrial = await this.getObjectAsync(mstKenn + '.valueTerrestrial') as ioBroker.StateObject | null;
        if (!objValueTerrestrial) {
          objValueTerrestrial = {
            _id: `${this.namespace}.${mstKenn}.valueTerrestrial`,
            type: 'state',
            common: {
              name: this.systemLanguage === 'de' ? `${mstKenn} ${featureLatest.properties.name} ODL terrestrisch` : `${mstKenn} ${featureLatest.properties.name} GDR terrestrial`,
              role: 'value',
              type: 'number',
              unit: 'µSv/h',
              read: true,
              write: false,
            },
            native: {},
          };
          await this.setObjectAsync(`${mstKenn}.valueTerrestrial`, objValueTerrestrial);
          this.log.debug(`created state ${objValueTerrestrial._id}`);
        }
      }

      /*
       * status object
       */
      let objStatus: ioBroker.StateObject | null = await this.getObjectAsync(mstKenn + '.status') as ioBroker.StateObject | null;
      if (!objStatus) {
        objStatus = {
          _id: `${this.namespace}.${mstKenn}.status`,
          type: 'state',
          common: {
            name: `${mstKenn} ${featureLatest.properties.name} Status`,
            role: 'value',
            type: 'number',
            read: true,
            write: false,
            states: {
              1: this.systemLanguage === 'de' ? 'in Betrieb' : 'in operation',
              2: this.systemLanguage === 'de' ? 'defekt' : 'defective',
              3: this.systemLanguage === 'de' ? 'Testbetrieb' : 'test operation',
            },
          },
          native: {},
        };
        await this.setObjectAsync(`${mstKenn}.status`, objStatus);
        this.log.debug(`created state ${objStatus._id}`);
      }

      // set the value if value or timestamp changed
      const newState: ioBroker.SettableState = {
        val: featureLatest.properties.value,
        ack: true,
        ts: featureLatest.properties.end_measure ? new Date(featureLatest.properties.end_measure).getTime() : Date.now(),
        lc: Date.now(),
        q: featureLatest.properties.value !== null ? 0x00 : 0x81, // 0x00 = good, 0x81 = general problem by sensor
      };
      const currentState = await this.getStateAsync(`${mstKenn}.value`);
      if (!currentState || currentState.val !== (newState as ioBroker.State).val || currentState.ts !== (newState as ioBroker.State).ts) {
        await this.setStateAsync(`${mstKenn}.value`, newState);

        if (objValueCosmic) {
          (newState as ioBroker.State).val = featureLatest.properties.value_cosmic;
          await this.setStateAsync(`${mstKenn}.valueCosmic`, newState);
        }
        if (objValueTerrestrial) {
          (newState as ioBroker.State).val = featureLatest.properties.value_terrestrial;
          await this.setStateAsync(`${mstKenn}.valueTerrestrial`, newState);
        }
      }

      // set status
      await this.setStateAsync(`${mstKenn}.status`, featureLatest.properties.site_status, true);

      /*
       * check history when status is in operation and values are provided
       */
      if (featureLatest.properties.site_status === 1 && featureLatest.properties.end_measure && featureLatest.properties.value && featureLatest.properties.value_cosmic) {
        let updateHistory = false;

        // timerange for the history check
        const histroyEndDate = new Date(featureLatest.properties.end_measure);
        const historyEnd = histroyEndDate.getTime();
        const historyStart = histroyEndDate.setDate(histroyEndDate.getDate() - 7) + 100; // +1000 because we don't need same hour 7 days ago (would be the 169th value)

        const currentHistory: Record<string, Record<string, ioBroker.State[]>> = {};

        for (const obj of [objValue, objValueCosmic, objValueTerrestrial]) {
          if (!obj) continue;

          currentHistory[obj._id] = {};

          for (const historyKey in obj.common.custom) {
            // check if history is found and enabled
            if (historyKey.match(/^(history|influxdb|sql)\.\d+$/) && obj.common.custom[historyKey].enabled === true) {
              // history instance found and enabled
              this.log.debug(`history adapter ${historyKey} found for ${obj._id}`);

              // load current history in the given time range
              const getHistoryResult: GetHistoryResult = await this.sendToAsync(historyKey, 'getHistory', {
                id: obj._id,
                options: {
                  start: historyStart,
                  end: historyEnd,
                  ack: true,
                  aggregate: 'none',
                },
              });
              let tmpHistory = (getHistoryResult && Array.isArray(getHistoryResult.result)) ? getHistoryResult.result : [];
              tmpHistory = tmpHistory.filter((h) => h.ts >= historyStart && h.ts <= historyEnd); // need to filter because the history sometimes reports values out of requested ts range
              if (tmpHistory.length < 168) { // 24h * 7d = 168 values
                this.log.debug(`history ${historyKey} for ${obj._id} is incomplete (${tmpHistory.length} of 168 values)`);
                currentHistory[obj._id][historyKey] = tmpHistory;
                updateHistory = true;
              } else {
                this.log.debug(`history ${historyKey} for ${obj._id} seams to be complete`);
              }
            }
          }
        }

        // need to update any history?
        if (updateHistory) {
          this.log.debug(`need to update history for ${mstKenn}`);

          // get timeseries
          const resTimeseries = await axios.request<FeatureCollection<FeaturePropertiesTimeseries>>({
            url: this.urlTimeseries.replace('#kenn#', mstKenn),
            method: 'get',
            headers: {
              Accept: 'application/json',
              'User-Agent': `Mozilla/5.0 (compatible; ioBroker.odl/${this.version})`,
            },
            timeout: (this.config.timeout || 30) * 1000,
          })
            .catch((err) => {
              this.log.warn(`Error loading timeseries data for ${mstKenn} from server!`);
              this.log.warn(err);
              return null;
            });

          // check unloaded
          if (this.unloaded) {
            return;
          }

          if (!resTimeseries?.data) {
            this.log.warn(`Got no timeseries data for ${mstKenn}`);
            continue; // next mstKenn
          }

          this.log.debug(`got response for timeseries ${mstKenn}, http status ${resTimeseries.status} ${resTimeseries.statusText}`);

          if (resTimeseries.status !== 200) {
            this.log.warn(`Error loading timeseries data for ${mstKenn} from server!`);
            this.log.warn(`HTTP status ${resTimeseries.status} ${resTimeseries.statusText}`);
            this.log.debug(JSON.stringify(resTimeseries.data));
            continue; // next mstKenn
          }

          const featureCollectionTimeseries = resTimeseries.data;

          // check if we got data
          if (!featureCollectionTimeseries || !Array.isArray(featureCollectionTimeseries.features) || featureCollectionTimeseries.features.length === 0) {
            this.log.warn(`Got no timeseries data for ${mstKenn}`);
            continue; // next mstKenn
          }

          // loop over the three value objects to reuse code ;-)
          // cosmic and terrestrial may be null
          for (const obj of [objValue, objValueCosmic, objValueTerrestrial]) {
            if (!obj) continue;

            for (const historyKey in currentHistory[obj._id]) {
              const oldHistory = currentHistory[obj._id][historyKey];
              const newHistory: Partial<ioBroker.State>[] = [];

              // check each feature if it must be added to history
              for (const feature of featureCollectionTimeseries.features) {
                const endMeasureTs = new Date(feature.properties.end_measure).getTime();
                if (feature.properties.end_measure === featureLatest.properties.end_measure
                  || oldHistory.find((state) => (state.ts === endMeasureTs))) continue;

                // cosmic/terrestrial value must be calculated here because the API does not provied them as timeseries
                // but the cosmic part is fixed so we can use it from the latest feature
                let val: number;
                if (obj._id.endsWith('.valueCosmic')) {
                  // cosmic is fixed for each location
                  val = featureLatest.properties.value_cosmic;
                } else if (obj._id.endsWith('.valueTerrestrial')) {
                  // multiply and divide by 1000 to avoid floating point precision errors
                  val = (feature.properties.value * 1000 - featureLatest.properties.value_cosmic * 1000) / 1000;
                } else {
                  val = feature.properties.value;
                }

                this.log.debug(`adding ${val}@${feature.properties.end_measure} for ${obj._id} to ${historyKey}`);

                newHistory.push({
                  ts: endMeasureTs,
                  val,
                  ack: true,
                  from: 'system.adapter.' + this.namespace,
                  q: 0x00,
                });
              }

              // add sates to history
              if (newHistory.length > 0) {
                await this.sendToAsync(historyKey, 'storeState', {
                  id: obj._id,
                  state: newHistory,
                });
              }
            }
          }
        }
      }
    }
  }

}

if (require.main !== module) {
  // Export the constructor in compact mode
  module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new OdlAdapter(options);
} else {
  // otherwise start the instance directly
  (() => new OdlAdapter())();
}
