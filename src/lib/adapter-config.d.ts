export {};

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
  namespace ioBroker {
    interface AdapterConfig {
      msts: string[];
      timeout: number;
      useCosmicTerrestrial: boolean;
      updateHistory: boolean;

      /**
       * @deprecated Used in versions <2.0.0. Now only used to update existing old configurations.
       */
      localityCode?: string[];
    }

    interface InstanceCommon {
      schedule: string;
    }
  }
}
