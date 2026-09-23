import type { RouteInfo } from '@/types';

/** 交通方式，与应用内路线计算保持一致 */
export type TravelMode = RouteInfo['mode'];

/** 支持外链跳转的地图服务，全部无需 API Key */
export type MapProvider = 'amap' | 'baidu' | 'google' | 'apple';

export const MAP_PROVIDERS: { key: MapProvider; label: string }[] = [
  { key: 'amap', label: '高德' },
  { key: 'baidu', label: '百度' },
  { key: 'google', label: '谷歌' },
  { key: 'apple', label: '苹果' },
];

export interface Coords {
  lat: number;
  lng: number;
}

const enc = encodeURIComponent;

/* ---------- 坐标系转换 ----------
   应用内坐标来自 OSM/Nominatim，是 WGS-84。
   高德与谷歌中国底图用 GCJ-02，直接传 WGS-84 会偏移约 500 米；
   境外不做偏移，原样返回。百度走 URI API 的 coord_type=wgs84 参数，由百度自己转。 */

const PI = Math.PI;
const AXIS = 6378245.0;
const EE = 0.00669342162296594323;

function outOfChina(lat: number, lng: number) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x: number, y: number) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

/** WGS-84 → GCJ-02（火星坐标） */
export function wgs84ToGcj02(lat: number, lng: number): Coords {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || outOfChina(lat, lng)) return { lat, lng };
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((AXIS * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((AXIS / sqrtMagic) * Math.cos(radLat) * PI);
  return { lat: lat + dLat, lng: lng + dLng };
}

const hasCoords = (c?: { lat?: number; lng?: number }) =>
  !!c && Number.isFinite(c.lat) && Number.isFinite(c.lng) && (c.lat !== 0 || c.lng !== 0);

/* ---------- 搜索：打开某个地址/地点 ---------- */

export interface SearchTarget extends Partial<Coords> {
  /** 地址或地点名 */
  query: string;
}

export function searchUrl(p: MapProvider, t: SearchTarget): string {
  const q = t.query.trim();
  const c = hasCoords(t) ? (t as Coords) : null;

  switch (p) {
    case 'amap': {
      // 有坐标就扎点，比关键词搜索准；callnative=1 会尝试唤起 App
      if (c) {
        const g = wgs84ToGcj02(c.lat, c.lng);
        return `https://uri.amap.com/marker?position=${g.lng},${g.lat}&name=${enc(q)}&src=travel&coordinate=gaode&callnative=1`;
      }
      return `https://uri.amap.com/search?keyword=${enc(q)}&src=travel&coordinate=gaode&callnative=1`;
    }
    case 'baidu':
      if (c) {
        return `https://api.map.baidu.com/marker?location=${c.lat},${c.lng}&title=${enc(q)}&content=${enc(q)}&output=html&coord_type=wgs84&src=travel`;
      }
      return `https://map.baidu.com/search/${enc(q)}`;
    case 'google': {
      const g = c ? wgs84ToGcj02(c.lat, c.lng) : null;
      return `https://www.google.com/maps/search/?api=1&query=${enc(g ? `${g.lat},${g.lng}` : q)}`;
    }
    case 'apple':
      return c
        ? `https://maps.apple.com/?ll=${c.lat},${c.lng}&q=${enc(q)}`
        : `https://maps.apple.com/?q=${enc(q)}`;
  }
}

/* ---------- 导航：从 A 到 B 的真实路线规划 ---------- */

const AMAP_MODE: Record<TravelMode, string> = { walking: 'walk', transit: 'bus', driving: 'car', riding: 'ride' };
const BAIDU_MODE: Record<TravelMode, string> = { walking: 'walking', transit: 'transit', driving: 'driving', riding: 'riding' };
const GOOGLE_MODE: Record<TravelMode, string> = { walking: 'walking', transit: 'transit', driving: 'driving', riding: 'bicycling' };
// 苹果地图不支持骑行，留空表示交给它自己决定
const APPLE_MODE: Record<TravelMode, string> = { walking: 'w', transit: 'c', driving: 'd', riding: '' };

export interface DirectionTarget {
  from: Coords & { name: string };
  to: Coords & { name: string };
  mode: TravelMode;
}

export function directionUrl(p: MapProvider, d: DirectionTarget): string {
  const { from, to, mode } = d;
  switch (p) {
    case 'amap': {
      const a = wgs84ToGcj02(from.lat, from.lng);
      const b = wgs84ToGcj02(to.lat, to.lng);
      return `https://uri.amap.com/navigation?from=${a.lng},${a.lat},${enc(from.name)}&to=${b.lng},${b.lat},${enc(to.name)}&mode=${AMAP_MODE[mode]}&policy=1&src=travel&coordinate=gaode&callnative=1`;
    }
    case 'baidu':
      return `https://api.map.baidu.com/direction?origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&mode=${BAIDU_MODE[mode]}&coord_type=wgs84&output=html&src=travel`;
    case 'google': {
      const a = wgs84ToGcj02(from.lat, from.lng);
      const b = wgs84ToGcj02(to.lat, to.lng);
      return `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=${GOOGLE_MODE[mode]}`;
    }
    case 'apple': {
      const flg = APPLE_MODE[mode] ? `&dirflg=${APPLE_MODE[mode]}` : '';
      return `https://maps.apple.com/?saddr=${from.lat},${from.lng}&daddr=${to.lat},${to.lng}${flg}`;
    }
  }
}

/* ---------- 反向解析：从地图分享链接里把坐标取回应用 ----------
   各家链接的坐标系不同（高德 GCJ-02、百度 BD-09、谷歌/苹果 WGS-84），
   解析出来统一转回应用内使用的 WGS-84。 */

const PI_X = (PI * 3000.0) / 180.0;

/** BD-09 → GCJ-02 */
function bd09ToGcj02(lat: number, lng: number): Coords {
  const x = lng - 0.0065;
  const y = lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * PI_X);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * PI_X);
  return { lat: z * Math.sin(theta), lng: z * Math.cos(theta) };
}

