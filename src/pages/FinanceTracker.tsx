import { useState, useMemo } from 'react';
import { useTravelStore } from '@/store/useTravelStore';
import type { Expense, ExpenseCategory } from '@/types';
import FAB from '@/components/FAB';
import ConfirmSheet from '@/components/ConfirmSheet';
import useBodyScrollLock from '@/hooks/useBodyScrollLock';
import { Plus, Pencil, Trash2, X, Receipt } from 'lucide-react';

const CATEGORIES: ExpenseCategory[] = ['交通', '住宿', '餐饮', '门票', '购物', '其他'];

const CURRENCIES: { value: string; symbol: string; label: string }[] = [
  { value: 'CNY', symbol: '¥', label: '人民币' },
  { value: 'USD', symbol: '$', label: '美元' },
  { value: 'KRW', symbol: '₩', label: '韩元' },
  { value: 'JPY', symbol: '¥', label: '日元' },
  { value: 'EUR', symbol: '€', label: '欧元' },
  { value: 'THB', symbol: '฿', label: '泰铢' },
  { value: 'HKD', symbol: 'HK$', label: '港币' },
];

const RATES: Record<string, number> = {
  USD: 7.2,
  KRW: 0.0054,
  JPY: 0.048,
  EUR: 7.8,
  THB: 0.2,
  HKD: 0.92,
  CNY: 1,
};

function getCurrencySymbol(currency: string) {
  return CURRENCIES.find((c) => c.value === currency)?.symbol || currency;
}

function toCNY(amount: number, currency: string): number {
  return amount * (RATES[currency] || 1);
}

function formatCNY(amount: number): string {
  return `¥${amount.toFixed(2)}`;
}

interface FormData {
  amount: string;
  currency: string;
  category: ExpenseCategory;
  date: string;
  payer: string;
  note: string;
}

const emptyForm: FormData = {
  amount: '',
  currency: 'CNY',
  category: '交通',
  date: '',
  payer: '',
  note: '',
};

