import { useState, useMemo } from 'react';
import { useTravelStore } from '@/store/useTravelStore';
import { cn } from '@/lib/utils';
import FAB from '@/components/FAB';
import type { PackingItem } from '@/types';
import { Plus, Trash2, Luggage, ChevronDown, ChevronUp, Check, X, ListPlus } from 'lucide-react';

const DEFAULT_CATEGORIES = ['证件', '衣物', '电子产品', '洗漱用品', '药品', '其他'];

// 默认清单预设：按分类快速载入常见物品
const PRESET_ITEMS: Record<string, string[]> = {
  '证件': ['护照', '身份证', '签证', '驾照', '旅行保险单', '酒店预订单', '机票行程单', '银行卡'],
  '衣物': ['内衣', '袜子', 'T恤', '外套', '长裤', '睡衣', '拖鞋', '运动鞋', '帽子', '围巾'],
  '电子产品': ['手机', '充电器', '充电宝', '耳机', '转换插头', '相机', '平板电脑'],
  '洗漱用品': ['牙刷', '牙膏', '洗面奶', '毛巾', '洗发水', '沐浴露', '护肤品', '防晒霜', '剃须刀'],
  '药品': ['感冒药', '肠胃药', '创可贴', '退烧药', '晕车药', '消毒湿巾', '口罩'],
  '其他': ['雨伞', '水杯', '零食', '旅行枕', '眼罩', '购物袋', '锁具'],
};

/** 按分类分组，并保证默认分类始终存在 */
function groupByCategory(items: PackingItem[]): Map<string, PackingItem[]> {
  const map = new Map<string, PackingItem[]>();
  for (const item of items) {
    const list = map.get(item.category) || [];
    list.push(item);
    map.set(item.category, list);
  }
  for (const cat of DEFAULT_CATEGORIES) {
    if (!map.has(cat)) {
      map.set(cat, []);
    }
  }
  return map;
}

/** 第一个有物品的分类：默认只展开它 */
function firstNonEmptyCategory(items: PackingItem[]): string | undefined {
  return DEFAULT_CATEGORIES.find((cat) => items.some((i) => i.category === cat));
}

function toCatSet(cat: string | undefined): Set<string> {
  return new Set(cat ? [cat] : []);
}

