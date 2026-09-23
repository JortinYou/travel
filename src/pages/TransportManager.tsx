import { useState } from 'react';
import { useTravelStore } from '@/store/useTravelStore';
import type { TransportBooking } from '@/types';
import FAB from '@/components/FAB';
import ConfirmSheet from '@/components/ConfirmSheet';
import useBodyScrollLock from '@/hooks/useBodyScrollLock';
import MapLinks from '@/components/MapLinks';
import {
  Plane,
  TrainFront,
  Bus,
  BedDouble,
  Plus,
  Trash2,
  X,
  MapPin,
  type LucideIcon,
} from 'lucide-react';

// 类型 -> 标签 / 线条图标（统一 --ink-4，不再按类型着色）
const TYPE_CONFIG: Record<string, { label: string; icon: LucideIcon }> = {
  flight: { label: '飞机', icon: Plane },
  highspeed: { label: '高铁', icon: TrainFront },
  train: { label: '火车', icon: TrainFront },
  bus: { label: '大巴', icon: Bus },
  hotel: { label: '住宿', icon: BedDouble },
};

const TRANSPORT_TYPES: { value: TransportBooking['type']; label: string }[] = [
  { value: 'flight', label: '飞机' },
  { value: 'highspeed', label: '高铁' },
  { value: 'train', label: '火车' },
  { value: 'bus', label: '大巴' },
];

interface FormData {
  type: TransportBooking['type'];
  number: string;
  from: string;
  to: string;
  departTime: string;
  arriveTime: string;
  seat: string;
  notes: string;
}

const emptyForm: FormData = {
  type: 'flight',
  number: '',
  from: '',
  to: '',
  departTime: '',
  arriveTime: '',
  seat: '',
  notes: '',
};

/** 安全解析：兼容 'YYYY-MM-DDTHH:mm:ss' / 'YYYY-MM-DDTHH:mm' / 'YYYY-MM-DD' */
function parseDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return isNaN(d.getTime()) ? null : d;
}

/** M月D日 */
function formatMD(value: string): string {
  const d = parseDate(value);
  return d ? `${d.getMonth() + 1}月${d.getDate()}日` : '待定';
}

