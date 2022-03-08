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
        this.url = 'https://www.imis.bfs.de/ogc/opendata/ows?&service=WFS&version=1.1.0&request=GetFeature&typeName=opendata%3Aodl_brutto_1h_timeseries&outputFormat=application%2Fjson&filter=#filter#&sortBy=end_measure&viewparams=locality_code%3A#localityCode#%3B';
        this.filterTpl = '<Filter xmlns="http://www.opengis.net/ogc" xmlns:ogc="http://www.opengis.net/ogc" xmlns:gml="http://www.opengis.net/gml"><And><PropertyIsBetween><PropertyName>end_measure</PropertyName><LowerBoundary><Literal>#from#</Literal></LowerBoundary><UpperBoundary><Literal>#to#</Literal></UpperBoundary></PropertyIsBetween><Or><ogc:PropertyIsEqualTo><ogc:PropertyName>source</ogc:PropertyName><ogc:Literal>BfS</ogc:Literal></ogc:PropertyIsEqualTo></Or></And></Filter>';
        this.exitTimeout = null;
        /**
         * If the adapter is unloaded (should stop).
         */
        this.unloaded = false;
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
        var _a;
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
        // check if it's a scheduled start (at the scheduled time) and delay some seconds to better spread API calls
        if ((_a = instObj === null || instObj === void 0 ? void 0 : instObj.common) === null || _a === void 0 ? void 0 : _a.schedule) {
            const minuteSchedule = parseInt(instObj.common.schedule.split(/\s/)[0], 10);
            const date = new Date();
            if (minuteSchedule === date.getMinutes() && date.getSeconds() < 10) {
                const delay = Math.floor(Math.random() * 60000);
                this.log.debug(`Delay execution by ${delay}ms to better spread API calls`);
                await this.sleep(delay);
            }
            else {
                this.log.debug('Seems to be not a scheduled adapter start. Not delaying execution.');
            }
        }
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
    async read() {
        for (let i = 0; i < this.config.localityCode.length; i++) {
            // check unloaded
            if (this.unloaded) {
                return;
            }
            // load channel and state object info
            let objChan = await this.getObjectAsync(this.config.localityCode[i]);
            let objState = await this.getObjectAsync(this.config.localityCode[i] + '.odl');
            // create channel if not exists or type is not channel to fix creation error from < v1.1.1
            if (!objChan || objChan.type !== 'channel') {
                objChan = {
                    _id: `${this.namespace}.${this.config.localityCode[i]}`,
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
            }
            else if (objState.type !== 'state') {
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
    async readLocality(loc, objChan, objState) {
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
        const res = await axios_1.default.request({
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
        if (!(res === null || res === void 0 ? void 0 : res.data)) {
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
        const featureCollection = res.data;
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
        const newState = {
            val: lastFeature.properties.value,
            ack: true,
            ts: new Date(lastFeature.properties.end_measure).getTime(),
            lc: Date.now()
        };
        const currentState = await this.getStateAsync(odlStateId);
        if (!currentState || currentState.val !== newState.val || currentState.ts !== newState.ts) {
            await this.setStateAsync(odlStateId, newState);
        }
        // add older features to each enabled history instance if they are not already present
        for (const historyKey in objState.common.custom) {
            // check if history is found and enabled
            if (historyKey.match(/^(history|influxdb|sql)\.\d+$/) && objState.common.custom[historyKey].enabled === true) {
                // history instance found and enabled
                this.log.debug(`history adapter ${historyKey} found for ${loc}`);
                // load current history in the given time range
                const getHistoryResult = await this.sendToAsync(historyKey, 'getHistory', {
                    id: objState._id,
                    options: {
                        start: from.getTime(),
                        end: to.getTime(),
                        ack: true,
                        aggregate: 'none'
                    }
                });
                const currentHistory = (getHistoryResult && Array.isArray(getHistoryResult.result)) ? getHistoryResult.result : [];
                const newHistory = [];
                // check each feature if it must be added to history
                featureCollection.features.forEach((feature) => {
                    const endMeasure = new Date(feature.properties.end_measure).getTime();
                    if (feature.properties.end_measure === lastFeature.properties.end_measure
                        || currentHistory.find((state) => (state.ts === endMeasure)))
                        return;
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
    module.exports = (options) => new OdlAdapter(options);
}
else {
    // otherwise start the instance directly
    (() => new OdlAdapter())();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7OztHQUlHOztBQUVILGdEQUFnRDtBQUVoRCxpQ0FBMEI7QUFFMUI7O0dBRUc7QUFDSCxNQUFNLFVBQVcsU0FBUSxLQUFLLENBQUMsT0FBTztJQWFwQzs7O09BR0c7SUFDSCxZQUFZLFVBQXlDLEVBQUU7UUFDckQsS0FBSyxDQUFDO1lBQ0osR0FBRyxPQUFPO1lBQ1YsSUFBSSxFQUFFLEtBQUs7U0FDWixDQUFDLENBQUM7UUFuQlksUUFBRyxHQUFXLHFQQUFxUCxDQUFDO1FBRXBRLGNBQVMsR0FBVyw2Y0FBNmMsQ0FBQztRQUUzZSxnQkFBVyxHQUEwQixJQUFJLENBQUM7UUFFbEQ7O1dBRUc7UUFDSyxhQUFRLEdBQVksS0FBSyxDQUFDO1FBWWhDLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDMUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUU1QyxJQUFJLENBQUMsV0FBVyxHQUFHLFVBQVUsQ0FBQyxHQUFHLEVBQUU7WUFDakMsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUM7WUFFckIsa0ZBQWtGO1lBQ2xGLElBQUksSUFBSSxDQUFDLEdBQUcsRUFBRTtnQkFDWixJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyw2REFBNkQsQ0FBQyxDQUFDO2FBQzlFO1lBQ0QsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLDZCQUE2QixDQUFDLENBQUM7UUFDNUQsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsYUFBYTtJQUMzQixDQUFDO0lBRUQ7O09BRUc7SUFDSyxLQUFLLENBQUMsT0FBTzs7UUFDbkIsSUFBSSxPQUFPLEdBQStDLElBQUksQ0FBQztRQUUvRCw4Q0FBOEM7UUFDOUMsSUFBSTtZQUNGLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxrQkFBa0IsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFDL0UsSUFBSSxPQUFPLElBQUksT0FBTyxDQUFDLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLEVBQUU7Z0JBQ2pFLGtDQUFrQztnQkFDbEMsSUFBSSxPQUFPLENBQUMsTUFBTSxDQUFDLFFBQVEsS0FBSyxZQUFZLEVBQUU7b0JBQzVDLDJDQUEyQztvQkFDM0MsT0FBTyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLFVBQVUsQ0FBQztpQkFDNUU7Z0JBQ0EsT0FBTyxDQUFDLE1BQWlDLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO2dCQUNuRSxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyw0REFBNEQsQ0FBQyxDQUFDO2dCQUM1RSxNQUFNLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxrQkFBa0IsSUFBSSxDQUFDLFNBQVMsRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUM5RSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ3JDLE9BQU87YUFDUjtTQUNGO1FBQUMsT0FBTyxDQUFDLEVBQUU7WUFDVixJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO1NBQzFEO1FBRUQsNEdBQTRHO1FBQzVHLElBQUksTUFBQSxPQUFPLGFBQVAsT0FBTyx1QkFBUCxPQUFPLENBQUUsTUFBTSwwQ0FBRSxRQUFRLEVBQUU7WUFDN0IsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUM1RSxNQUFNLElBQUksR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1lBQ3hCLElBQUksY0FBYyxLQUFLLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLEdBQUcsRUFBRSxFQUFFO2dCQUNsRSxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsQ0FBQztnQkFDaEQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsc0JBQXNCLEtBQUssK0JBQStCLENBQUMsQ0FBQztnQkFDM0UsTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO2FBQ3pCO2lCQUFNO2dCQUNMLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLG9FQUFvRSxDQUFDLENBQUM7YUFDdEY7U0FDRjtRQUVELElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFFeEMsSUFBSTtZQUNGLE1BQU0sSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2xCLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1NBQ3hCO1FBQUMsT0FBTyxHQUFHLEVBQUU7WUFDWixJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsR0FBRyxFQUFFLENBQUMsQ0FBQztTQUM5QztRQUVELElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUN2QyxDQUFDO0lBRUQ7O09BRUc7SUFDSyxRQUFRLENBQUUsRUFBYztRQUM5QixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztRQUNyQixFQUFFLElBQUksRUFBRSxFQUFFLENBQUM7SUFDYixDQUFDO0lBRUQ7OztPQUdHO0lBQ0ssS0FBSyxDQUFFLEVBQVU7UUFDdkIsT0FBTyxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksT0FBTyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNuRixDQUFDO0lBRUQ7OztPQUdHO0lBQ0ssSUFBSSxDQUFFLElBQVk7UUFDeEIsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFO1lBQ3BCLFlBQVksQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7U0FDaEM7UUFFRCxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzdELENBQUM7SUFFTyxLQUFLLENBQUMsSUFBSTtRQUNoQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1lBRXhELGlCQUFpQjtZQUNqQixJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUU7Z0JBQ2pCLE9BQU87YUFDUjtZQUVELHFDQUFxQztZQUNyQyxJQUFJLE9BQU8sR0FBa0MsTUFBTSxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFrQyxDQUFDO1lBQ3JJLElBQUksUUFBUSxHQUFnQyxNQUFNLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFnQyxDQUFDO1lBRTNJLDBGQUEwRjtZQUMxRixJQUFJLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssU0FBUyxFQUFFO2dCQUMxQyxPQUFPLEdBQUc7b0JBQ1IsR0FBRyxFQUFDLEdBQUcsSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsRUFBRTtvQkFDdEQsSUFBSSxFQUFFLFNBQVM7b0JBQ2YsTUFBTSxFQUFFO3dCQUNOLElBQUksRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7cUJBQ2xDO29CQUNELE1BQU0sRUFBRSxFQUFFO2lCQUNYLENBQUM7Z0JBQ0YsTUFBTSxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUNoRSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7YUFDbEQ7WUFFRCxvQ0FBb0M7WUFDcEMsSUFBSSxDQUFDLFFBQVEsRUFBRTtnQkFDYixRQUFRLEdBQUc7b0JBQ1QsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsTUFBTTtvQkFDM0QsSUFBSSxFQUFFLE9BQU87b0JBQ2IsTUFBTSxFQUFFO3dCQUNOLElBQUksRUFBRSxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO3dCQUMxQyxJQUFJLEVBQUUsT0FBTzt3QkFDYixJQUFJLEVBQUUsUUFBUTt3QkFDZCxJQUFJLEVBQUUsT0FBTzt3QkFDYixJQUFJLEVBQUUsSUFBSTt3QkFDVixLQUFLLEVBQUUsS0FBSztxQkFDYjtvQkFDRCxNQUFNLEVBQUUsRUFBRTtpQkFDWCxDQUFDO2dCQUNGLE1BQU0sSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBQzFFLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGlCQUFpQixRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztnQkFFbEQsa0ZBQWtGO2FBQ2pGO2lCQUFNLElBQUksUUFBUSxDQUFDLElBQUksS0FBSyxPQUFPLEVBQUU7Z0JBQ3BDLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRTtvQkFDakUsSUFBSSxFQUFFLE9BQU87b0JBQ2IsTUFBTSxFQUFFO3dCQUNOLElBQUksRUFBRSxPQUFPO3dCQUNiLElBQUksRUFBRSxRQUFRO3dCQUNkLElBQUksRUFBRSxPQUFPO3dCQUNiLElBQUksRUFBRSxJQUFJO3dCQUNWLEtBQUssRUFBRSxLQUFLO3FCQUNiO2lCQUNGLENBQUMsQ0FBQztnQkFDSCxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxpQkFBaUIsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7YUFDakQ7WUFFRCxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1NBQ3pFO0lBQ0gsQ0FBQztJQUVPLEtBQUssQ0FBQyxZQUFZLENBQUUsR0FBVyxFQUFFLE9BQStCLEVBQUUsUUFBOEI7UUFDdEcsTUFBTSxVQUFVLEdBQUcsR0FBRyxHQUFHLE1BQU0sQ0FBQztRQUVoQyxNQUFNLEVBQUUsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1FBQ3RCLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakIsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqQixFQUFFLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXRCLE1BQU0sSUFBSSxHQUFHLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzFCLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBRTdELHFCQUFxQjtRQUNyQixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUN0RyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsa0JBQWtCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUV4SCxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxXQUFXLEdBQUcsS0FBSyxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBRXpDLFlBQVk7UUFDWixNQUFNLEdBQUcsR0FBRyxNQUFNLGVBQUssQ0FBQyxPQUFPLENBQW9CO1lBQ2pELEdBQUc7WUFDSCxNQUFNLEVBQUUsS0FBSztZQUNiLE9BQU8sRUFBRTtnQkFDUCxNQUFNLEVBQUUsa0JBQWtCO2dCQUMxQixZQUFZLEVBQUUseUNBQXlDLElBQUksQ0FBQyxPQUFPLEdBQUc7YUFDdkU7WUFDRCxPQUFPLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sSUFBSSxFQUFFLENBQUMsR0FBRyxJQUFJO1NBQzVDLENBQUM7YUFDQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRTtZQUNiLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxDQUFDLENBQUM7WUFDakQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbkIsT0FBTyxJQUFJLENBQUM7UUFDZCxDQUFDLENBQUMsQ0FBQztRQUVMLGlCQUFpQjtRQUNqQixJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUU7WUFDakIsT0FBTztTQUNSO1FBRUQsSUFBSSxDQUFDLENBQUEsR0FBRyxhQUFILEdBQUcsdUJBQUgsR0FBRyxDQUFFLElBQUksQ0FBQSxFQUFFO1lBQ2QsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsRUFBRSxDQUFDLENBQUM7WUFDeEMsT0FBTztTQUNSO1FBRUQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsb0JBQW9CLEdBQUcsaUJBQWlCLEdBQUcsQ0FBQyxNQUFNLElBQUksR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFFdkYsSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLEdBQUcsRUFBRTtZQUN0QixJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO1lBQ2pELElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGVBQWUsR0FBRyxDQUFDLE1BQU0sSUFBSSxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztZQUM3RCxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ3pDLE9BQU87U0FDUjtRQUVELE1BQU0saUJBQWlCLEdBQXNCLEdBQUcsQ0FBQyxJQUFJLENBQUM7UUFFdEQsdUJBQXVCO1FBQ3ZCLElBQUksQ0FBQyxpQkFBaUIsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLEVBQUU7WUFDcEUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsRUFBRSxDQUFDLENBQUM7WUFDeEMsT0FBTztTQUNSO1FBRUQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsaUJBQWlCLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxNQUFNLGlCQUFpQixHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBRXpGLG1FQUFtRTtRQUNuRSxNQUFNLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztRQUV0RixtRUFBbUU7UUFDbkUsSUFBSSxDQUFDLFdBQVcsRUFBRTtZQUNoQixJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxFQUFFLENBQUMsQ0FBQztZQUN4QyxPQUFPO1NBQ1I7UUFFRCxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsR0FBRyxLQUFLLFdBQVcsQ0FBQyxVQUFVLENBQUMsYUFBYSxNQUFNLFdBQVcsQ0FBQyxVQUFVLENBQUMsS0FBSyxJQUFJLFdBQVcsQ0FBQyxVQUFVLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUV6SixpRUFBaUU7UUFDakUsSUFBSSxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxXQUFXLENBQUMsVUFBVSxDQUFDLGFBQWEsRUFBRTtZQUNoRSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsR0FBRyxLQUFLLFdBQVcsQ0FBQyxVQUFVLENBQUMsYUFBYSxHQUFHLENBQUMsQ0FBQztZQUVuRixNQUFNLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLEVBQUU7Z0JBQ2hDLE1BQU0sRUFBRTtvQkFDTixJQUFJLEVBQUUsV0FBVyxDQUFDLFVBQVUsQ0FBQyxhQUFhO2lCQUMzQzthQUNGLENBQUMsQ0FBQztZQUVILE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsRUFBRTtnQkFDdkMsTUFBTSxFQUFFO29CQUNOLElBQUksRUFBRSxNQUFNLEdBQUcsV0FBVyxDQUFDLFVBQVUsQ0FBQyxhQUFhO2lCQUNwRDthQUNGLENBQUMsQ0FBQztTQUNKO1FBRUQsNkZBQTZGO1FBQzdGLE1BQU0sUUFBUSxHQUEyQjtZQUN2QyxHQUFHLEVBQUUsV0FBVyxDQUFDLFVBQVUsQ0FBQyxLQUFLO1lBQ2pDLEdBQUcsRUFBRSxJQUFJO1lBQ1QsRUFBRSxFQUFFLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUMsT0FBTyxFQUFFO1lBQzFELEVBQUUsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFO1NBQ2YsQ0FBQztRQUNGLE1BQU0sWUFBWSxHQUFHLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUUxRCxJQUFJLENBQUMsWUFBWSxJQUFJLFlBQVksQ0FBQyxHQUFHLEtBQU0sUUFBMkIsQ0FBQyxHQUFHLElBQUksWUFBWSxDQUFDLEVBQUUsS0FBTSxRQUEyQixDQUFDLEVBQUUsRUFBRTtZQUNqSSxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1NBQ2hEO1FBRUQsc0ZBQXNGO1FBQ3RGLEtBQUssTUFBTSxVQUFVLElBQUksUUFBUSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUU7WUFDL0Msd0NBQXdDO1lBQ3hDLElBQUksVUFBVSxDQUFDLEtBQUssQ0FBQywrQkFBK0IsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLE9BQU8sS0FBSyxJQUFJLEVBQUU7Z0JBQzVHLHFDQUFxQztnQkFDckMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsbUJBQW1CLFVBQVUsY0FBYyxHQUFHLEVBQUUsQ0FBQyxDQUFDO2dCQUVqRSwrQ0FBK0M7Z0JBQy9DLE1BQU0sZ0JBQWdCLEdBQXFCLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsWUFBWSxFQUFFO29CQUMxRixFQUFFLEVBQUUsUUFBUSxDQUFDLEdBQUc7b0JBQ2hCLE9BQU8sRUFBRTt3QkFDUCxLQUFLLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRTt3QkFDckIsR0FBRyxFQUFFLEVBQUUsQ0FBQyxPQUFPLEVBQUU7d0JBQ2pCLEdBQUcsRUFBRSxJQUFJO3dCQUNULFNBQVMsRUFBRSxNQUFNO3FCQUNsQjtpQkFDRixDQUFDLENBQUM7Z0JBQ0gsTUFBTSxjQUFjLEdBQXFCLENBQUMsZ0JBQWdCLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFFckksTUFBTSxVQUFVLEdBQThCLEVBQUUsQ0FBQztnQkFFakQsb0RBQW9EO2dCQUNwRCxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7b0JBQzdDLE1BQU0sVUFBVSxHQUFHLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQ3RFLElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxXQUFXLEtBQUssV0FBVyxDQUFDLFVBQVUsQ0FBQyxXQUFXOzJCQUNwRSxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLEtBQUssVUFBVSxDQUFDLENBQUM7d0JBQUUsT0FBTztvQkFFdkUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxPQUFPLENBQUMsVUFBVSxDQUFDLEtBQUssSUFBSSxPQUFPLENBQUMsVUFBVSxDQUFDLFdBQVcsUUFBUSxHQUFHLE9BQU8sVUFBVSxFQUFFLENBQUMsQ0FBQztvQkFDbkgsVUFBVSxDQUFDLElBQUksQ0FBQzt3QkFDZCxFQUFFLEVBQUUsVUFBVTt3QkFDZCxHQUFHLEVBQUUsT0FBTyxDQUFDLFVBQVUsQ0FBQyxLQUFLO3dCQUM3QixHQUFHLEVBQUUsSUFBSTt3QkFDVCxJQUFJLEVBQUUsaUJBQWlCLEdBQUcsSUFBSSxDQUFDLFNBQVM7d0JBQ3hDLENBQUMsRUFBRSxDQUFDO3FCQUNMLENBQUMsQ0FBQztnQkFDTCxDQUFDLENBQUMsQ0FBQztnQkFFSCx1QkFBdUI7Z0JBQ3ZCLElBQUksVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7b0JBQ3pCLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsWUFBWSxFQUFFO3dCQUMvQyxFQUFFLEVBQUUsUUFBUSxDQUFDLEdBQUc7d0JBQ2hCLEtBQUssRUFBRSxVQUFVO3FCQUNsQixDQUFDLENBQUM7aUJBQ0o7YUFDRjtTQUNGO0lBQ0gsQ0FBQztDQUNGO0FBRUQsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFO0lBQ2pCLHlDQUF5QztJQUN6QyxNQUFNLENBQUMsT0FBTyxHQUFHLENBQUMsT0FBa0QsRUFBRSxFQUFFLENBQUMsSUFBSSxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7Q0FDbEc7S0FBTTtJQUNMLHdDQUF3QztJQUN4QyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksVUFBVSxFQUFFLENBQUMsRUFBRSxDQUFDO0NBQzVCIn0=