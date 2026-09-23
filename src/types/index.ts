export interface Place {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  time: string;
  duration: string;
  notes: string;
  /** 用户粘贴保存的地图分享链接，地点卡片上可一键跳转 */
  mapLink?: string;
}

export interface RouteInfo {
  mode: 'walking' | 'transit' | 'driving' | 'riding';
  distance: number; // 米
  duration: number; // 秒
  cost: number; // 人民币
  costCurrency: string;
}

export interface PlaceWithRoute extends Place {
  transportToNext?: RouteInfo;
}

export interface DayPlan {
  dayIndex: number;
  date: string;
  places: PlaceWithRoute[];
  weather?: WeatherInfo;
}

export interface WeatherInfo {
  tempMin: number;
  tempMax: number;
  condition: string;
  icon: string;
  precipProb: number;
}

export type TransportType = 'flight' | 'highspeed' | 'train' | 'bus';

export interface TransportBooking {
  id: string;
  type: TransportType | 'hotel';
  number: string;
  from: string;
  to: string;
  departTime: string;
  arriveTime: string;
  seat: string;
  notes: string;
}

export type ExpenseCategory = '交通' | '住宿' | '餐饮' | '门票' | '购物' | '其他';

export interface Expense {
  id: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  date: string;
  payer: string;
  note: string;
}

export interface PackingItem {
  id: string;
  category: string;
  name: string;
  packed: boolean;
}

export interface Trip {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  participants: number;
  currency: string;
  notes: string;
  days: DayPlan[];
  transports: TransportBooking[];
  expenses: Expense[];
  packingItems: PackingItem[];
}

export type ViewMode = 'table' | 'timeline' | 'map';

export type MapProvider = 'amap' | 'google' | 'baidu' | 'leaflet';

export interface AppSettings {
  mapProvider: MapProvider;
  amapKey: string;
  googleKey: string;
  baiduKey: string;
  defaultCurrency: string;
}

export type PageRoute = 'trips' | 'itinerary' | 'transports' | 'finance' | 'packing' | 'settings';