/** M月D日 HH:mm（跨天也能完整显示） */
function formatMDT(value: string): string {
  const d = parseDate(value);
  if (!d) return '待定';
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mi}`;
}

/** 存储值 -> datetime-local 输入值 */
function toDateTimeInput(value: string): string {
  if (!value) return '';
  if (value.length === 10) return `${value}T00:00`;
  return value.slice(0, 16);
}

/** 存储值 -> date 输入值 */
function toDateInput(value: string): string {
  return value ? value.slice(0, 10) : '';
}

/** datetime-local 输入值 -> 存储值（YYYY-MM-DDTHH:mm:ss） */
function fromDateTimeInput(value: string): string {
  if (!value) return '';
  return value.length === 16 ? `${value}:00` : value;
}

export default function TransportManager() {
  const { trips, currentTripId, addTransport, updateTransport, removeTransport } = useTravelStore();

  const trip = trips.find((t) => t.id === currentTripId);
  const transports = trip?.transports || [];

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  useBodyScrollLock(showModal);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string; hotel: boolean } | null>(null);
  // 展开显示某条预订的地图外链
  const [mapOpenId, setMapOpenId] = useState<string | null>(null);

  // 按出发时间升序
  const sortedTransports = [...transports].sort(
    (a, b) => new Date(a.departTime).getTime() - new Date(b.departTime).getTime()
  );
  const transportList = sortedTransports.filter((t) => t.type !== 'hotel');
  const hotelList = sortedTransports.filter((t) => t.type === 'hotel');

  function openAdd(type: TransportBooking['type'] = 'flight') {
    setEditingId(null);
    setForm({ ...emptyForm, type });
    setShowModal(true);
  }

  function openEdit(item: TransportBooking) {
    setEditingId(item.id);
    const hotel = item.type === 'hotel';
    setForm({
      type: item.type,
      number: item.number,
      from: item.from,
      to: item.to,
      // 住宿用 date（YYYY-MM-DD），交通用 datetime-local（YYYY-MM-DDTHH:mm）
      departTime: hotel ? toDateInput(item.departTime) : toDateTimeInput(item.departTime),
      arriveTime: hotel ? toDateInput(item.arriveTime) : toDateTimeInput(item.arriveTime),
      seat: item.seat,
      notes: item.notes,
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setForm(emptyForm);
    setEditingId(null);
  }

  function handleSave() {
    if (!currentTripId) return;
    const hotel = form.type === 'hotel';
    const data: TransportBooking = {
      id: editingId || crypto.randomUUID(),
      type: form.type,
      number: form.number,
      from: form.from,
      to: form.to,
      departTime: hotel ? toDateInput(form.departTime) : fromDateTimeInput(form.departTime),
      arriveTime: hotel ? toDateInput(form.arriveTime) : fromDateTimeInput(form.arriveTime),
      seat: form.seat,
      notes: form.notes,
    };

    if (editingId) {
      updateTransport(currentTripId, editingId, data);
    } else {
      addTransport(currentTripId, data);
    }
    closeModal();
  }

  function handleDelete(id: string) {
    if (!currentTripId) return;
    removeTransport(currentTripId, id);
  }

  if (!trip) {
    return (
      <div className="px-4 py-4 lg:px-6 lg:py-6 lg:max-w-5xl lg:mx-auto">
        <div className="py-24 text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>
          请先选择或创建一个行程
        </div>
      </div>
    );
  }

  const isHotel = form.type === 'hotel';

  /** 单条预订卡片：整卡点击编辑，右侧只留地图外链与删除 */
  function renderRow(item: TransportBooking) {
    const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.bus;
    const Icon = cfg.icon;
    const hotel = item.type === 'hotel';
    const title = (hotel ? item.from : item.number) || cfg.label;
    const meta = [hotel ? item.number : '', item.seat, item.notes].filter(Boolean).join(' · ');
    const mapOpen = mapOpenId === item.id;
    // 住宿查「酒店名＋地址」，交通出发地与到达地各一组
    const mapTargets = (
      hotel
        ? [{ label: '住宿', query: [item.from, item.to].filter(Boolean).join(' ') }]
        : [
            { label: '出发', query: item.from },
            { label: '到达', query: item.to },
          ]
    ).filter((t) => t.query.trim());

    return (
      <div key={item.id} className="card-flat p-3.5 touch-row" onClick={() => openEdit(item)}>
        <div className="flex items-start gap-3">
          <Icon size={18} strokeWidth={1.7} className="shrink-0 mt-0.5" style={{ color: 'var(--ink-4)' }} />

          <div className="flex-1 min-w-0">
            {/* 班次号 / 酒店名 + 类型 */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[15px] truncate" style={{ fontWeight: 500 }}>{title}</span>
              <span className="tag shrink-0">{cfg.label}</span>
            </div>

            {/* 出发地 → 到达地 / 住宿地址 */}
            <p className="text-[13px] mt-1 truncate" style={{ color: 'var(--ink-2)' }}>
              {hotel ? (item.to || '—') : `${item.from || '—'} → ${item.to || '—'}`}
            </p>

            {/* 时间区间 */}
            <p className="text-[12px] mt-0.5 truncate" style={{ color: 'var(--ink-3)' }}>
              {hotel
                ? `${formatMD(item.departTime)} → ${formatMD(item.arriveTime)}`
                : `${formatMDT(item.departTime)} → ${formatMDT(item.arriveTime)}`}
            </p>

            {/* 座位号 / 房型 / 备注 */}
            {meta && (
              <p className="text-[11px] mt-1 truncate" style={{ color: 'var(--ink-3)' }}>{meta}</p>
            )}
          </div>

          {mapTargets.length > 0 && (
            <button
              className="btn-icon shrink-0"
              title="在地图中打开"
              aria-label="在地图中打开"
              aria-expanded={mapOpen}
              onClick={(e) => {
                e.stopPropagation();
                setMapOpenId(mapOpen ? null : item.id);
              }}
            >
              <MapPin size={15} />
            </button>
          )}

          <button
            className="btn-icon danger shrink-0"
            title="删除"
            aria-label="删除"
            onClick={(e) => {
              e.stopPropagation();
              setPendingDelete({ id: item.id, title, hotel });
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>

        {/* 展开的地图外链：阻止冒泡，避免点按钮时顺带打开编辑弹窗 */}
        {mapOpen && mapTargets.length > 0 && (
          <div
            className="mt-3 pt-3 space-y-2.5"
            style={{ borderTop: '1px solid var(--line)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {mapTargets.map((t) => (
              <div key={t.label}>
                <p className="field-hint mb-1.5 truncate">{t.label} · {t.query}</p>
                <MapLinks query={t.query} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /** 分区：标题 + 添加按钮 + 列表 / 空状态 */
  function renderSection(
    label: string,
    list: TransportBooking[],
    addType: TransportBooking['type'],
    emptyHint: string,
    EmptyIcon: LucideIcon,
  ) {
    return (
      <section>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
            {label} · {list.length}
          </span>
          <button className="btn-ghost !px-3 !py-2.5 text-[13px]" onClick={() => openAdd(addType)}>
            <Plus size={14} />
            添加{label}
          </button>
        </div>

        {list.length === 0 ? (
          <div className="card-flat py-12 px-4 text-center">
            <EmptyIcon size={22} className="mx-auto" style={{ color: 'var(--ink-4)' }} strokeWidth={1.6} />
            <p className="text-[13px] mt-3" style={{ color: 'var(--ink-2)' }}>暂无{label}预订</p>
            <p className="text-[12px] mt-1 leading-relaxed" style={{ color: 'var(--ink-3)' }}>{emptyHint}</p>
          </div>
        ) : (
          <div className="space-y-2.5">{list.map(renderRow)}</div>
        )}
      </section>
    );
  }

  return (
    <div className="px-4 py-4 lg:px-6 lg:py-6 lg:max-w-5xl lg:mx-auto">
      {/* 首行：摘要小字（添加入口只保留两个分区头 + 移动端 FAB） */}
      <p className="text-[11px] mb-3 truncate" style={{ color: 'var(--ink-3)' }}>
        共 {transports.length} 条预订 · 按出发时间排序
      </p>

      {/* 交通 / 住宿：移动端纵向堆叠，桌面端两栏 */}
      <div className="animate-fade-in space-y-6 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
        {renderSection('交通', transportList, 'flight', '点右上「添加交通」，记录班次、时间与座位', Plane)}
        {renderSection('住宿', hotelList, 'hotel', '点右上「添加住宿」，记录酒店、地址与入住日期', BedDouble)}
      </div>

      {/* 移动端悬浮添加按钮（默认打开交通弹窗） */}
      <FAB onClick={() => openAdd('flight')} label="添加交通" />

      {/* ============ 添加 / 编辑弹窗 ============ */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="text-[15px] font-medium">
                {editingId ? '编辑' : '添加'}{isHotel ? '住宿' : '交通'}
              </h3>
              <button className="btn-icon !w-10 !h-10 lg:!w-8 lg:!h-8" onClick={closeModal} aria-label="关闭">
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              {!isHotel && (
                <div>
                  <label className="form-label">类型</label>
                  <div className="chip-row">
                    {TRANSPORT_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        className={`chip ${form.type === t.value ? 'active' : ''}`}
                        onClick={() => setForm({ ...form, type: t.value })}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="form-label">{isHotel ? '订单号' : '班次号'}</label>
                <input
                  className="input-field"
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                  placeholder={isHotel ? '例如：预订号 123456' : '例如：CA1234'}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div>
                  <label className="form-label">{isHotel ? '酒店名称' : '出发地'}</label>
                  <input
                    className="input-field"
                    value={form.from}
                    onChange={(e) => setForm({ ...form, from: e.target.value })}
                    placeholder={isHotel ? '例如：希尔顿酒店' : '例如：北京'}
                  />
                </div>
                <div>
                  <label className="form-label">{isHotel ? '地址' : '到达地'}</label>
                  <input
                    className="input-field"
                    value={form.to}
                    onChange={(e) => setForm({ ...form, to: e.target.value })}
                    placeholder={isHotel ? '例如：首尔明洞' : '例如：首尔'}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div>
                  <label className="form-label">{isHotel ? '入住日期' : '出发时间'}</label>
                  <input
                    type={isHotel ? 'date' : 'datetime-local'}
                    className="input-field"
                    value={form.departTime}
                    onChange={(e) => setForm({ ...form, departTime: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">{isHotel ? '退房日期' : '到达时间'}</label>
                  <input
                    type={isHotel ? 'date' : 'datetime-local'}
                    className="input-field"
                    value={form.arriveTime}
                    onChange={(e) => setForm({ ...form, arriveTime: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="form-label">{isHotel ? '晚数 / 房型' : '座位号'}</label>
                <input
                  className="input-field"
                  value={form.seat}
                  onChange={(e) => setForm({ ...form, seat: e.target.value })}
                  placeholder={isHotel ? '例如：2晚 大床房' : '例如：12A 二等座'}
                />
              </div>

              <div>
                <label className="form-label">备注</label>
                <input
                  className="input-field"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="添加备注信息..."
                />
              </div>
            </div>

            <div className="modal-foot">
              <button className="btn-ghost flex-1" onClick={closeModal}>取消</button>
              <button className="btn-primary flex-1" onClick={handleSave}>保存</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmSheet
        open={!!pendingDelete}
        title={pendingDelete?.hotel ? '删除这条住宿？' : '删除这条交通？'}
        description={pendingDelete ? `「${pendingDelete.title}」删除后无法恢复。` : undefined}
        onConfirm={() => {
          if (pendingDelete) handleDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
