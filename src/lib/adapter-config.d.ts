/* eslint-disable @typescript-eslint/no-unused-vars */
export {};

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
  namespace ioBroker {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface,@typescript-eslint/no-unused-vars
    interface AdapterConfig {
      localityCode: string[];
      pastHours: number;
      timeout: number;
    }
  }
}