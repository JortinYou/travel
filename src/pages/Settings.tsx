import { useState, useRef } from 'react';
import { useTravelStore } from '@/store/useTravelStore';
import type { MapProvider } from '@/types';
import { Download, Upload, Trash2 } from 'lucide-react';
import ConfirmSheet from '@/components/ConfirmSheet';

const MAP_PROVIDERS: { value: MapProvider; label: string }[] = [
  { value: 'amap', label: '高德地图' },
  { value: 'google', label: 'Google Maps' },
  { value: 'baidu', label: '百度地图' },
  { value: 'leaflet', label: 'Leaflet（免费）' },
];

const CURRENCIES = [
  { value: 'CNY', label: '人民币 CNY' },
  { value: 'USD', label: '美元 USD' },
  { value: 'KRW', label: '韩元 KRW' },
  { value: 'JPY', label: '日元 JPY' },
  { value: 'EUR', label: '欧元 EUR' },
  { value: 'THB', label: '泰铢 THB' },
  { value: 'HKD', label: '港币 HKD' },
];

export default function SettingsPage() {
  const { settings, updateSettings, exportData, importData, clearAll } = useTravelStore();

  const [localSettings, setLocalSettings] = useState({ ...settings });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 保存设置，并短暂显示「已保存」反馈
  function handleSave() {
    updateSettings(localSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // 导出全部数据为 JSON 文件
  function handleExport() {
    const data = exportData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `travel-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 从 JSON 文件导入数据
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string);
        importData(data);
        setLocalSettings({ ...data.settings });
      } catch {
        alert('导入失败：文件格式不正确');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // 清除全部数据并重置本地表单
  function handleClearAll() {
    clearAll();
    setShowClearConfirm(false);
    setLocalSettings({
      mapProvider: 'leaflet',
      amapKey: '',
      googleKey: '',
      baiduKey: '',
      defaultCurrency: 'CNY',
    });
  }

  // 只渲染当前所选地图服务的 Key 输入框（其余 Key 仍保留在 store 中）
  function renderKeyField(
    label: string,
    placeholder: string,
    value: string,
    onChange: (value: string) => void
  ) {
    return (
      <div>
        <label className="form-label">{label}</label>
        <input
          className="input-field"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
        />
        <p className="field-hint">切换地图服务后可编辑对应服务的 Key</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 lg:px-6 lg:py-6 lg:max-w-5xl lg:mx-auto">
      <div className="space-y-6 animate-fade-in lg:max-w-xl">
        {/* 地图服务 */}
        <section>
          <p className="text-[12px] mb-3" style={{ color: 'var(--ink-3)' }}>地图服务</p>
          <div className="space-y-3.5">
            <div>
              <label className="form-label">地图提供商</label>
              <select
                className="input-field"
                value={localSettings.mapProvider}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, mapProvider: e.target.value as MapProvider })
                }
              >
                {MAP_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            {localSettings.mapProvider === 'amap' &&
              renderKeyField(
                '高德地图 API Key',
                '输入高德地图 JS API Key',
                localSettings.amapKey,
                (v) => setLocalSettings({ ...localSettings, amapKey: v })
              )}
            {localSettings.mapProvider === 'google' &&
              renderKeyField(
                'Google Maps API Key',
                '输入 Google Maps API Key',
                localSettings.googleKey,
                (v) => setLocalSettings({ ...localSettings, googleKey: v })
              )}
            {localSettings.mapProvider === 'baidu' &&
              renderKeyField(
                '百度地图 API Key',
                '输入百度地图 AK',
                localSettings.baiduKey,
                (v) => setLocalSettings({ ...localSettings, baiduKey: v })
              )}
            {localSettings.mapProvider === 'leaflet' && (
              <p className="field-hint">当前使用免费 OpenStreetMap，无需 Key</p>
            )}
          </div>
        </section>

        {/* 偏好 */}
        <section>
          <p className="text-[12px] mb-3" style={{ color: 'var(--ink-3)' }}>偏好</p>
          <div>
            <label className="form-label">默认币种</label>
            <select
              className="input-field"
              value={localSettings.defaultCurrency}
              onChange={(e) => setLocalSettings({ ...localSettings, defaultCurrency: e.target.value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <p className="field-hint">新建行程与记账时的初始币种</p>
          </div>
        </section>

        {/* 数据 */}
        <section>
          <p className="text-[12px] mb-3" style={{ color: 'var(--ink-3)' }}>数据</p>
          {/* 移动端全宽堆叠，桌面端横排 */}
          <div className="space-y-2 lg:space-y-0 lg:flex lg:flex-row lg:gap-2">
            <button className="btn-outline w-full lg:w-auto" onClick={handleExport}>
              <Download size={15} />
              导出数据
            </button>
            <button className="btn-outline w-full lg:w-auto" onClick={() => fileInputRef.current?.click()}>
              <Upload size={15} />
              导入数据
            </button>
            <button
              className="btn-ghost w-full lg:w-auto"
              style={{ color: 'var(--danger)' }}
              onClick={() => setShowClearConfirm(true)}
            >
              <Trash2 size={15} />
              清除全部数据
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
          <p className="field-hint">导出为 JSON 备份；导入会覆盖当前全部数据</p>
        </section>

        {/* 保存操作：移动端全宽 */}
        <div>
          <button className="btn-primary w-full lg:w-auto" onClick={handleSave}>
            {saved ? '已保存 ✓' : '保存设置'}
          </button>
        </div>
      </div>

      {/* 清除全部数据确认 */}
      <ConfirmSheet
        open={showClearConfirm}
        title="清除全部数据？"
        description="此操作不可撤销，所有行程、记账和清单都会被删除。"
        confirmText="确认清除"
        onConfirm={handleClearAll}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