export default function FinanceTracker() {
  const { trips, currentTripId, settings, addExpense, updateExpense, removeExpense } = useTravelStore();

  const trip = trips.find((t) => t.id === currentTripId);
  const expenses = trip?.expenses || [];
  const participants = trip?.participants || 1;

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  useBodyScrollLock(showModal);
  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | '全部'>('全部');
  const [budget, setBudget] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);

  const filteredExpenses = useMemo(() => {
    if (filterCategory === '全部') return expenses;
    return expenses.filter((e) => e.category === filterCategory);
  }, [expenses, filterCategory]);

  const sortedExpenses = useMemo(() => {
    return [...filteredExpenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredExpenses]);

  const totalCNY = useMemo(() => {
    return expenses.reduce((sum, e) => sum + toCNY(e.amount, e.currency), 0);
  }, [expenses]);

  const filteredTotalCNY = useMemo(() => {
    return sortedExpenses.reduce((sum, e) => sum + toCNY(e.amount, e.currency), 0);
  }, [sortedExpenses]);

  const perPerson = totalCNY / (participants || 1);
  const budgetNum = parseFloat(budget);
  const hasBudget = !isNaN(budgetNum) && budgetNum > 0;
  const remaining = hasBudget ? budgetNum - totalCNY : null;

  function openAdd() {
    setEditingId(null);
    setForm({ ...emptyForm, currency: settings.defaultCurrency || 'CNY' });
    setShowModal(true);
  }

  function openEdit(item: Expense) {
    setEditingId(item.id);
    setForm({
      amount: String(item.amount),
      currency: item.currency,
      category: item.category,
      date: item.date,
      payer: item.payer,
      note: item.note,
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setForm(emptyForm);
    setEditingId(null);
  }

  function handleSave() {
    if (!currentTripId || !form.amount) return;
    const data: Expense = {
      id: editingId || crypto.randomUUID(),
      amount: parseFloat(form.amount) || 0,
      currency: form.currency,
      category: form.category,
      date: form.date,
      payer: form.payer,
      note: form.note,
    };

    if (editingId) {
      updateExpense(currentTripId, editingId, data);
    } else {
      addExpense(currentTripId, data);
    }
    closeModal();
  }

  function handleDelete(id: string) {
    if (!currentTripId) return;
    removeExpense(currentTripId, id);
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

  const filters: (ExpenseCategory | '全部')[] = ['全部', ...CATEGORIES];

  return (
    <div className="px-4 py-4 lg:px-6 lg:py-6 lg:max-w-5xl lg:mx-auto">
      <div className="animate-fade-in">
        {/* ============ 首行：摘要小字 + 桌面端主操作 ============ */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>
            默认币种 {settings.defaultCurrency || 'CNY'}
          </p>
          <button className="btn-primary hidden lg:inline-flex" onClick={openAdd}>
            <Plus size={15} />
            记一笔
          </button>
        </div>

        {/* ============ 汇总 Hero ============ */}
        <div className="card-flat p-5">
          <div className="hairline">
            <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
              全部消费 · {expenses.length} 笔
            </p>
            <p
              className="text-[32px] leading-tight tabular-nums mt-1.5"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
            >
              ¥{Math.round(totalCNY).toLocaleString('zh-CN')}
            </p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>
              按交易当天汇率折合人民币
            </p>
            {participants > 1 && (
              <p className="text-[12px] mt-2 tabular-nums" style={{ color: 'var(--ink-2)' }}>
                {participants} 人同行 · 每人 {formatCNY(perPerson)}
              </p>
            )}
          </div>

          {/* 预算：同一张卡底部内联编辑 */}
          <div className="hairline mt-3.5 pt-3 flex items-center gap-2">
            <span className="text-[12px] shrink-0" style={{ color: 'var(--ink-3)' }}>预算</span>
            <input
              type="number"
              inputMode="decimal"
              className="flex-1 min-w-0 bg-transparent outline-none text-[13px] tabular-nums placeholder:font-normal [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="未设置"
              aria-label="预算"
            />
            {remaining != null && (
              <span className={`tag shrink-0 tabular-nums ${remaining < 0 ? 'danger' : ''}`}>
                {remaining < 0 ? '超支 ' : '结余 '}
                {formatCNY(Math.abs(remaining))}
              </span>
            )}
          </div>
        </div>

        {/* ============ 类别筛选 ============ */}
        <div className="chip-row mt-4 -mx-4 px-4 lg:mx-0 lg:px-0">
          {filters.map((cat) => {
            const active = filterCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`chip ${active ? 'active' : ''}`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* ============ 支出明细 ============ */}
        {sortedExpenses.length === 0 ? (
          <div className="card-flat py-14 px-4 text-center mt-4">
            <Receipt size={22} className="mx-auto" style={{ color: 'var(--ink-4)' }} strokeWidth={1.6} />
            <p className="text-[13px] mt-3 px-2 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              {expenses.length === 0
                ? '还没有记账 · 点右下角 ＋ 记一笔，选当地币种填金额，自动折算人民币'
                : '该类别下暂无支出'}
            </p>
          </div>
        ) : (
          <>
            {/* 移动端：卡片列表 */}
            <div className="space-y-2.5 mt-4 lg:hidden">
              {sortedExpenses.map((item) => (
                <div
                  key={item.id}
                  className="card-flat p-3.5 touch-row flex items-start gap-3"
                  onClick={() => openEdit(item)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] truncate" style={{ color: 'var(--ink-2)' }}>
                      {item.category}
                    </p>
                    {(item.note || item.payer) && (
                      <p className="text-[12px] mt-1 truncate" style={{ color: 'var(--ink-3)' }}>
                        {[item.note, item.payer].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <p className="text-[11px] mt-1 tabular-nums" style={{ color: 'var(--ink-3)' }}>
                      {item.date}
                    </p>
                  </div>

                  <div className="shrink-0 flex items-start gap-1.5">
                    <div className="text-right">
                      <p className="text-[16px] font-semibold tabular-nums leading-tight">
                        {getCurrencySymbol(item.currency)}{item.amount.toLocaleString('zh-CN')}
                      </p>
                      {item.currency !== 'CNY' && (
                        <p className="text-[11px] mt-1 tabular-nums" style={{ color: 'var(--ink-3)' }}>
                          ≈ {formatCNY(toCNY(item.amount, item.currency))}
                        </p>
                      )}
                    </div>
                    <button
                      className="btn-icon danger"
                      title="删除"
                      aria-label="删除"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete(item);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* 移动端：筛选合计（仅在筛选时显示，避免与汇总卡重复） */}
            {filterCategory !== '全部' && (
              <p
                className="text-[11px] mt-3 text-center tabular-nums lg:hidden"
                style={{ color: 'var(--ink-3)' }}
              >
                {filterCategory} {sortedExpenses.length} 笔 · 合计 {formatCNY(filteredTotalCNY)}
              </p>
            )}

            {/* 桌面端：数据表格 */}
            <div className="hidden lg:block lg:mt-5">
              <div className="card-flat overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>日期</th>
                        <th>类别</th>
                        <th className="!text-right">金额</th>
                        <th>付款人</th>
                        <th>备注</th>
                        <th className="!text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedExpenses.map((item) => (
                        <tr key={item.id}>
                          <td className="whitespace-nowrap text-[13px] tabular-nums" style={{ color: 'var(--ink-2)' }}>
                            {item.date}
                          </td>
                          <td className="text-[13px]">{item.category}</td>
                          <td className="text-right whitespace-nowrap">
                            <div className="text-[13px] font-medium tabular-nums">
                              {getCurrencySymbol(item.currency)}{item.amount.toFixed(2)} {item.currency}
                            </div>
                            {item.currency !== 'CNY' && (
                              <div className="text-[11px] mt-0.5 tabular-nums" style={{ color: 'var(--ink-3)' }}>
                                ≈ {formatCNY(toCNY(item.amount, item.currency))}
                              </div>
                            )}
                          </td>
                          <td className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
                            {item.payer || '—'}
                          </td>
                          <td className="max-w-[160px] truncate text-[13px]" style={{ color: 'var(--ink-3)' }}>
                            {item.note}
                          </td>
                          <td>
                            <div className="flex items-center justify-center gap-1">
                              <button className="btn-icon" title="编辑" aria-label="编辑" onClick={() => openEdit(item)}>
                                <Pencil size={14} />
                              </button>
                              <button
                                className="btn-icon danger"
                                title="删除"
                                aria-label="删除"
                                onClick={() => setPendingDelete(item)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td
                          colSpan={2}
                          className="px-4 py-3 text-xs"
                          style={{ color: 'var(--ink-3)', borderTop: '1px solid var(--line-soft)' }}
                        >
                          共 {sortedExpenses.length} 笔 · 合计
                        </td>
                        <td
                          className="px-4 py-3 text-right text-[13px] font-medium whitespace-nowrap tabular-nums"
                          style={{ borderTop: '1px solid var(--line-soft)' }}
                        >
                          {formatCNY(filteredTotalCNY)}
                        </td>
                        <td colSpan={3} style={{ borderTop: '1px solid var(--line-soft)' }} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 移动端悬浮添加按钮 */}
      <FAB onClick={openAdd} label="记一笔" />

      {/* ============ 添加 / 编辑弹窗 ============ */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="text-[15px] font-medium">{editingId ? '编辑支出' : '记一笔'}</h3>
              <button className="btn-icon !w-10 !h-10 lg:!w-8 lg:!h-8" onClick={closeModal} aria-label="关闭">
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              <div>
                <label className="form-label">类别</label>
                <div className="chip-row">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`chip ${form.category === cat ? 'active' : ''}`}
                      onClick={() => setForm({ ...form, category: cat })}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">金额</label>
                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    className="input-field"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00"
                    autoFocus
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
                      <option key={c.value} value={c.value}>{c.value} {c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">日期</label>
                <input
                  type="date"
                  className="input-field"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>

              <div>
                <label className="form-label">付款人</label>
                <input
                  className="input-field"
                  value={form.payer}
                  onChange={(e) => setForm({ ...form, payer: e.target.value })}
                  placeholder="例如：张三"
                />
              </div>

              <div>
                <label className="form-label">备注</label>
                <input
                  className="input-field"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="添加备注..."
                />
              </div>
            </div>

            <div className="modal-foot">
              <button className="btn-ghost flex-1" onClick={closeModal}>取消</button>
              <button className="btn-primary flex-1" onClick={handleSave} disabled={!form.amount}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmSheet
        open={!!pendingDelete}
        title="删除这笔支出？"
        description={
          pendingDelete
            ? `${pendingDelete.category} · ${getCurrencySymbol(pendingDelete.currency)}${pendingDelete.amount.toLocaleString('zh-CN')}，删除后无法恢复。`
            : undefined
        }
        onConfirm={() => {
          if (pendingDelete) handleDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
