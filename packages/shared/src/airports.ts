export interface AirportInfo {
  code: string;
  city: string;
  country: string;
}

export const AIRPORTS: Record<string, AirportInfo> = {
  ATL: { code: "ATL", city: "Atlanta", country: "US" },
  JFK: { code: "JFK", city: "New York", country: "US" },
  LAX: { code: "LAX", city: "Los Angeles", country: "US" },
  LHR: { code: "LHR", city: "London", country: "GB" },
  CDG: { code: "CDG", city: "Paris", country: "FR" },
  AMS: { code: "AMS", city: "Amsterdam", country: "NL" },
  FRA: { code: "FRA", city: "Frankfurt", country: "DE" },
  MAD: { code: "MAD", city: "Madrid", country: "ES" },
  FCO: { code: "FCO", city: "Rome", country: "IT" },
  MUC: { code: "MUC", city: "Munich", country: "DE" },
  ZRH: { code: "ZRH", city: "Zurich", country: "CH" },
  DUB: { code: "DUB", city: "Dublin", country: "IE" },
  BCN: { code: "BCN", city: "Barcelona", country: "ES" },
  SJU: { code: "SJU", city: "San Juan", country: "PR" },
  NAS: { code: "NAS", city: "Nassau", country: "BS" },
  MBJ: { code: "MBJ", city: "Montego Bay", country: "JM" },
  PUJ: { code: "PUJ", city: "Punta Cana", country: "DO" },
  AUA: { code: "AUA", city: "Aruba", country: "AW" },
  STT: { code: "STT", city: "St. Thomas", country: "VI" },
  CUN: { code: "CUN", city: "Cancun", country: "MX" },
  SJO: { code: "SJO", city: "San Jose", country: "CR" },
  PTY: { code: "PTY", city: "Panama City", country: "PA" },
  GUA: { code: "GUA", city: "Guatemala City", country: "GT" },
  GRU: { code: "GRU", city: "Sao Paulo", country: "BR" },
  EZE: { code: "EZE", city: "Buenos Aires", country: "AR" },
  BOG: { code: "BOG", city: "Bogota", country: "CO" },
  LIM: { code: "LIM", city: "Lima", country: "PE" },
  SCL: { code: "SCL", city: "Santiago", country: "CL" },
  NRT: { code: "NRT", city: "Tokyo", country: "JP" },
  HND: { code: "HND", city: "Tokyo", country: "JP" },
  ICN: { code: "ICN", city: "Seoul", country: "KR" },
  PVG: { code: "PVG", city: "Shanghai", country: "CN" },
  PEK: { code: "PEK", city: "Beijing", country: "CN" },
  HKG: { code: "HKG", city: "Hong Kong", country: "HK" },
  SIN: { code: "SIN", city: "Singapore", country: "SG" },
  BKK: { code: "BKK", city: "Bangkok", country: "TH" },
};
