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
    async onReady() {
        this.log.debug('start reading data...');
        try {
            await this.read();
            this.log.debug('done');
        }
        catch (err) {
            this.log.error(`Error loading data: ${err}`);
        }
        this.exit(0);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7OztHQUlHOztBQUVILGdEQUFnRDtBQUVoRCxpQ0FBMEI7QUFFMUI7O0dBRUc7QUFDSCxNQUFNLFVBQVcsU0FBUSxLQUFLLENBQUMsT0FBTztJQVFwQzs7O09BR0c7SUFDSCxZQUFZLFVBQXlDLEVBQUU7UUFDckQsS0FBSyxDQUFDO1lBQ0osR0FBRyxPQUFPO1lBQ1YsSUFBSSxFQUFFLEtBQUs7U0FDWixDQUFDLENBQUM7UUFkWSxRQUFHLEdBQVcscVBBQXFQLENBQUM7UUFFcFEsY0FBUyxHQUFXLDZjQUE2YyxDQUFDO1FBRTNlLGdCQUFXLEdBQTBCLElBQUksQ0FBQztRQVloRCxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUV2QyxJQUFJLENBQUMsV0FBVyxHQUFHLFVBQVUsQ0FBQyxHQUFHLEVBQUU7WUFDakMsa0ZBQWtGO1lBQ2xGLElBQUksSUFBSSxDQUFDLEdBQUcsRUFBRTtnQkFDWixJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyw2REFBNkQsQ0FBQyxDQUFDO2FBQzlFO1lBQ0QsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLDZCQUE2QixDQUFDLENBQUM7UUFDNUQsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsYUFBYTtJQUMzQixDQUFDO0lBRUQ7O09BRUc7SUFDSyxLQUFLLENBQUMsT0FBTztRQUNuQixJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBRXhDLElBQUk7WUFDRixNQUFNLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNsQixJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztTQUN4QjtR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