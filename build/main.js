"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var import_register = require("source-map-support/register");
var import_adapter_core = require("@iobroker/adapter-core");
var import_axios = __toESM(require("axios"));
class OdlAdapter extends import_adapter_core.Adapter {
  /**
   * URL to get the latest data.
   */
  urlLatest = "https://www.imis.bfs.de/ogc/opendata/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=opendata:odlinfo_odl_1h_latest&outputFormat=application/json";
  /**
   * URL to get the latest 168 features (24h * 7d = 168 features).
   * `#kenn#` will be replaced by the identifier.
   */
  urlTimeseries = "https://www.imis.bfs.de/ogc/opendata/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=opendata:odlinfo_timeseries_odl_1h&outputFormat=application/json&viewparams=kenn:#kenn#&sortBy=end_measure+A&maxFeatures=168";
  /**
   * Timeout to force adapter exit after some time.
   */
  exitTimeout = null;
  /**
   * If the adapter is unloaded (should stop).
   */
  unloaded = false;
  /**
   * Configured system language.
   */
  systemLanguage = "en";
  /**
   * Constructor to create a new instance of the adapter.
   * @param options The adapter options.
   */
  constructor(options = {}) {
    super({
      ...options,
      name: "odl"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("unload", this.onUnload.bind(this));
    this.exitTimeout = setTimeout(() => {
      this.unloaded = true;
      if (this.log) {
        this.log.warn(`Adapter did not exit within 10 minutes. Will now terminate!`);
      }
      this.exit(import_adapter_core.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION);
    }, 6e5);
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    var _a, _b, _c;
    let instObj = null;
    try {
      instObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
      if (((_a = instObj == null ? void 0 : instObj.common) == null ? void 0 : _a.schedule) === "30 * * * *") {
        const second = Math.floor(Math.random() * 60);
        const minute = Math.floor(Math.random() * 31) + 15;
        instObj.common.schedule = `${second} ${minute} * * * *`;
        this.log.info(`Schedule adjusted to spread calls better over a half hour!`);
        await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, instObj);
        this.exit(import_adapter_core.EXIT_CODES.NO_ERROR);
        return;
      }
    } catch (_e) {
      this.log.error(`Could not check or adjust the schedule`);
    }
    const objSystemConfig = await this.getForeignObjectAsync("system.config");
    this.systemLanguage = (_c = (_b = objSystemConfig == null ? void 0 : objSystemConfig.common) == null ? void 0 : _b.language) != null ? _c : "en";
    this.log.debug(`system language: ${this.systemLanguage}`);
    if (!Array.isArray(this.config.msts)) {
      this.config.msts = [];
    }
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
    this.exit(import_adapter_core.EXIT_CODES.NO_ERROR);
  }
  /**
   * Adapter should unload.
   */
  onUnload(cb) {
    this.unloaded = true;
    cb == null ? void 0 : cb();
  }
  /**
   * Terminate or exit the adapter.
   * @param code The exit code.
   */
  exit(code) {
    if (this.exitTimeout) {
      clearTimeout(this.exitTimeout);
    }
    if (this.terminate) {
      this.terminate(code);
    } else {
      process.exit(code);
    }
  }
  /**
   * Read the data, create objects and states.
   */
  async read() {
    var _a;
    const resLatest = await import_axios.default.request({
      url: this.urlLatest,
      method: "get",
      headers: {
        Accept: "application/json",
        "User-Agent": `Mozilla/5.0 (compatible; ioBroker.odl/${this.version})`
      },
      timeout: (this.config.timeout || 30) * 1e3
    }).catch((err) => {
      this.log.warn(`Error loading latest data from server! ${err}`);
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
          instObj.native = {
            ...this.config
          };
          instObj.native.msts = (_a = instObj.native.msts) != null ? _a : [];
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
          this.exit(import_adapter_core.EXIT_CODES.NO_ERROR);
          return;
        }
      } catch (_e) {
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
            name: {
              de: `${mstKenn} - ${featureLatest.properties.plz} ${featureLatest.properties.name} ODL`,
              en: `${mstKenn} - ${featureLatest.properties.plz} ${featureLatest.properties.name} ADR`
            },
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
              name: {
                de: `${mstKenn} - ${featureLatest.properties.plz} ${featureLatest.properties.name} ODL kosmisch`,
                en: `${mstKenn} - ${featureLatest.properties.plz} ${featureLatest.properties.name} ADR cosmic`
              },
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
              name: {
                de: `${mstKenn} - ${featureLatest.properties.plz} ${featureLatest.properties.name} ODL terrestrisch`,
                en: `${mstKenn} - ${featureLatest.properties.plz} ${featureLatest.properties.name} ADR terrestrial`
              },
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
            name: {
              de: `${mstKenn} - ${featureLatest.properties.plz} ${featureLatest.properties.name} Status`,
              en: `${mstKenn} - ${featureLatest.properties.plz} ${featureLatest.properties.name} Status`
            },
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
        q: featureLatest.properties.value !== null ? 0 : 129
        // 0x00 = good, 0x81 = general problem by sensor
      };
      const currentState = await this.getStateAsync(`${mstKenn}.value`);
      if (!currentState || currentState.val !== newState.val || currentState.ts !== newState.ts) {
        await this.setState(`${mstKenn}.value`, newState);
        if (objValueCosmic) {
          newState.val = featureLatest.properties.value_cosmic;
          await this.setState(`${mstKenn}.valueCosmic`, newState);
        }
        if (objValueTerrestrial) {
          newState.val = featureLatest.properties.value_terrestrial;
          await this.setState(`${mstKenn}.valueTerrestrial`, newState);
        }
      }
      await this.setState(`${mstKenn}.status`, featureLatest.properties.site_status, true);
      if (this.config.updateHistory && featureLatest.properties.site_status === 1 && featureLatest.properties.end_measure && featureLatest.properties.value && featureLatest.properties.value_cosmic) {
        let updateHistory = false;
        const histroyEndDate = new Date(featureLatest.properties.end_measure);
        const historyEnd = histroyEndDate.getTime();
        const historyStart = histroyEndDate.setDate(histroyEndDate.getDate() - 7) + 100;
        const currentHistory = {};
        for (const obj of [objValue, objValueCosmic, objValueTerrestrial]) {
          if (!obj) continue;
          currentHistory[obj._id] = {};
          for (const historyKey in obj.common.custom) {
            if (/^(history|influxdb|sql)\.\d+$/.exec(historyKey) && obj.common.custom[historyKey].enabled === true) {
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
            this.log.warn(`Error loading timeseries data for ${mstKenn} from server! ${err}`);
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
            if (!obj) continue;
            for (const historyKey in currentHistory[obj._id]) {
              const oldHistory = currentHistory[obj._id][historyKey];
              const newHistory = [];
              for (const feature of featureCollectionTimeseries.features) {
                const endMeasureTs = new Date(feature.properties.end_measure).getTime();
                if (feature.properties.end_measure === featureLatest.properties.end_measure || oldHistory.find((state) => state.ts === endMeasureTs)) continue;
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
      this.setState("statistics.total", featureCollectionLatest.features.length, true),
      this.setState("statistics.inOperation", featureCollectionLatest.features.filter((f) => f.properties.site_status === 1).length, true),
      this.setState("statistics.defective", featureCollectionLatest.features.filter((f) => f.properties.site_status === 2).length, true),
      this.setState("statistics.testOperation", featureCollectionLatest.features.filter((f) => f.properties.site_status === 3).length, true)
    ]);
    const fValues = featureCollectionLatest.features.filter((f) => f.properties.value !== null).map((f) => f.properties.value);
    if (fValues.length > 0) {
      const valMin = Math.min(...fValues);
      const valMax = Math.max(...fValues);
      const valAvg = Math.round(fValues.reduce((a, b) => a + b, 0) / fValues.length * 1e3) / 1e3;
      const fMin = featureCollectionLatest.features.find((f) => f.properties.value === valMin);
      const fMax = featureCollectionLatest.features.find((f) => f.properties.value === valMax);
      const fMinStr = fMin ? `${fMin.properties.kenn} - ${fMin.properties.plz} ${fMin.properties.name}` : "";
      const fMaxStr = fMax ? `${fMax.properties.kenn} - ${fMax.properties.plz} ${fMax.properties.name}` : "";
      await Promise.all([
        this.setState("statistics.valueMin", valMin, true),
        this.setState("statistics.valueMinLocation", fMinStr, true),
        this.setState("statistics.valueMax", valMax, true),
        this.setState("statistics.valueMaxLocation", fMaxStr, true),
        this.setState("statistics.valueAvg", valAvg, true)
      ]);
    } else {
      await Promise.all([
        this.setState("statistics.valueMin", { val: null, q: 1 }, true),
        this.setState("statistics.valueMinLocation", { val: null, q: 1 }, true),
        this.setState("statistics.valueMax", { val: null, q: 1 }, true),
        this.setState("statistics.valueMaxLocation", { val: null, q: 1 }, true),
        this.setState("statistics.valueAvg", { val: null, q: 1 }, true)
      ]);
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new OdlAdapter(options);
} else {
  (() => new OdlAdapter())();
}
//# sourceMappingURL=main.js.map
