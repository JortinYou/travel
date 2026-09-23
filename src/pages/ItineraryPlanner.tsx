import { useState, useEffect, useRef, useCallback } from 'react';
import { useTravelStore } from '@/store/useTravelStore';
import type { PlaceWithRoute, ViewMode, RouteInfo } from '@/types';
import {
  Plus, MapPin, Clock, X, Loader2,
  Table, Calendar, Map as MapIcon, Footprints, Bus, Car, Bike,
  ChevronUp, ChevronDown, Pencil, Trash2, RotateCcw, Crosshair, ArrowRight, Navigation,
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import {
  geocodeAmap, calculateRouteAmap, calculateRouteOSRM, estimateUberCost,
} from '@/services/mapService';
import { fetchWeather } from '@/services/weatherService';
import FAB from '@/components/FAB';
import ConfirmSheet from '@/components/ConfirmSheet';
import MapLinks from '@/components/MapLinks';
import { parseMapLink, type ParsedLink } from '@/utils/mapLinks';

/** 地址解析候选项 */
type GeoCandidate = { lat: number; lng: number; name: string };

// @ts-expect-error leaflet icon fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

type Mode = RouteInfo['mode'];
const MODES: { key: Mode; label: string; icon: typeof Footprints }[] = [
  { key: 'walking', label: '步行', icon: Footprints },
  { key: 'transit', label: '公交', icon: Bus },
  { key: 'driving', label: '驾车', icon: Car },
  { key: 'riding', label: '骑行', icon: Bike },
];

const VIEWS: { key: ViewMode; label: string; icon: typeof Table }[] = [
  { key: 'timeline', label: '时间线', icon: Calendar },
  { key: 'table', label: '表格', icon: Table },
  { key: 'map', label: '地图', icon: MapIcon },
];

function createNumberedIcon(num: number) {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:28px;height:28px;border-radius:50%;background:#22281D;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;box-shadow:0 2px 6px rgba(34,40,29,0.18);font-family:'Noto Sans SC',sans-serif;">${num}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// 无 API Key 时的估算回退
function estimateRoute(mode: Mode, distance: number): RouteInfo {
  const speed = mode === 'driving' ? 35 : mode === 'riding' ? 15 : mode === 'transit' ? 22 : 5; // km/h
  let duration = (distance / 1000 / speed) * 3600;
  if (mode === 'transit') duration += 600; // 候车换乘
  const cost = mode === 'driving' ? estimateCostDriving(distance, duration) : mode === 'transit' ? 5 : 0;
  return { mode, distance, duration: Math.round(duration), cost, costCurrency: 'CNY' };
}

function estimateCostDriving(distance: number, duration: number): number {
  const km = distance / 1000;
  if (km <= 3) return 12;
  return Math.round(12 + (km - 3) * 2.3 + (duration / 60) * 0.4);
}

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

function fmtDistance(m: number) {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}
function fmtDuration(s: number) {
  const min = Math.round(s / 60);
  if (min < 60) return `${min}分钟`;
  return `${Math.floor(min / 60)}小时${min % 60 > 0 ? `${min % 60}分` : ''}`;
}
function fmtCost(route: RouteInfo) {
  if (route.cost <= 0) return '免费';
  const sym = { CNY: '¥', KRW: '₩', JPY: '¥', USD: '$', EUR: '€', THB: '฿' }[route.costCurrency] || route.costCurrency;
  return `${sym}${route.cost}`;
}

// 日期简写：9/22
function fmtMD(date: string) {
  return new Date(date + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export default function ItineraryPlanner() {
  const trips = useTravelStore((s) => s.trips);
  const currentTripId = useTravelStore((s) => s.currentTripId);
  const currentDayIndex = useTravelStore((s) => s.currentDayIndex);
  const viewMode = useTravelStore((s) => s.viewMode);
  const settings = useTravelStore((s) => s.settings);
  const setCurrentDay = useTravelStore((s) => s.setCurrentDay);
  const setViewMode = useTravelStore((s) => s.setViewMode);
  const addPlace = useTravelStore((s) => s.addPlace);
  const updatePlace = useTravelStore((s) => s.updatePlace);
  const removePlace = useTravelStore((s) => s.removePlace);
  const reorderPlaces = useTravelStore((s) => s.reorderPlaces);
  const setRouteInfo = useTravelStore((s) => s.setRouteInfo);
  const setDayWeather = useTravelStore((s) => s.setDayWeather);
  const setPage = useTravelStore((s) => s.setPage);

  const trip = trips.find((t) => t.id === currentTripId);
  const day = trip?.days.find((d) => d.dayIndex === currentDayIndex);
  const places = day?.places ?? [];

  // 弹窗表单
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [f, setF] = useState({ name: '', address: '', time: '', duration: '', notes: '', lat: 0, lng: 0 });
  const [geocoding, setGeocoding] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
  const [candidates, setCandidates] = useState<GeoCandidate[]>([]);
  const [geoError, setGeoError] = useState<string | null>(null);
  // 粘贴地图分享链接取坐标
  const [linkInput, setLinkInput] = useState('');
  const [linkHint, setLinkHint] = useState<Extract<ParsedLink, { ok: true }> | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  // 删除确认
  const [confirmPlace, setConfirmPlace] = useState<PlaceWithRoute | null>(null);
  // 路线计算：key = `${fromIdx}:${mode}`
  const [calcKey, setCalcKey] = useState<string | null>(null);
  // 展开显示某段路线的地图外链（导航）
  const [navKey, setNavKey] = useState<string | null>(null);
  const [calcError, setCalcError] = useState<{ idx: number; msg: string } | null>(null);
  // 路线段展开状态：按 fromIdx 记录，每段独立
  const [openRoutes, setOpenRoutes] = useState<Set<number>>(new Set());

  const mapRef = useRef<L.Map | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // ---- 天气 ----
  useEffect(() => {
    if (!trip || !day || !currentTripId || day.weather) return;
    const p = day.places.find((x) => x.lat && x.lng);
    if (!p) return;
    fetchWeather(p.lat, p.lng, day.date).then((w) => {
      if (w) setDayWeather(currentTripId, day.dayIndex, w);
    });
  }, [trip, day, currentTripId, setDayWeather]);

  // ---- 地图：容器尺寸随断点变化，切到地图视图后需要重算尺寸 ----
  useEffect(() => {
    if (viewMode !== 'map' || !mapEl.current) return;
    // 切换视图会卸载并重建地图容器，容器变了必须重新初始化，否则地图会绑在已卸载的节点上而显示空白
    if (mapRef.current && mapRef.current.getContainer() !== mapEl.current) {
      mapRef.current.remove();
      mapRef.current = null;
      layerRef.current = null;
    }
    if (!mapRef.current) {
      mapRef.current = L.map(mapEl.current, { center: [37.75, 128.9], zoom: 12, zoomControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap', maxZoom: 19,
      }).addTo(mapRef.current);
      L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current);
      layerRef.current = L.layerGroup().addTo(mapRef.current);
    }
    const timer = setTimeout(() => mapRef.current?.invalidateSize(), 150);
    return () => clearTimeout(timer);
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== 'map' || !mapRef.current || !layerRef.current) return;
    const map = mapRef.current;
    layerRef.current.clearLayers();
    const coords: [number, number][] = [];
    places.forEach((p, i) => {
      if (!p.lat || !p.lng) return;
      layerRef.current!.addLayer(
        L.marker([p.lat, p.lng], { icon: createNumberedIcon(i + 1) })
          .bindPopup(`<b>${i + 1}. ${p.name}</b><br/>${p.address || ''}${p.time ? `<br/>${p.time}` : ''}`)
      );
      coords.push([p.lat, p.lng]);
    });
    if (coords.length === 1) map.setView(coords[0], 14);
    else if (coords.length > 1) {
      layerRef.current.addLayer(L.polyline(coords, {
        color: '#22281D', weight: 3, opacity: 0.75, dashArray: '8,6',
      }));
      map.fitBounds(L.latLngBounds(coords), { padding: [50, 50] });
    }
  }, [viewMode, places]);

  // ---- 表单 ----
  const resetForm = useCallback(() => {
    setF({ name: '', address: '', time: '', duration: '', notes: '', lat: 0, lng: 0 });
    setEditingId(null);
    setCalcError(null);
    setAdvOpen(false);
    setCandidates([]);
    setGeoError(null);
    setLinkInput('');
    setLinkHint(null);
    setLinkError(null);
  }, []);

  const openAdd = () => { resetForm(); setModalOpen(true); };
  const openEdit = (p: PlaceWithRoute) => {
    setEditingId(p.id);
    setF({ name: p.name, address: p.address, time: p.time, duration: p.duration, notes: p.notes, lat: p.lat, lng: p.lng });
    setCandidates([]);
    setGeoError(null);
    setLinkInput('');
    setLinkHint(null);
    setLinkError(null);
    setModalOpen(true);
  };

  /** 选中一个候选：只写坐标，名称为空时顺带补全，不覆盖用户已输入的地址 */
  const applyCandidate = (c: GeoCandidate) => {
    setGeoError(null);
    setF((prev) => ({
      ...prev,
      lat: c.lat,
      lng: c.lng,
      name: prev.name || c.name.split(',')[0],
    }));
  };

  /** 输入时实时识别，认出来就给提示；错误提示等点了「填入」再显示 */
  const handleLinkChange = (v: string) => {
    setLinkInput(v);
    setLinkError(null);
    const r = parseMapLink(v);
    setLinkHint(r.ok ? r : null);
  };

  /** 把地图分享链接里的坐标填进表单（各家坐标系已在解析时转回 WGS-84） */
  const applyLink = () => {
    const r = parseMapLink(linkInput);
    if ('msg' in r) {
      setLinkHint(null);
      setLinkError(r.msg);
      return;
    }
    setLinkHint(r);
    setLinkError(null);
    setGeoError(null);
    setF((prev) => ({ ...prev, lat: r.lat, lng: r.lng }));
  };

  const handleGeocode = async () => {
    if (!f.address.trim()) return;
    setGeocoding(true);
    setGeoError(null);
    let list: GeoCandidate[] = [];
    try {
      if (settings.amapKey) {
        const res = await geocodeAmap(f.address.trim(), settings.amapKey);
        if (res) list = [res];
      } else {
        // 一次取 5 个候选，让用户自己挑，避免只取第一个导致定位不准
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(f.address.trim())}`,
          { headers: { 'Accept-Language': 'zh-CN,zh' } }
        );
        const d = await r.json();
        if (Array.isArray(d)) {
          list = d
            .map((x: { lat: string; lon: string; display_name: string }) => ({
              lat: +x.lat, lng: +x.lon, name: x.display_name,
            }))
            .filter((x: GeoCandidate) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
        }
      }
    } catch {
      list = [];
    } finally {
      setGeocoding(false);
    }

    if (list.length === 0) {
      setCandidates([]);
      setGeoError('没找到这个地址。可以写详细些（城市＋区＋店名），或直接在下面的地图上点选位置。');
      return;
    }
    setCandidates(list);
    applyCandidate(list[0]);
  };

  const handleSave = () => {
    if (!currentTripId || !f.name.trim()) return;
    if (editingId) {
      updatePlace(currentTripId, currentDayIndex, editingId, {
        name: f.name.trim(), address: f.address, time: f.time,
        duration: f.duration, notes: f.notes, lat: f.lat, lng: f.lng,
      });
    } else {
      addPlace(currentTripId, currentDayIndex, {
        id: crypto.randomUUID(), name: f.name.trim(), address: f.address, time: f.time,
        duration: f.duration, notes: f.notes, lat: f.lat, lng: f.lng,
      });
    }
    setModalOpen(false);
    resetForm();
  };

  // ---- 路线计算（可随时切换模式）----
  const calculateSegment = async (fromIdx: number, mode: Mode) => {
    if (!currentTripId || !day) return;
    const from = places[fromIdx];
    const to = places[fromIdx + 1];
    if (!from || !to) return;

    setCalcError(null);
    const key = `${fromIdx}:${mode}`;
    setCalcKey(key);

    try {
      const hasCoords = from.lat && from.lng && to.lat && to.lng;
      if (!hasCoords) {
        setCalcError({ idx: fromIdx, msg: '两地缺少坐标，请在地点编辑的「坐标」里解析后再试' });
        return;
      }
      const a = { lat: from.lat, lng: from.lng };
      const b = { lat: to.lat, lng: to.lng };

      let route: RouteInfo | null = null;
      if (settings.amapKey) {
        route = await calculateRouteAmap(a, b, mode, settings.amapKey);
      } else if (mode === 'driving' || mode === 'walking') {
        route = await calculateRouteOSRM(a, b, mode);
      }

      if (!route) {
        // 用直线距离估算（乘系数）
        const straight = haversine(a, b);
        const road = straight * (mode === 'walking' ? 1.3 : 1.4);
        route = estimateRoute(mode, road);
      }

      // 国际驾车：给出当地货币参考
      if (mode === 'driving' && trip && !/中国|China/.test(trip.destination)) {
        const cc = /韩/.test(trip.destination) ? 'KR' : /日/.test(trip.destination) ? 'JP' : /美/.test(trip.destination) ? 'US' : /泰/.test(trip.destination) ? 'TH' : '';
        if (cc) {
          const uber = estimateUberCost(route.distance / 1000, cc);
          route = { ...route, cost: uber.amount, costCurrency: uber.currency };
        }
      }

      setRouteInfo(currentTripId, day.dayIndex, from.id, route);
    } catch {
      setCalcError({ idx: fromIdx, msg: '计算失败，请检查网络或坐标' });
    } finally {
      setCalcKey(null);
    }
  };

  const clearRoute = (fromIdx: number) => {
    if (!currentTripId || !day) return;
    setRouteInfo(currentTripId, day.dayIndex, places[fromIdx].id, undefined);
    setCalcError(null);
  };

  const toggleRouteOpen = (idx: number) => {
    setOpenRoutes((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (!trip || !day) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-24 lg:py-32">
        <div className="text-center">
          <MapPin size={40} className="mx-auto mb-3" style={{ color: 'var(--ink-4)' }} />
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>请先选择一个行程</p>
          <button className="btn-outline mt-4" onClick={() => setPage('trips')}>返回行程列表</button>
        </div>
      </div>
    );
  }

  const w = day.weather;

  // ---- 路线段组件：默认折叠成一行摘要，展开后交通方式常驻可反复点击 ----
  const RouteRow = ({ idx, flush }: { idx: number; flush?: boolean }) => {
    const route = places[idx]?.transportToNext;
    const activeMode = route?.mode;
    const open = openRoutes.has(idx);
    const BarIcon = MODES.find((m) => m.key === activeMode)?.icon ?? ArrowRight;
    const from = places[idx];
    const to = places[idx + 1];
    // 两端都有坐标才能跳转导航
    const canNav = !!(from && to && from.lat && from.lng && to.lat && to.lng);
    const navOpen = navKey === String(idx);
    return (
      <div className={flush ? '' : 'pl-[38px] lg:pl-[42px] pr-0 lg:pr-2 mt-2'}>
        <div className="flex items-stretch gap-1.5">
        {/* 折叠态：整行可点，toggle 展开/收起 */}
        <button
          type="button"
          className={`route-bar min-w-0 flex-1 ${open ? 'open' : ''}`}
          onClick={() => toggleRouteOpen(idx)}
          aria-expanded={open}
        >
          <BarIcon size={14} className="shrink-0" style={{ color: route ? 'var(--ink-2)' : 'var(--ink-4)' }} />
          <span className="flex-1 min-w-0 truncate text-xs">
            {route ? (
              <>
                <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{fmtDuration(route.duration)}</span>
                <span className="tabular-nums" style={{ color: 'var(--ink-2)' }}> · {fmtDistance(route.distance)} · {fmtCost(route)}</span>
                {!settings.amapKey && <span className="tag ml-1.5">估算</span>}
              </>
            ) : calcError?.idx === idx ? (
              <span style={{ color: 'var(--danger)' }}>未找到路线</span>
            ) : calcKey?.startsWith(`${idx}:`) ? (
              <span style={{ color: 'var(--ink-3)' }}>计算中…</span>
            ) : (
              <span style={{ color: 'var(--ink-3)' }}>选择交通方式</span>
            )}
          </span>
          {open
            ? <ChevronUp size={14} className="shrink-0" style={{ color: 'var(--ink-3)' }} />
            : <ChevronDown size={14} className="shrink-0" style={{ color: 'var(--ink-3)' }} />}
        </button>

        {/* 跳转地图 App 真实导航，按当前选中的交通方式 */}
        {canNav && (
          <button
            type="button"
            className={`mode-btn shrink-0 ${navOpen ? 'active' : ''}`}
            onClick={() => setNavKey(navOpen ? null : String(idx))}
          >
            <Navigation size={13} />
            <span>导航</span>
          </button>
        )}
        </div>

        {canNav && navOpen && (
          <div className="pt-2 pl-3">
            <p className="field-hint mb-1.5 truncate">
              {MODES.find((m) => m.key === activeMode)?.label ?? '驾车'} · {from.name} → {to.name}
            </p>
            <MapLinks
              query={`${from.name} ${to.name}`}
              lat={from.lat}
              lng={from.lng}
              fromName={from.name}
              to={{ lat: to.lat, lng: to.lng, name: to.name }}
              mode={activeMode ?? 'driving'}
            />
          </div>
        )}

        {/* 展开态：4 个模式常驻，随时可点、可反复切换 */}
        {open && (
          <div className="pt-2 pb-0.5 pl-3 space-y-2">
            <div className="mode-group">
              {MODES.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  className={`mode-btn ${activeMode === key ? 'active' : ''}`}
                  disabled={calcKey !== null}
                  onClick={() => calculateSegment(idx, key)}
                  title={`按${label}计算`}
                >
                  {calcKey === `${idx}:${key}`
                    ? <Loader2 size={13} className="animate-spin-slow" />
                    : <Icon size={13} />}
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {route && (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-2)' }}>
                <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{fmtDuration(route.duration)}</span>
                <span className="tabular-nums">{fmtDistance(route.distance)}</span>
                <span className="tabular-nums">{fmtCost(route)}</span>
                {!settings.amapKey && <span className="tag">估算</span>}
                <button
                  className="btn-icon danger ml-auto shrink-0"
                  onClick={() => clearRoute(idx)}
                  title="清除"
                  aria-label="清除路线"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            )}

            {calcError?.idx === idx && (
              <p className="text-[11px]" style={{ color: 'var(--danger)' }}>{calcError.msg}</p>
            )}
          </div>
        )}
      </div>
    );
  };

  // ---- 地点操作按钮：移动/桌面共用一套，32px 触点 ----
  const PlaceActions = ({ idx, p }: { idx: number; p: PlaceWithRoute }) => (
    <>
      <button className="btn-icon disabled:opacity-25" disabled={idx === 0} aria-label="上移"
        onClick={() => reorderPlaces(trip.id, day.dayIndex, idx, idx - 1)}>
        <ChevronUp size={16} />
      </button>
      <button className="btn-icon disabled:opacity-25" disabled={idx === places.length - 1} aria-label="下移"
        onClick={() => reorderPlaces(trip.id, day.dayIndex, idx, idx + 1)}>
        <ChevronDown size={16} />
      </button>
      <button className="btn-icon" aria-label="编辑" onClick={() => openEdit(p)}>
        <Pencil size={15} />
      </button>
      <button className="btn-icon danger" aria-label="删除" onClick={() => setConfirmPlace(p)}>
        <Trash2 size={15} />
      </button>
    </>
  );

  // ---- 时间线视图（默认，移动端主视图）----
  const timelineView = (
    <div className="space-y-2.5 lg:max-w-3xl">
      {places.map((p, i) => (
        <div key={p.id}>
          <div className="relative flex gap-2.5 lg:gap-3.5">
            {/* 序号节点 */}
            <div className="relative shrink-0">
              <div className="timeline-dot relative z-10">{i + 1}</div>
              {i < places.length - 1 && <div className="timeline-rail" />}
            </div>

            {/* 内容卡 */}
            <div className="card-flat flex-1 min-w-0 px-3 py-2.5 lg:px-4 lg:py-3 mb-0.5 group">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[15px] font-medium">{p.name}</span>
                  {p.time && <span className="tag"><Clock size={10} />{p.time}</span>}
                </div>
                {(p.duration || p.address) && (
                  <p className="text-[11px] mt-1 truncate" style={{ color: 'var(--ink-3)' }}>
                    {[p.duration ? `停留 ${p.duration}` : null, p.address || null].filter(Boolean).join(' · ')}
                  </p>
                )}
                {p.notes && <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--ink-3)' }}>{p.notes}</p>}
              </div>

              {/* 桌面悬停显示，移动端常显 */}
              <div className="flex items-center justify-end gap-0.5 mt-1.5 -mb-1 -mr-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                <PlaceActions idx={i} p={p} />
              </div>
            </div>
          </div>

          {/* 路线段 */}
          {i < places.length - 1 && <RouteRow idx={i} />}
        </div>
      ))}
    </div>
  );

  // ---- 表格视图（仅桌面端）----
  const tableView = (
    <div className="card overflow-hidden">
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 44 }}>#</th>
            <th>地点</th>
            <th style={{ width: 76 }}>时间</th>
            <th style={{ width: 70 }}>停留</th>
            <th style={{ width: 230 }}>前往下一站</th>
            <th style={{ width: 142 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {places.map((p, i) => {
            const last = i === places.length - 1;
            return (
              <tr key={p.id}>
                <td>
                  <span
                    className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-semibold"
                    style={{ background: 'var(--ink)', color: 'var(--surface)' }}
                  >
                    {i + 1}
                  </span>
                </td>
                <td>
                  <div className="font-medium text-[13px]">{p.name}</div>
                  {p.address && <div className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>{p.address}</div>}
                </td>
                <td className="text-[13px] tabular-nums">{p.time || '—'}</td>
                <td className="text-[13px]">{p.duration || '—'}</td>
                <td>
                  {last
                    ? <span className="text-xs" style={{ color: 'var(--ink-3)' }}>— 终点 —</span>
                    : <RouteRow idx={i} flush />}
                </td>
                <td>
                  <div className="flex items-center gap-0.5">
                    <PlaceActions idx={i} p={p} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="flex flex-col h-full px-4 py-4 lg:px-6 lg:py-6">
      {/* ===== 移动端：天数横向选择（吸顶于外壳顶栏之下）===== */}
      {/* 用 padding 而非 margin 制造下间距：margin 会留出透明缝隙，滚动内容会从缝里透出 */}
      <div className="lg:hidden sticky-under-topbar -mx-4 px-4 pt-2.5 pb-3">
        <div className="chip-row">
          {trip.days.map((d) => {
            const active = currentDayIndex === d.dayIndex;
            return (
              <button
                key={d.dayIndex}
                className={`chip ${active ? 'active' : ''}`}
                onClick={() => setCurrentDay(d.dayIndex)}
              >
                <span className="text-xs" style={{ fontWeight: active ? 600 : 500 }}>第{d.dayIndex}天</span>
                <span className="text-[10px] tabular-nums" style={active ? { opacity: 0.72 } : { color: 'var(--ink-3)' }}>
                  {fmtMD(d.date)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 flex lg:gap-6">
        {/* ===== 桌面端：天数竖栏 ===== */}
        <aside className="hidden lg:block lg:w-[168px] lg:shrink-0 lg:pr-5">
          <div className="space-y-1">
            {trip.days.map((d) => {
              const active = currentDayIndex === d.dayIndex;
              return (
                <button
                  key={d.dayIndex}
                  className={`day-tab relative ${active ? 'active' : ''}`}
                  onClick={() => setCurrentDay(d.dayIndex)}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full"
                      style={{ width: 2, height: 16, background: 'var(--accent)' }}
                    />
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px]" style={{ color: active ? 'var(--ink)' : 'var(--ink-2)', fontWeight: active ? 600 : 400 }}>
                      第{d.dayIndex}天
                    </span>
                    {d.weather && <span className="text-xs leading-none">{d.weather.icon}</span>}
                  </div>
                  <div className="text-[11px] tabular-nums mt-0.5" style={{ color: 'var(--ink-3)' }}>{fmtMD(d.date)}</div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ===== 内容区 ===== */}
        <main className="flex-1 min-w-0">
          {/* 摘要小字 + 右侧操作（顶栏已显示行程名与天数，这里不再重复标题） */}
          <div className="flex items-center gap-2.5 lg:gap-3 mb-4 lg:mb-5">
            <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
              <span className="text-xs tabular-nums" style={{ color: 'var(--ink-3)' }}>{places.length} 个地点</span>
              {w && (
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span className="text-sm leading-none">{w.icon}</span>
                  <span style={{ color: 'var(--ink-2)' }}>{w.condition}</span>
                  <span className="tabular-nums" style={{ color: 'var(--ink-2)' }}>{w.tempMin}–{w.tempMax}°C</span>
                  <span className="tabular-nums" style={{ color: 'var(--ink-3)' }}>降水 {w.precipProb}%</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* 单套视图切换：表格项仅桌面端显示 */}
              <div className="view-switch">
                {VIEWS.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    className={`view-btn ${viewMode === key ? 'active' : ''} ${key === 'table' ? 'hidden lg:flex' : ''}`}
                    onClick={() => setViewMode(key)}
                  >
                    <Icon size={14} />{label}
                  </button>
                ))}
              </div>
              <button className="btn-primary hidden lg:inline-flex" onClick={openAdd}><Plus size={15} />添加地点</button>
            </div>
          </div>

          {places.length === 0 ? (
            /* ===== 空状态 ===== */
            <div className="card px-6 py-12 lg:p-14 text-center">
              <MapPin size={32} className="mx-auto mb-3" style={{ color: 'var(--ink-4)' }} />
              <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>这一天还没有安排</p>
              <p className="text-xs mt-1 mb-5" style={{ color: 'var(--ink-3)' }}>添加地点后可计算各段交通时间与费用</p>
              <button className="btn-primary" onClick={openAdd}><Plus size={15} />添加第一个地点</button>
            </div>
          ) : viewMode === 'map' ? (
            /* ===== 地图视图 ===== */
            <div>
              {/* 外层控制高度：.leaflet-container 自带 height:100%，内层撑满即可 */}
              <div className="h-[58vh] lg:h-[calc(100vh-250px)] min-h-[320px]">
                <div ref={mapEl} className="h-full w-full" />
              </div>
              <div className="mt-3 lg:mt-4 flex flex-wrap gap-2">
                {places.map((p, i) => (
                  <span key={p.id} className="tag">
                    <span className="font-semibold" style={{ color: 'var(--ink)' }}>{i + 1}</span>
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          ) : viewMode === 'table' ? (
            /* ===== 表格视图仅桌面端可用，手机上回退到时间线 ===== */
            <>
              <div className="hidden lg:block">{tableView}</div>
              <div className="lg:hidden">{timelineView}</div>
            </>
          ) : (
            timelineView
          )}
        </main>
      </div>

      {/* ===== 移动端悬浮添加按钮 ===== */}
      <FAB onClick={openAdd} label="添加地点" />

      {/* ===== 地点弹窗 ===== */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => { setModalOpen(false); resetForm(); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="text-base">{editingId ? '编辑地点' : '添加地点'}</h3>
              <button className="btn-icon" onClick={() => { setModalOpen(false); resetForm(); }} aria-label="关闭"><X size={17} /></button>
            </div>

            <div className="modal-body">
              <div>
                <label className="form-label">地点名称 *</label>
                <input className="input-field" autoComplete="off" placeholder="如：大邱国际机场" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </div>

              <div>
                <label className="form-label">地址</label>
                <input className="input-field" autoComplete="off" placeholder="例如：首尔站 / 庆州佛国寺" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
                {(f.address.trim() || f.name.trim()) && (
                  <div className="mt-2">
                    <p className="field-hint mb-1.5">在地图中打开</p>
                    <MapLinks query={f.address.trim() || f.name.trim()} lat={f.lat} lng={f.lng} />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">到达时间</label>
                  <input type="time" className="input-field" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">停留时长</label>
                  <input className="input-field" autoComplete="off" placeholder="如 1.5h" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="form-label">备注</label>
                <textarea className="input-field" rows={2} placeholder="营业时间、推荐菜品、注意事项…" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
              </div>

              {/* 坐标：只有算应用内距离/地图视图才需要，默认收起 */}
              <div>
                <button
                  type="button"
                  className="btn-ghost -ml-1.5 px-2.5 py-1.5 text-xs"
                  onClick={() => setAdvOpen((v) => !v)}
                  aria-expanded={advOpen}
                >
                  {advOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  坐标（应用内算距离用）
                </button>
                {advOpen && (
                  <div className="mt-2 space-y-3">
                    {/* 最准的办法：在地图 App 里选好点，把分享链接粘回来自动取坐标 */}
                    <div>
                      <label className="form-label">从地图链接取坐标</label>
                      <div className="flex gap-2">
                        <input
                          className="input-field"
                          inputMode="url"
                          autoComplete="off"
                          placeholder="地图 App 分享 → 复制链接 → 粘贴"
                          value={linkInput}
                          onChange={(e) => handleLinkChange(e.target.value)}
                        />
                        <button type="button" className="btn-outline shrink-0" onClick={applyLink} disabled={!linkInput.trim()}>
                          填入
                        </button>
                      </div>
                      {linkHint && (
                        <p className="field-hint">
                          已识别（{linkHint.label}）：{linkHint.lat.toFixed(5)}, {linkHint.lng.toFixed(5)}
                        </p>
                      )}
                      {linkError && <p className="field-hint" style={{ color: 'var(--danger)' }}>{linkError}</p>}
                    </div>

                    <button className="btn-outline w-full" onClick={handleGeocode} disabled={geocoding || !f.address.trim()}>
                      {geocoding ? <Loader2 size={15} className="animate-spin-slow" /> : <Crosshair size={15} />}
                      按地址解析坐标
                    </button>
                    {geoError && <p className="field-hint" style={{ color: 'var(--danger)' }}>{geoError}</p>}

                    {/* 一个地址解析出多个结果时，让用户自己挑最接近的 */}
                    {candidates.length > 1 && (
                      <div className="tint-block p-1.5">
                        <p className="px-2.5 pt-1.5 pb-1 text-[11px]" style={{ color: 'var(--ink-3)' }}>
                          找到 {candidates.length} 个结果，选一个最接近的
                        </p>
                        {candidates.map((c) => {
                          const active = c.lat === f.lat && c.lng === f.lng;
                          return (
                            <button
                              key={`${c.lat},${c.lng}`}
                              type="button"
                              onClick={() => applyCandidate(c)}
                              className="touch-row w-full text-left px-2.5 py-2 rounded-lg text-[12px] leading-snug"
                              style={{
                                background: active ? 'var(--accent-soft)' : 'transparent',
                                color: active ? 'var(--ink)' : 'var(--ink-2)',
                                fontWeight: active ? 600 : 400,
                              }}
                            >
                              {c.name}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="form-label">纬度</label>
                        <input type="number" inputMode="decimal" step="0.000001" className="input-field" value={f.lat || ''} onChange={(e) => setF({ ...f, lat: +e.target.value })} />
                      </div>
                      <div>
                        <label className="form-label">经度</label>
                        <input type="number" inputMode="decimal" step="0.000001" className="input-field" value={f.lng || ''} onChange={(e) => setF({ ...f, lng: +e.target.value })} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-foot">
              <button className="btn-ghost flex-1" onClick={() => { setModalOpen(false); resetForm(); }}>取消</button>
              <button className="btn-primary flex-1" disabled={!f.name.trim()} onClick={handleSave}>{editingId ? '保存修改' : '添加'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 删除确认 ===== */}
      <ConfirmSheet
        open={confirmPlace !== null}
        title={confirmPlace ? `删除「${confirmPlace.name}」？` : ''}
        description="删除后不可恢复，后面的地点会自动前移。"
        onConfirm={() => {
          if (confirmPlace) removePlace(trip.id, day.dayIndex, confirmPlace.id);
          setConfirmPlace(null);
        }}
        onCancel={() => setConfirmPlace(null)}
      />
    </div>
  );
}