/** GCJ-02 → WGS-84：用当前点做一次正向偏移再反向减掉，误差 1~2 米 */
function gcj02ToWgs84(lat: number, lng: number): Coords {
  if (outOfChina(lat, lng)) return { lat, lng };
  const g = wgs84ToGcj02(lat, lng);
  return { lat: lat * 2 - g.lat, lng: lng * 2 - g.lng };
}

type CoordSystem = 'wgs84' | 'gcj02' | 'bd09';

function toWgs84(lat: number, lng: number, sys: CoordSystem): Coords {
  if (sys === 'gcj02') return gcj02ToWgs84(lat, lng);
  if (sys === 'bd09') {
    const g = bd09ToGcj02(lat, lng);
    return gcj02ToWgs84(g.lat, g.lng);
  }
  return { lat, lng };
}

export type ParsedLink =
  | { ok: true; lat: number; lng: number; label: string }
  | { ok: false; msg: string };

/** 从 "a,b" 或 "a,b,名称" 里取出两个数；lngFirst 表示经度在前（高德风格） */
function pair(value: string | null, lngFirst: boolean): Coords | null {
  if (!value) return null;
  const m = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,/]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return lngFirst ? { lat: b, lng: a } : { lat: a, lng: b };
}

function inRange(c: Coords | null): c is Coords {
  return !!c && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180;
}

function finish(c: Coords, sys: CoordSystem, label: string): ParsedLink {
  const w = toWgs84(c.lat, c.lng, sys);
  return { ok: true, lat: +w.lat.toFixed(6), lng: +w.lng.toFixed(6), label };
}

/** 百度默认给 BD-09，但链接里可以用 coord_type 声明 */
function baiduSystem(url: URL): CoordSystem {
  const t = (url.searchParams.get('coord_type') || '').toLowerCase();
  if (t.startsWith('wgs')) return 'wgs84';
  if (t.startsWith('gcj')) return 'gcj02';
  return 'bd09';
}

const SHORT_HOSTS = ['goo.gl', 'g.co', 'maps.app.goo.gl', 'j.map.baidu.com', 'suo.im', 'dwz.cn', 'amap.com/s/'];

export function parseMapLink(raw: string): ParsedLink {
  const text = raw.trim();
  if (!text) return { ok: false, msg: '粘贴地图 App 的分享链接，或直接粘贴「纬度,经度」' };

  // 直接给一对数字也认
  const bare = pair(text, false);
  if (inRange(bare)) return finish(bare, 'wgs84', '手动坐标');

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, msg: '这不像是一个链接' };
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (SHORT_HOSTS.some((h) => host.endsWith(h.split('/')[0]))) {
    return {
      ok: false,
      msg: '这是短链接，网页里跨域读不到它跳转后的真实地址。请改用高德/百度/苹果的分享链接，或在电脑浏览器地址栏复制谷歌地图的长链接',
    };
  }

  const isAmap = host.includes('amap');
  const isBaidu = host.includes('baidu');
  const isApple = host.includes('apple');
  const sys: CoordSystem = isAmap ? 'gcj02' : isBaidu ? baiduSystem(url) : 'wgs84';
  const label = isAmap ? '高德' : isBaidu ? '百度' : isApple ? '苹果' : host.includes('google') ? '谷歌' : host;

  // 各家参数名不同，按「更像目的地」的优先级依次试
  const keys: [string, boolean][] = isAmap
    ? [['position', true], ['to', true], ['from', true]]
    : isBaidu
      ? [['location', false], ['destination', false], ['origin', false]]
      : isApple
        ? [['ll', false], ['daddr', false], ['saddr', false], ['q', false]]
        : [['q', false], ['query', false], ['destination', false], ['origin', false], ['ll', false], ['location', false]];

  for (const [k, lngFirst] of keys) {
    const c = pair(url.searchParams.get(k), lngFirst);
    if (inRange(c)) return finish(c, sys, label);
  }

  // 谷歌/百度网页版把坐标写在 @lat,lng 里
  const at = text.match(/@(-?\d+(?:\.\d+)?)[,/]?(-?\d+(?:\.\d+)?)/);
  if (at) {
    const c = { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };
    if (inRange(c)) return finish(c, sys, label);
    if (isBaidu) {
      return {
        ok: false,
        msg: '百度网页版链接用的是投影坐标（一串很长的数字），解析不了。请在百度地图 App 里点「分享 → 复制链接」，那种链接带 location=纬度,经度',
      };
    }
  }

  // 兜底：整串文本里找一对像经纬度的小数
  const loose = text.match(/(-?\d{1,3}\.\d{3,})\s*[,/]\s*(-?\d{1,3}\.\d{3,})/);
  if (loose) {
    const a = parseFloat(loose[1]);
    const b = parseFloat(loose[2]);
    const c = Math.abs(a) <= 90 && Math.abs(b) <= 180
      ? { lat: a, lng: b }
      : Math.abs(b) <= 90 && Math.abs(a) <= 180
        ? { lat: b, lng: a }
        : null;
    if (c) return finish(c, sys, `${label} · 链接内坐标`);
  }

  return { ok: false, msg: '没能从这个链接里找到坐标。请复制地图 App「分享」出来的链接，或直接粘贴「纬度,经度」' };
}

