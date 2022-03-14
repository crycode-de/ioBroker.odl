var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __markAsModule = (target) => __defProp(target, "__esModule", { value: true });
var __reExport = (target, module2, copyDefault, desc) => {
  if (module2 && typeof module2 === "object" || typeof module2 === "function") {
    for (let key of __getOwnPropNames(module2))
      if (!__hasOwnProp.call(target, key) && (copyDefault || key !== "default"))
        __defProp(target, key, { get: () => module2[key], enumerable: !(desc = __getOwnPropDesc(module2, key)) || desc.enumerable });
  }
  return target;
};
var __toESM = (module2, isNodeMode) => {
  return __reExport(__markAsModule(__defProp(module2 != null ? __create(__getProtoOf(module2)) : {}, "default", !isNodeMode && module2 && module2.__esModule ? { get: () => module2.default, enumerable: true } : { value: module2, enumerable: true })), module2);
};
var utils = __toESM(require("@iobroker/adapter-core"));
var import_axios = __toESM(require("axios"));
class OdlAdapter extends utils.Adapter {
  constructor(options = {}) {
    super(__spreadProps(__spreadValues({}, options), {
      name: "odl"
    }));
    this.urlLatest = "https://www.imis.bfs.de/ogc/opendata/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=opendata:odlinfo_odl_1h_latest&outputFormat=application/json";
    this.urlTimeseries = "https://www.imis.bfs.de/ogc/opendata/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=opendata:odlinfo_timeseries_odl_1h&outputFormat=application/json&viewparams=kenn:#kenn#&sortBy=end_measure+A&maxFeatures=168";
    this.exitTimeout = null;
    this.unloaded = false;
    this.systemLanguage = "en";
    this.on("ready", this.onReady.bind(this));
    this.on("unload", this.onUnload.bind(this));
    this.exitTimeout = setTimeout(() => {
      this.unloaded = true;
      if (this.log) {
        this.log.warn(`Adapter did not exit within 10 minutes. Will now terminate!`);
      }
      this.exit(utils.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION);
    }, 6e5);
  }
  async onReady() {
    var _a, _b;
    let instObj = null;
    try {
      instObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
      if (((_a = instObj == null ? void 0 : instObj.common) == null ? void 0 : _a.schedule) === "30 * * * *") {
        const second = Math.floor(Math.random() * 60);
        const minute = Math.floor(Math.random() * 31) + 15;
        instObj.common.schedule = `${second} ${minute} * * * *`;
        this.log.info(`Schedule adjusted to spread calls better over a half hour!`);
        await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, instObj);
        this.exit(utils.EXIT_CODES.NO_ERROR);
        return;
      }
    } catch (e) {
      this.log.error(`Could not check or adjust the schedule`);
    }
    const objSystemConfig = await this.getForeignObjectAsync("system.config");
    this.systemLanguage = ((_b = objSystemConfig == null ? void 0 : objSystemConfig.common) == null ? void 0 : _b.language) || "en";
    this.log.debug(`system language: ${this.systemLanguage}`);
    if (this.config.msts.length > 10) {
      this.log.debug("More than 10 measuring points are configured, so the history update will be disabled.");
      this.config.updateHistory = false;
    }
    this.log.debug("start reading data...");
    try {
      await this.read();
      this.log.debug("done");
    } catch (err) {
      this.log.error(`Error loading data: ${err}`);
    }
    this.exit(utils.EXIT_CODES.NO_ERROR);
  }
  onUnload(cb) {
    this.unloaded = true;
    cb && cb();
  }
  exit(code) {
    if (this.exitTimeout) {
      clearTimeout(this.exitTimeout);
    }
    this.terminate ? this.terminate(code) : process.exit(code);
  }
  async read() {
    const resLatest = await import_axios.default.request({
      url: this.urlLatest,
      method: "get",
      headers: {
        Accept: "application/json",
        "User-Agent": `Mozilla/5.0 (compatible; ioBroker.odl/${this.version})`
      },
      timeout: (this.config.timeout || 30) * 1e3
    }).catch((err) => {
      this.log.warn("Error loading latest data from server!");
      this.log.warn(err);
      return null;
    });
    if (this.unloaded) {
      return;
    }
    if (!(resLatest == null ? void 0 : resLatest.data)) {
      this.log.warn(`Got no data for latest layer`);
      return;
    }
    this.log.debug(`got response for latest, http status ${resLatest.status} ${resLatest.statusText}`);
    if (resLatest.status !== 200) {
      this.log.warn("Error loading latest data from server!");
      this.log.warn(`HTTP status ${resLatest.status} ${resLatest.statusText}`);
      this.log.debug(JSON.stringify(resLatest.data));
      return;
    }
    const featureCollectionLatest = resLatest.data;
    if (!featureCollectionLatest || !Array.isArray(featureCollectionLatest.features) || featureCollectionLatest.features.length === 0) {
      this.log.warn(`Got no data for latest layer`);
      return;
    }
    if (Array.isArray(this.config.localityCode) && this.config.localityCode.length > 0) {
      this.log.info("Found outdated configuration. Will now migrate this from locality codes to identifiers.");
      try {
        const instObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
        if (instObj) {
          instObj.native = __spreadValues({}, this.config);
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
            this.log.warn("Please check and transfer your history configurations from the old objects to the new ones. Also you may delete the old DEZ\u2026 objects as they are no longer used now.");
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
      if (this.unloaded) {
        return;
      }
      const featureLatest = featureCollectionLatest.features.find((f) => f.properties.kenn === mstKenn);
      if (!featureLatest) {
        this.log.warn(`Identifier ${mstKenn} not found in latest data!`);
        continue;
      }
      let objChan = await this.getObjectAsync(mstKenn);
      if ((objChan == null ? void 0 : objChan.type) !== "channel") {
        objChan = {
          _id: `${this.namespace}.${mstKenn}`,
          type: "channel",
          common: {
            name: `${mstKenn} - ${featureLatest.properties.plz} ${featureLatest.properties.name}`
          },
          native: {}
        };
        await this.setObjectAsync(mstKenn, objChan);
        this.log.debug(`created channel ${objChan._id}`);
      }
      let objValue = await this.getObjectAsync(mstKenn + ".value");
      if (!objValue) {
        objValue = {
          _id: `${this.namespace}.${mstKenn}.value`,
          type: "state",
          common: {
            name: this.systemLanguage === "de" ? `${mstKenn} - ${featureLatest.properties.plz} ${featureLatest.properties.name} ODL` : `${mstKenn} ${featureLatest.properties.name} ADR`,
            role: "value",
            type: "number",
            unit: "\xB5Sv/h",
            read: true,
            write: false
          },
          native: {}
        };
        await this.setObjectAsync(`${mstKenn}.value`, objValue);
        this.log.debug(`created state ${objValue._id}`);
      }
      let objValueCosmic = null;
      let objValueTerrestrial = null;
      if (this.config.useCosmicTerrestrial) {
        objValueCosmic = await this.getObjectAsync(mstKenn + ".valueCosmic");
        if (!objValueCosmic) {
          objValueCosmic = {
            _id: `${this.namespace}.${mstKenn}.valueCosmic`,
            type: "state",
            common: {
              name: this.systemLanguage === "de" ? `${mstKenn} - ${featureLatest.properties.plz} ${featureLatest.properties.name} ODL kosmisch` : `${mstKenn} ${featureLatest.properties.name} ADR cosmic`,
              role: "value",
              type: "number",
              unit: "\xB5Sv/h",
              read: true,
              write: false
            },
            native: {}
          };
          await this.setObjectAsync(`${mstKenn}.valueCosmic`, objValueCosmic);
          this.log.debug(`created state ${objValueCosmic._id}`);
        }
        objValueTerrestrial = await this.getObjectAsync(mstKenn + ".valueTerrestrial");
        if (!objValueTerrestrial) {
          objValueTerrestrial = {
            _id: `${this.namespace}.${mstKenn}.valueTerrestrial`,
            type: "state",
            common: {
              name: this.systemLanguage === "de" ? `${mstKenn} - ${featureLatest.properties.plz} ${featureLatest.properties.name} ODL terrestrisch` : `${mstKenn} ${featureLatest.properties.name} ADR terrestrial`,
              role: "value",
              type: "number",
              unit: "\xB5Sv/h",
              read: true,
              write: false
            },
            native: {}
          };
          await this.setObjectAsync(`${mstKenn}.valueTerrestrial`, objValueTerrestrial);
          this.log.debug(`created state ${objValueTerrestrial._id}`);
        }
      }
      let objStatus = await this.getObjectAsync(mstKenn + ".status");
      if (!objStatus) {
        objStatus = {
          _id: `${this.namespace}.${mstKenn}.status`,
          type: "state",
          common: {
            name: `${mstKenn} - ${featureLatest.properties.plz} ${featureLatest.properties.name} Status`,
            role: "value",
            type: "number",
            read: true,
            write: false,
            states: {
              1: this.systemLanguage === "de" ? "in Betrieb" : "in operation",
              2: this.systemLanguage === "de" ? "defekt" : "defective",
              3: this.systemLanguage === "de" ? "Testbetrieb" : "test operation"
            }
          },
          native: {}
        };
        await this.setObjectAsync(`${mstKenn}.status`, objStatus);
        this.log.debug(`created state ${objStatus._id}`);
      }
      const newState = {
        val: featureLatest.properties.value,
        ack: true,
        ts: featureLatest.properties.end_measure ? new Date(featureLatest.properties.end_measure).getTime() : Date.now(),
        lc: Date.now(),
        q: featureLatest.properties.value !== null ? 0 : 129
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
      await this.setStateAsync(`${mstKenn}.status`, featureLatest.properties.site_status, true);
      if (this.config.updateHistory && featureLatest.properties.site_status === 1 && featureLatest.properties.end_measure && featureLatest.properties.value && featureLatest.properties.value_cosmic) {
        let updateHistory = false;
        const histroyEndDate = new Date(featureLatest.properties.end_measure);
        const historyEnd = histroyEndDate.getTime();
        const historyStart = histroyEndDate.setDate(histroyEndDate.getDate() - 7) + 100;
        const currentHistory = {};
        for (const obj of [objValue, objValueCosmic, objValueTerrestrial]) {
          if (!obj)
            continue;
          currentHistory[obj._id] = {};
          for (const historyKey in obj.common.custom) {
            if (historyKey.match(/^(history|influxdb|sql)\.\d+$/) && obj.common.custom[historyKey].enabled === true) {
              this.log.debug(`history adapter ${historyKey} found for ${obj._id}`);
              const getHistoryResult = await this.sendToAsync(historyKey, "getHistory", {
                id: obj._id,
                options: {
                  start: historyStart,
                  end: historyEnd,
                  ack: true,
                  aggregate: "none"
                }
              });
              let tmpHistory = getHistoryResult && Array.isArray(getHistoryResult.result) ? getHistoryResult.result : [];
              tmpHistory = tmpHistory.filter((h) => h.ts >= historyStart && h.ts <= historyEnd);
              if (tmpHistory.length < 168) {
                this.log.debug(`history ${historyKey} for ${obj._id} is incomplete (${tmpHistory.length} of 168 values)`);
                currentHistory[obj._id][historyKey] = tmpHistory;
                updateHistory = true;
              } else {
                this.log.debug(`history ${historyKey} for ${obj._id} seams to be complete`);
              }
            }
          }
        }
        if (updateHistory) {
          this.log.debug(`need to update history for ${mstKenn}`);
          const resTimeseries = await import_axios.default.request({
            url: this.urlTimeseries.replace("#kenn#", mstKenn),
            method: "get",
            headers: {
              Accept: "application/json",
              "User-Agent": `Mozilla/5.0 (compatible; ioBroker.odl/${this.version})`
            },
            timeout: (this.config.timeout || 30) * 1e3
          }).catch((err) => {
            this.log.warn(`Error loading timeseries data for ${mstKenn} from server!`);
            this.log.warn(err);
            return null;
          });
          if (this.unloaded) {
            return;
          }
          if (!(resTimeseries == null ? void 0 : resTimeseries.data)) {
            this.log.warn(`Got no timeseries data for ${mstKenn}`);
            continue;
          }
          this.log.debug(`got response for timeseries ${mstKenn}, http status ${resTimeseries.status} ${resTimeseries.statusText}`);
          if (resTimeseries.status !== 200) {
            this.log.warn(`Error loading timeseries data for ${mstKenn} from server!`);
            this.log.warn(`HTTP status ${resTimeseries.status} ${resTimeseries.statusText}`);
            this.log.debug(JSON.stringify(resTimeseries.data));
            continue;
          }
          const featureCollectionTimeseries = resTimeseries.data;
          if (!featureCollectionTimeseries || !Array.isArray(featureCollectionTimeseries.features) || featureCollectionTimeseries.features.length === 0) {
            this.log.warn(`Got no timeseries data for ${mstKenn}`);
            continue;
          }
          for (const obj of [objValue, objValueCosmic, objValueTerrestrial]) {
            if (!obj)
              continue;
            for (const historyKey in currentHistory[obj._id]) {
              const oldHistory = currentHistory[obj._id][historyKey];
              const newHistory = [];
              for (const feature of featureCollectionTimeseries.features) {
                const endMeasureTs = new Date(feature.properties.end_measure).getTime();
                if (feature.properties.end_measure === featureLatest.properties.end_measure || oldHistory.find((state) => state.ts === endMeasureTs))
                  continue;
                let val;
                if (obj._id.endsWith(".valueCosmic")) {
                  val = featureLatest.properties.value_cosmic;
                } else if (obj._id.endsWith(".valueTerrestrial")) {
                  val = (feature.properties.value * 1e3 - featureLatest.properties.value_cosmic * 1e3) / 1e3;
                } else {
                  val = feature.properties.value;
                }
                this.log.debug(`adding ${val}@${feature.properties.end_measure} for ${obj._id} to ${historyKey}`);
                newHistory.push({
                  ts: endMeasureTs,
                  val,
                  ack: true,
                  from: "system.adapter." + this.namespace,
                  q: 0
                });
              }
              if (newHistory.length > 0) {
                await this.sendToAsync(historyKey, "storeState", {
                  id: obj._id,
                  state: newHistory
                });
              }
            }
          }
        }
      }
    }
    if (this.unloaded) {
      return;
    }
    await Promise.all([
      this.setStateAsync("stats.total", featureCollectionLatest.features.length, true),
      this.setStateAsync("stats.inOperation", featureCollectionLatest.features.filter((f) => f.properties.site_status === 1).length, true),
      this.setStateAsync("stats.defective", featureCollectionLatest.features.filter((f) => f.properties.site_status === 2).length, true),
      this.setStateAsync("stats.testOperation", featureCollectionLatest.features.filter((f) => f.properties.site_status === 3).length, true)
    ]);
    const fValues = featureCollectionLatest.features.filter((f) => f.properties.value !== null).map((f) => f.properties.value);
    const valMin = Math.min(...fValues);
    const valMax = Math.max(...fValues);
    const valAvg = Math.round(fValues.reduce((a, b) => a + b, 0) / fValues.length * 1e3) / 1e3;
    const fMin = featureCollectionLatest.features.find((f) => f.properties.value === valMin);
    const fMax = featureCollectionLatest.features.find((f) => f.properties.value === valMax);
    const fMinStr = fMin ? `${fMin.properties.kenn} - ${fMin.properties.plz} ${fMin.properties.name}` : "";
    const fMaxStr = fMax ? `${fMax.properties.kenn} - ${fMax.properties.plz} ${fMax.properties.name}` : "";
    await Promise.all([
      this.setStateAsync("stats.valueMin", valMin, true),
      this.setStateAsync("stats.valueMinLocation", fMinStr, true),
      this.setStateAsync("stats.valueMax", valMax, true),
      this.setStateAsync("stats.valueMaxLocation", fMaxStr, true),
      this.setStateAsync("stats.valueAvg", valAvg, true)
    ]);
  }
}
if (require.main !== module) {
  module.exports = (options) => new OdlAdapter(options);
} else {
  (() => new OdlAdapter())();
}
//# sourceMappingURL=main.js.map
