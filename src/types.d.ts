/**
 * Type declarations.
 */
/***/

declare interface FeatureCollection<Props> {
  type: 'FeatureCollection';
  features: Feature<Props>[];
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

declare interface Feature<Props> {
  type: 'Feature';
  id: string;
  geometry: FeatureGeometry;
  geometry_name: 'geom';
  properties: Props;
}

declare interface FeatureGeometry {
  type: 'Point';
  coordinates: [number, number];
}

declare type SiteStatus = 1 | 2 | 3;
declare type SiteStatusText = 'in Betrieb' | 'Defekt' | 'Testbetrieb';
declare type ValidatedStatus = 1 | 2;

declare interface FeaturePropertiesLatest {
  id: string;
  kenn: string;
  plz: string;
  name: string;
  site_status: SiteStatus;
  site_status_text: SiteStatusText;
  kid: 1 | 2 | 3 | 4 | 5 | 6;
  height_above_sea: number;
  start_measure: string | null;
  end_measure: string | null;
  value: number | null;
  value_cosmic: number | null;
  value_terrestrial: number | null;
  unit: 'µSv/h';
  validated: ValidatedStatus | null;
  nuclide: string;
  duration: string;
}

declare interface FeaturePropertiesTimeseries {
  id: string;
  kenn: string;
  name: string;
  start_measure: string;
  end_measure: string;
  value: number;
  unit: 'µSv/h';
  validated: ValidatedStatus;
  nuclide: string;
  duration: string;
}

declare interface GetHistoryMessage extends ioBroker.Message {
  result?: ioBroker.State[];
}

declare type GetHistoryResult = GetHistoryMessage | undefined;