export default function PackingList() {
  const { trips, currentTripId, addPackingItem, togglePacked, removePackingItem } = useTravelStore();

  const trip = trips.find((t) => t.id === currentTripId);
  const items = trip?.packingItems || [];

  const [showModal, setShowModal] = useState(false);
  const [newCategory, setNewCategory] = useState('证件');
  const [newName, setNewName] = useState('');
  // 展开的分类集合：默认只展开第一个非空分类
  const [expandedCats, setExpandedCats] = useState<Set<string>>(() =>
    toCatSet(firstNonEmptyCategory(items))
  );

  // 切换行程 / 由空清单载入物品后，回到「只展开第一个非空分类」
  const ctxKey = `${currentTripId}|${items.length === 0}`;
  const [lastCtxKey, setLastCtxKey] = useState(ctxKey);
  if (lastCtxKey !== ctxKey) {
    setLastCtxKey(ctxKey);
    setExpandedCats(toCatSet(firstNonEmptyCategory(items)));
  }

  const grouped = useMemo(() => groupByCategory(items), [items]);

  const packedCount = items.filter((i) => i.packed).length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? (packedCount / totalCount) * 100 : 0;
  const allPacked = totalCount > 0 && packedCount === totalCount;

  function toggleCategory(cat: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  function handleAdd() {
    if (!currentTripId || !newName.trim()) return;
    addPackingItem(currentTripId, {
      id: crypto.randomUUID(),
      category: newCategory,
      name: newName.trim(),
      packed: false,
    });
    setNewName('');
    setShowModal(false);
  }

  function handleDelete(id: string) {
    if (!currentTripId) return;
    removePackingItem(currentTripId, id);
  }

  function handleToggle(id: string) {
    if (!currentTripId) return;
    togglePacked(currentTripId, id);
  }

  // 载入默认清单：跳过已存在的「分类 + 名称」重复项
  function addPresetItems() {
    if (!currentTripId) return;
    for (const [cat, names] of Object.entries(PRESET_ITEMS)) {
      for (const name of names) {
        if (items.some((i) => i.category === cat && i.name === name)) continue;
        addPackingItem(currentTripId, {
          id: crypto.randomUUID(),
          category: cat,
          name,
          packed: false,
        });
      }
    }
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

  return (
    <div className="px-4 py-4 lg:px-6 lg:py-6 lg:max-w-5xl lg:mx-auto">
      {/* 页头：左侧进度 + 计数，右侧操作（标题由顶栏/侧栏承担） */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0 flex-1 lg:max-w-sm">
          <div className="progress-track flex-1">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <p
            className="text-[12px] shrink-0 whitespace-nowrap"
            style={allPacked ? { color: 'var(--ink)', fontWeight: 600 } : { color: 'var(--ink-2)' }}
          >
            {allPacked ? `全部打包完成 ✓ ${packedCount}/${totalCount}` : `${packedCount} / ${totalCount} 已打包`}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button className="btn-ghost text-[12px]" onClick={addPresetItems}>
            <ListPlus size={14} />
            载入默认清单
          </button>
          <button className="btn-primary hidden lg:inline-flex ml-1.5" onClick={() => setShowModal(true)}>
            <Plus size={15} />
            添加物品
          </button>
        </div>
      </div>

      <div className="animate-fade-in">
        {totalCount === 0 ? (
          /* 页面空状态：线条图标 + 一句主文案 + 一句引导 + 一个按钮 */
          <div className="py-20 flex flex-col items-center text-center">
            <Luggage size={30} strokeWidth={1.5} className="mb-3" style={{ color: 'var(--ink-4)' }} />
            <p className="text-[15px] mb-1" style={{ color: 'var(--ink)', fontWeight: 500 }}>
              行李清单是空的
            </p>
            <p className="text-[13px] mb-5" style={{ color: 'var(--ink-3)' }}>
              载入默认清单，或点右下角 ＋ 自己加
            </p>
            <button className="btn-primary" onClick={addPresetItems}>
              <ListPlus size={15} />
              载入默认清单
            </button>
          </div>
        ) : (
          /* 分类清单：移动端单列，桌面端两列；空分类不渲染 */
          <div className="space-y-2.5 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start">
            {DEFAULT_CATEGORIES.map((cat) => {
              const catItems = grouped.get(cat) || [];
              if (catItems.length === 0) return null;
              const catPacked = catItems.filter((i) => i.packed).length;
              const isOpen = expandedCats.has(cat);

              return (
                <div key={cat} className="card-flat overflow-hidden">
                  {/* 分类头：整行可点，切换展开/折叠 */}
                  <button
                    onClick={() => toggleCategory(cat)}
                    aria-expanded={isOpen}
                    className="w-full touch-row flex items-center gap-2 px-4 py-3 min-h-[48px]"
                  >
                    <span className="flex-1 min-w-0 text-left text-[14px] truncate" style={{ color: 'var(--ink)' }}>
                      {cat}
                    </span>
                    <span className="text-[12px] shrink-0" style={{ color: 'var(--ink-3)' }}>
                      {catPacked}/{catItems.length}
                    </span>
                    {isOpen ? (
                      <ChevronUp size={16} className="shrink-0" style={{ color: 'var(--ink-4)' }} />
                    ) : (
                      <ChevronDown size={16} className="shrink-0" style={{ color: 'var(--ink-4)' }} />
                    )}
                  </button>

                  {/* 分类内容：物品列表（行间用极淡分隔线） */}
                  {isOpen && (
                    <div className="pb-1.5">
                      {catItems.map((item) => (
                        <div key={item.id} className="hairline group flex items-center gap-2 px-4">
                          {/* 勾选区域：整块可点，切换打包状态 */}
                          <button
                            onClick={() => handleToggle(item.id)}
                            className="touch-row flex-1 min-w-0 flex items-center gap-3 text-left py-3 min-h-[44px]"
                            title={item.packed ? '标记为未打包' : '标记为已打包'}
                            aria-label={item.packed ? `取消打包 ${item.name}` : `打包 ${item.name}`}
                          >
                            <span
                              className="rounded-md flex items-center justify-center shrink-0 transition-colors"
                              style={
                                item.packed
                                  ? { width: 20, height: 20, background: 'var(--accent)' }
                                  : {
                                      width: 20,
                                      height: 20,
                                      background: 'transparent',
                                      border: '1.5px solid var(--line)',
                                    }
                              }
                            >
                              {item.packed && <Check size={13} strokeWidth={3} style={{ color: 'var(--ink)' }} />}
                            </span>
                            <span
                              className={cn('text-[13px] truncate', item.packed && 'line-through')}
                              style={{ color: item.packed ? 'var(--ink-3)' : 'var(--ink)' }}
                            >
                              {item.name}
                            </span>
                          </button>
                          {/* 删除：移动端常显，桌面端悬停显示 */}
                          <button
                            className="btn-icon danger w-10 h-10 shrink-0 -mr-1.5 lg:w-8 lg:h-8 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                            title="删除"
                            aria-label={`删除 ${item.name}`}
                            onClick={() => handleDelete(item.id)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 移动端悬浮添加按钮 */}
      <FAB onClick={() => setShowModal(true)} label="添加物品" />

      {/* 添加物品弹窗 */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="text-[15px]" style={{ fontWeight: 500 }}>添加物品</h3>
              <button className="btn-icon" aria-label="关闭" onClick={() => setShowModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              <div>
                <label className="form-label">分类</label>
                <div className="tint-block p-1.5">
                  <div className="chip-row">
                    {DEFAULT_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        className={cn('chip', newCategory === cat && 'active')}
                        aria-pressed={newCategory === cat}
                        onClick={() => setNewCategory(cat)}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="form-label">物品名称</label>
                <input
                  className="input-field"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例如：护照"
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  autoComplete="off"
                  autoFocus
                />
              </div>
            </div>

            <div className="modal-foot">
              <button className="btn-ghost flex-1 lg:flex-none" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn-primary flex-1 lg:flex-none" onClick={handleAdd} disabled={!newName.trim()}>
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
