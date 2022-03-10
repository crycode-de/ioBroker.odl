"use strict";
/**
 * ioBroker ODL adapter.
 *
 * (C) 2019-2022 Peter Müller <peter@crycode.de> (https://github.com/crycode-de/ioBroker.odl)
 */
Object.defineProperty(exports, "__esModule", { value: true });
const utils = require("@iobroker/adapter-core");
const axios_1 = require("axios");
/**
 * The ODL adapter.
 */
class OdlAdapter extends utils.Adapter {
    /**
     * Constructor to create a new instance of the adapter.
     * @param options The adapter options.
     */
    constructor(options = {}) {
        super({
            ...options,
            name: 'odl',
        });
        /**
         * URL to get the latest data.
         */
        this.urlLatest = 'https://www.imis.bfs.de/ogc/opendata/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=opendata:odlinfo_odl_1h_latest&outputFormat=application/json';
        /**
         * URL to get the latest 168 features (24h * 7d = 168 features).
         * `#kenn#` will be replaced by the identifier.
         */
        this.urlTimeseries = 'https://www.imis.bfs.de/ogc/opendata/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=opendata:odlinfo_timeseries_odl_1h&outputFormat=application/json&viewparams=kenn:#kenn#&sortBy=end_measure+A&maxFeatures=168';
        /**
         * Timeout to force adapter exit after some time.
         */
        this.exitTimeout = null;
        /**
         * If the adapter is unloaded (should stop).
         */
        this.unloaded = false;
        /**
         * Configured system language.
         */
        this.systemLanguage = 'en';
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
    async onReady() {
        var _a, _b;
        let instObj = null;
        // adjust the schedule if not already adjusted
        try {
            instObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
            if (instObj && instObj.native && !instObj.native.scheduleAdjusted) {
                // adjust only if default schedule
                if (instObj.common.schedule === '30 * * * *') {
                    // create random schedule between 15 and 45
                    instObj.common.schedule = `${Math.floor(Math.random() * 31) + 15} * * * *`;
                }
                instObj.native.scheduleAdjusted = true;
                this.log.info(`Schedule adjusted to spread calls better over a half hour!`);
                await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, instObj);
                this.exit(utils.EXIT_CODES.NO_ERROR);
                return;
            }
        }
        catch (e) {
            this.log.error(`Could not check or adjust the schedule`);
        }
        // check schedule and if it's a scheduled start (at the scheduled time) and delay some seconds to better spread API calls
        if ((_a = instObj === null || instObj === void 0 ? void 0 : instObj.common) === null || _a === void 0 ? void 0 : _a.schedule) {
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
            }
            else {
                this.log.debug('seems to be not a scheduled adapter start, not delaying execution');
            }
        }
        // get the system language
        const objSystemConfig = await this.getForeignObjectAsync('system.config');
        this.systemLanguage = ((_b = objSystemConfig === null || objSystemConfig === void 0 ? void 0 : objSystemConfig.common) === null || _b === void 0 ? void 0 : _b.language) || 'en';
        this.log.debug(`system language: ${this.systemLanguage}`);
        this.log.debug('start reading data...');
        try {
            await this.read();
            this.log.debug('done');
        }
        catch (err) {
            this.log.error(`Error loading data: ${err}`);
        }
        this.exit(utils.EXIT_CODES.NO_ERROR);
    }
    /**
     * Adapter should unload.
     */
    onUnload(cb) {
        this.unloaded = true;
        cb && cb();
    }
    /**
     * Wait some time and continue if not unloaded.
     * @param ms Time to wait.
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(() => !this.unloaded && resolve(), ms));
    }
    /**
     * Terminate or exit the adapter.
     * @param code The exit code.
     */
    exit(code) {
        if (this.exitTimeout) {
            clearTimeout(this.exitTimeout);
        }
        this.terminate ? this.terminate(code) : process.exit(code);
    }
    /**
     * Read the data, create objects and states.
     */
    async read() {
        // read data from latest layer
        const resLatest = await axios_1.default.request({
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
        if (!(resLatest === null || resLatest === void 0 ? void 0 : resLatest.data)) {
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
                        }
                        else {
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
            }
            catch (e) {
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
            let objChan = await this.getObjectAsync(mstKenn);
            if ((objChan === null || objChan === void 0 ? void 0 : objChan.type) !== 'channel') {
                objChan = {
                    _id: `${this.namespace}.${mstKenn}`,
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
            let objValue = await this.getObjectAsync(mstKenn + '.value');
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
            let objValueCosmic = null;
            let objValueTerrestrial = null;
            if (this.config.useCosmicTerrestrial) {
                objValueCosmic = await this.getObjectAsync(mstKenn + '.valueCosmic');
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
                objValueTerrestrial = await this.getObjectAsync(mstKenn + '.valueTerrestrial');
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
            let objStatus = await this.getObjectAsync(mstKenn + '.status');
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
            const newState = {
                val: featureLatest.properties.value,
                ack: true,
                ts: featureLatest.properties.end_measure ? new Date(featureLatest.properties.end_measure).getTime() : Date.now(),
                lc: Date.now(),
                q: featureLatest.properties.value !== null ? 0x00 : 0x81, // 0x00 = good, 0x81 = general problem by sensor
            };
            const currentState = await this.getStateAsync(`${mstKenn}.value`);
            if (!currentState || currentState.val !== newState.val || currentState.ts !== newState.ts) {
                await this.setStateAsync(`${mstKenn}.value`, newState);
                if (objValueCosmic) {
                    newState.val = featureLatest.properties.value_cosmic;
                    await this.setStateAsync(`${mstKenn}.valueCosmic`, newState);
                }
                if (objValueTerrestrial) {
                    newState.val = featureLatest.properties.value_terrestrial;
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
                const currentHistory = {};
                for (const obj of [objValue, objValueCosmic, objValueTerrestrial]) {
                    if (!obj)
                        continue;
                    currentHistory[obj._id] = {};
                    for (const historyKey in obj.common.custom) {
                        // check if history is found and enabled
                        if (historyKey.match(/^(history|influxdb|sql)\.\d+$/) && obj.common.custom[historyKey].enabled === true) {
                            // history instance found and enabled
                            this.log.debug(`history adapter ${historyKey} found for ${obj._id}`);
                            // load current history in the given time range
                            const getHistoryResult = await this.sendToAsync(historyKey, 'getHistory', {
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
                            }
                            else {
                                this.log.debug(`history ${historyKey} for ${obj._id} seams to be complete`);
                            }
                        }
                    }
                }
                // need to update any history?
                if (updateHistory) {
                    this.log.debug(`need to update history for ${mstKenn}`);
                    // get timeseries
                    const resTimeseries = await axios_1.default.request({
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
                    if (!(resTimeseries === null || resTimeseries === void 0 ? void 0 : resTimeseries.data)) {
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
                        if (!obj)
                            continue;
                        for (const historyKey in currentHistory[obj._id]) {
                            const oldHistory = currentHistory[obj._id][historyKey];
                            const newHistory = [];
                            // check each feature if it must be added to history
                            for (const feature of featureCollectionTimeseries.features) {
                                const endMeasureTs = new Date(feature.properties.end_measure).getTime();
                                if (feature.properties.end_measure === featureLatest.properties.end_measure
                                    || oldHistory.find((state) => (state.ts === endMeasureTs)))
                                    continue;
                                // cosmic/terrestrial value must be calculated here because the API does not provied them as timeseries
                                // but the cosmic part is fixed so we can use it from the latest feature
                                let val;
                                if (obj._id.endsWith('.valueCosmic')) {
                                    // cosmic is fixed for each location
                                    val = featureLatest.properties.value_cosmic;
                                }
                                else if (obj._id.endsWith('.valueTerrestrial')) {
                                    // multiply and divide by 1000 to avoid floating point precision errors
                                    val = (feature.properties.value * 1000 - featureLatest.properties.value_cosmic * 1000) / 1000;
                                }
                                else {
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
    module.exports = (options) => new OdlAdapter(options);
}
else {
    // otherwise start the instance directly
    (() => new OdlAdapter())();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7OztHQUlHOztBQUVILGdEQUFnRDtBQUVoRCxpQ0FBMEI7QUFFMUI7O0dBRUc7QUFDSCxNQUFNLFVBQVcsU0FBUSxLQUFLLENBQUMsT0FBTztJQTRCcEM7OztPQUdHO0lBQ0gsWUFBWSxVQUF5QyxFQUFFO1FBQ3JELEtBQUssQ0FBQztZQUNKLEdBQUcsT0FBTztZQUNWLElBQUksRUFBRSxLQUFLO1NBQ1osQ0FBQyxDQUFDO1FBbENMOztXQUVHO1FBQ2MsY0FBUyxHQUFXLDZKQUE2SixDQUFDO1FBRW5NOzs7V0FHRztRQUNjLGtCQUFhLEdBQVcsNk5BQTZOLENBQUM7UUFFdlE7O1dBRUc7UUFDSyxnQkFBVyxHQUEwQixJQUFJLENBQUM7UUFFbEQ7O1dBRUc7UUFDSyxhQUFRLEdBQVksS0FBSyxDQUFDO1FBRWxDOztXQUVHO1FBQ0ssbUJBQWMsR0FBVyxJQUFJLENBQUM7UUFZcEMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUMxQyxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBRTVDLElBQUksQ0FBQyxXQUFXLEdBQUcsVUFBVSxDQUFDLEdBQUcsRUFBRTtZQUNqQyxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztZQUVyQixrRkFBa0Y7WUFDbEYsSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFO2dCQUNaLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLDZEQUE2RCxDQUFDLENBQUM7YUFDOUU7WUFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsNkJBQTZCLENBQUMsQ0FBQztR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