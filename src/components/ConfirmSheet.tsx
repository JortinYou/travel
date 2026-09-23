import { AlertTriangle } from 'lucide-react';

interface ConfirmSheetProps {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 全局唯一的删除确认弹窗：移动端底部抽屉 / 桌面端居中 */
export default function ConfirmSheet({
  open,
  title,
  description,
  confirmText = '确认删除',
  cancelText = '取消',
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content lg:max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-6 pb-5">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center mb-3"
            style={{ background: 'var(--danger-soft)' }}
          >
            <AlertTriangle size={19} style={{ color: 'var(--danger)' }} />
          </div>
          <h3 className="text-[16px] font-medium">{title}</h3>
          {description && (
            <p className="text-[13px] leading-relaxed mt-1.5" style={{ color: 'var(--ink-2)' }}>
              {description}
            </p>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-ghost flex-1" onClick={onCancel}>{cancelText}</button>
          <button className="btn-danger flex-1" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
