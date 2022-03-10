/* eslint-disable @typescript-eslint/no-unused-vars */
export {};

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
  namespace ioBroker {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface,@typescript-eslint/no-unused-vars
    interface AdapterConfig {
      msts: string[];
      timeout: number;
      useCosmicTerrestrial: boolean;

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