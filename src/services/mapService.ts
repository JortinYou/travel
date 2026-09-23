import type { RouteInfo } from '@/types';

// 高德地图 JS API 声明
declare global {
  interface Window {
    AMap: any;
  }
}

function loadAMapScript(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.AMap) { resolve(); return; }
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${key}&plugin=AMap.Driving,AMap.Walking,AMap.Transfer,AMap.Riding,AMap.Geocoder`;
    script.onload = () => {
      window.AMap.plugin(['AMap.Geocoder', 'AMap.Driving', 'AMap.Walking', 'AMap.Transfer', 'AMap.Riding'], () => resolve());
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export async function geocodeAmap(address: string, key: string): Promise<{ lat: number; lng: number; name: string } | null> {
  try {
    await loadAMapScript(key);
    return new Promise((resolve) => {
      const geocoder = new window.AMap.Geocoder();
      geocoder.getLocation(address, (status: string, result: any) => {
        if (status === 'complete' && result.info === 'OK') {
          const geocode = result.geocodes[0];
          resolve({
            lat: geocode.location.lat,
            lng: geocode.location.lng,
            name: geocode.formattedAddress || address,
          });
        } else {
          resolve(null);
        }
      });
    });
  } catch {
    return null;
  }
}

export async function calculateRouteAmap(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: 'walking' | 'transit' | 'driving' | 'riding',
  key: string
): Promise<RouteInfo | null> {
  try {
    await loadAMapScript(key);
    return new Promise((resolve) => {
      const config = { map: undefined as any, panel: undefined as any };
      let service: any;
      if (mode === 'driving') service = new window.AMap.Driving(config);
      else if (mode === 'walking') service = new window.AMap.Walking(config);
      else if (mode === 'transit') service = new window.AMap.Transfer(config);
      else if (mode === 'riding') service = new window.AMap.Riding(config);

      if (!service) { resolve(null); return; }

      service.search(
        [from.lng, from.lat],
        [to.lng, to.lat],
        (status: string, result: any) => {
          if (status === 'complete' && result.info === 'OK') {
            const route = result.routes?.[0];
            if (route) {
              const distance = route.distance || 0;
              const duration = route.duration || 0;
              // 费用估算
              const cost = estimateCost(mode, distance, duration);
              resolve({ mode, distance, duration, cost, costCurrency: 'CNY' });
            } else {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        }
      );
    });
  } catch {
    return null;
  }
}

function estimateCost(mode: string, distance: number, duration: number): number {
  if (mode === 'walking' || mode === 'transit') return 0;
  const km = distance / 1000;
  const minutes = duration / 60;
  if (mode === 'driving') {
    // 滴滴快车大致计价：起步价12元(3km内) + 里程费2.3元/km + 时长费0.4元/min
    if (km <= 3) return 12;
    return Math.round(12 + (km - 3) * 2.3 + minutes * 0.4);
  }
  if (mode === 'riding') return 0; // 骑行一般不计费
  return 0;
}

// 国际Uber费用估算（粗略）
export function estimateUberCost(km: number, countryCode: string): { amount: number; currency: string } {
  const rates: Record<string, { base: number; perKm: number; currency: string }> = {
    KR: { base: 3800, perKm: 1200, currency: 'KRW' },
    JP: { base: 730, perKm: 300, currency: 'JPY' },
    US: { base: 3.5, perKm: 1.6, currency: 'USD' },
    TH: { base: 35, perKm: 12, currency: 'THB' },
  };
  const rate = rates[countryCode] || { base: 0, perKm: 0, currency: 'CNY' };
  return {
    amount: Math.round(rate.base + km * rate.perKm),
    currency: rate.currency,
  };
}

// OSRM 免费路线计算（无需API Key，适用于国际场景）
export async function calculateRouteOSRM(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: 'walking' | 'driving'
): Promise<RouteInfo | null> {
  const profile = mode === 'walking' ? 'foot' : 'driving';
  try {
    const url = `https://router.project-osrm.org/route/v1/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes?.[0]) {
      const route = data.routes[0];
      const distance = route.distance;
      const duration = route.duration;
      const cost = mode === 'driving' ? estimateCost(mode, distance, duration) : 0;
      return { mode, distance, duration, cost, costCurrency: 'CNY' };
    }
    return null;
  } catch {
    return null;
  }
}