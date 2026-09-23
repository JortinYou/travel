import { useState, useRef } from 'react';
import { useTravelStore } from '@/store/useTravelStore';
import { Pencil, Trash2, Plus, Download, Upload, X, Compass } from 'lucide-react';
import FAB from '@/components/FAB';
import ConfirmSheet from '@/components/ConfirmSheet';
import useBodyScrollLock from '@/hooks/useBodyScrollLock';
import type { Trip } from '@/types';

const CURRENCIES = [
  { value: 'CNY', label: '人民币 CNY' },
  { value: 'USD', label: '美元 USD' },
  { value: 'KRW', label: '韩元 KRW' },
  { value: 'JPY', label: '日元 JPY' },
  { value: 'EUR', label: '欧元 EUR' },
  { value: 'THB', label: '泰铢 THB' },
  { value: 'HKD', label: '港币 HKD' },
];

/** 日期区间，如 "5月1日 – 5月7日" */
function formatRange(startDate: string, endDate: string): string {
  const f = (s: string) => {
    const d = new Date(s);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };
  return `${f(startDate)} – ${f(endDate)}`;
}

/** 计算天数/晚数：起止日期均计入行程天数（含首尾），晚数 = 天数 - 1 */
function dayNight(startDate: string, endDate: string): { days: number; nights: number } {
  const days = Math.max(
    1,
    Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1
  );
  return { days, nights: Math.max(0, days - 1) };
}

const emptyForm = {
  name: '',
  destination: '',
  startDate: '',
  endDate: '',
  participants: 1,
  currency: 'CNY' as string,
  notes: '',
};

