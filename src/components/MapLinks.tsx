import { MAP_PROVIDERS, searchUrl, directionUrl } from '@/utils/mapLinks';
import type { MapProvider, TravelMode } from '@/utils/mapLinks';

interface MapLinksProps {
  /** 搜索关键词（地址或地点名） */
  query: string;
  lat?: number;
  lng?: number;
  /** 传入终点即切换为「导航」模式：跳转到 A → B 的真实路线规划 */
  to?: { lat: number; lng: number; name: string };
  fromName?: string;
  mode?: TravelMode;
  className?: string;
}

/** 四个地图服务的外链按钮：手机端唤起原生 App，电脑端打开网页版，都不消耗 API 额度 */
export default function MapLinks({ query, lat, lng, to, fromName = '', mode = 'driving', className = '' }: MapLinksProps) {
  const open = (p: MapProvider) => {
    const url =
      to && lat && lng
        ? directionUrl(p, { from: { lat, lng, name: fromName }, to, mode })
        : searchUrl(p, { query, lat, lng });
    window.open(url, '_blank', 'noopener');
  };

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {MAP_PROVIDERS.map((p) => (
        <button key={p.key} type="button" className="mode-btn" onClick={() => open(p.key)}>
          {p.label}
        </button>
      ))}
    </div>
  );
}
