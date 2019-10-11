/**
 * Type declarations.
 */
/***/

declare interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
  totalFeatures: number;
  numberMatched: number;
  numberReturned: number;
  timeStamp: string;

  crs: {
    type: 'name';
    properties: {
      name: string;
    };
  };
}

declare interface Feature {
  type: 'Feature';
  id: string;
  geometry: FeatureGeometry;
  geometry_name: 'geom';
  properties: FeatureProperties;
}

declare interface FeatureGeometry {
  type: 'Point';
  coordinates: [number, number];
}

declare interface FeatureProperties {
  locality_code: string;
  locality_name: string;
  start_measure: string;
  end_measure: string;
  value: number;
  nuclide: string;
  duration: string;
  dom: string;
  network: string;
  network_id: string;
  style: string;
  source: string;
}

declare interface GetHistoryMessage extends ioBroker.Message {
  result?: ioBroker.State[];
}

declare type GetHistoryResult = GetHistoryMessage | undefined;