export default function TripList() {
  const {
    trips,
    currentTripId,
    addTrip,
    updateTrip,
    deleteTrip,
    setCurrentTrip,
    setPage,
    exportData,
    importData,
  } = useTravelStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useBodyScrollLock(modalOpen);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (trip: Trip) => {
    setEditingId(trip.id);
    setForm({
      name: trip.name,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      participants: trip.participants,
      currency: trip.currency,
      notes: trip.notes,
    });
    setModalOpen(true);
  };

  // 关闭即清空表单，避免上一次编辑的内容残留到下一次「新建行程」
  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  // 表单校验：名称/目的地/起止日期必填，结束日期不早于开始日期
  const formValid =
    !!form.name.trim() &&
    !!form.destination.trim() &&
    !!form.startDate &&
    !!form.endDate &&
    new Date(form.endDate) >= new Date(form.startDate);

  const handleSubmit = () => {
    if (!formValid) return;

    if (editingId) {
      updateTrip(editingId, {
        name: form.name.trim(),
        destination: form.destination.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        participants: form.participants,
        currency: form.currency,
        notes: form.notes.trim(),
      });
      closeModal();
    } else {
      const newId = addTrip({
        name: form.name.trim(),
        destination: form.destination.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        participants: form.participants,
        currency: form.currency,
        notes: form.notes.trim(),
      });
      closeModal();
      setCurrentTrip(newId);
      setPage('itinerary');
    }
  };

  const handleDelete = (id: string) => {
    deleteTrip(id);
    setDeleteConfirmId(null);
  };

  const handleCardClick = (trip: Trip) => {
    setCurrentTrip(trip.id);
    setPage('itinerary');
  };

  // 导出全部数据为 JSON 文件
  const handleExport = () => {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'travel-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // 从 JSON 文件导入数据
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        importData(data);
      } catch {
        alert('导入失败，请检查文件格式');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="px-4 py-4 lg:px-6 lg:py-6 lg:max-w-5xl lg:mx-auto">
      {/* 页头：一行摘要 + 右侧操作（标题由顶栏/侧栏承担） */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <p className="text-[12px] min-w-0 truncate" style={{ color: 'var(--ink-3)' }}>
          共 {trips.length} 个行程
        </p>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            className="btn-icon w-10 h-10 lg:w-8 lg:h-8"
            title="导入"
            aria-label="导入行程数据"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={16} />
          </button>
          <button
            className="btn-icon w-10 h-10 lg:w-8 lg:h-8"
            title="导出"
            aria-label="导出行程数据"
            onClick={handleExport}
          >
            <Download size={16} />
          </button>
          <button className="btn-primary hidden lg:inline-flex ml-1.5" onClick={openCreate}>
            <Plus size={15} />
            新建行程
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
      </div>

      {trips.length === 0 ? (
        /* 空状态：线条图标 + 一句主文案 + 一句引导 + 一个按钮 */
        <div className="py-24 flex flex-col items-center text-center animate-fade-in">
          <Compass size={30} strokeWidth={1.5} className="mb-3" style={{ color: 'var(--ink-4)' }} />
          <p className="text-[15px] mb-1" style={{ color: 'var(--ink)', fontWeight: 500 }}>
            还没有行程
          </p>
          <p className="text-[13px] mb-5" style={{ color: 'var(--ink-3)' }}>
            创建一个行程，开始安排每天的计划
          </p>
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={15} />
            新建行程
          </button>
        </div>
      ) : (
        /* 行程卡片：移动端单列，桌面端网格 */
        <div className="space-y-2.5 lg:space-y-0 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3">
          {trips.map((trip) => {
            const { days, nights } = dayNight(trip.startDate, trip.endDate);
            const isCurrent = trip.id === currentTripId;
            return (
              <div
                key={trip.id}
                className="card card-hover touch-row group cursor-pointer p-4"
                onClick={() => handleCardClick(trip)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {/* ① 行程名 + 当前标记 */}
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-[16px] truncate" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                        {trip.name}
                      </h3>
                      {isCurrent && <span className="tag accent shrink-0">当前</span>}
                    </div>
                    {/* ② 日期区间 · 天数晚数 */}
                    <p className="text-[13px] mt-1" style={{ color: 'var(--ink-2)' }}>
                      {formatRange(trip.startDate, trip.endDate)} · {days}天{nights}晚
                    </p>
                    {/* ③ 目的地 · 人数 · 币种 */}
                    <p className="text-[12px] mt-0.5 truncate" style={{ color: 'var(--ink-3)' }}>
                      {trip.destination} · {trip.participants}人 · {trip.currency}
                    </p>
                  </div>

                  {/* 操作：移动端常显，桌面端悬停显示 */}
                  <div
                    className="flex items-center gap-0.5 shrink-0 -mr-1.5 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="btn-icon w-10 h-10 lg:w-8 lg:h-8"
                      title="编辑"
                      aria-label="编辑行程"
                      onClick={() => openEdit(trip)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="btn-icon danger w-10 h-10 lg:w-8 lg:h-8"
                      title="删除"
                      aria-label="删除行程"
                      onClick={() => setDeleteConfirmId(trip.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 移动端悬浮新建按钮 */}
      <FAB onClick={openCreate} label="新建行程" />

      {/* 新建 / 编辑弹窗 */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="text-[15px]" style={{ fontWeight: 500 }}>
                {editingId ? '编辑行程' : '新建行程'}
              </h3>
              <button className="btn-icon" aria-label="关闭" onClick={closeModal}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              <div>
                <label className="form-label">行程名称 *</label>
                <input
                  type="text"
                  className="input-field"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如：东京樱花之旅"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="form-label">目的地 *</label>
                <input
                  type="text"
                  className="input-field"
                  value={form.destination}
                  onChange={(e) => setForm({ ...form, destination: e.target.value })}
                  placeholder="例如：日本东京"
                  autoComplete="off"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">开始日期 *</label>
                  <input
                    type="date"
                    className="input-field"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">结束日期 *</label>
                  <input
                    type="date"
                    className="input-field"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    min={form.startDate || undefined}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">出行人数</label>
                  <input
                    type="number"
                    className="input-field"
                    value={form.participants}
                    onChange={(e) =>
                      setForm({ ...form, participants: Math.max(1, parseInt(e.target.value) || 1) })
                    }
                    min={1}
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="form-label">币种</label>
                  <select
                    className="input-field"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">备注</label>
                <textarea
                  className="input-field resize-none"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="添加一些旅行备注..."
                />
              </div>
            </div>

            <div className="modal-foot">
              <button className="btn-ghost flex-1 lg:flex-none" onClick={closeModal}>取消</button>
              <button className="btn-primary flex-1 lg:flex-none" onClick={handleSubmit} disabled={!formValid}>
                {editingId ? '保存' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      <ConfirmSheet
        open={!!deleteConfirmId}
        title="删除这个行程？"
        description="该行程的日程、交通、记账与行李清单会一并删除，且无法恢复。"
        confirmText="确认删除"
        onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  );
}
