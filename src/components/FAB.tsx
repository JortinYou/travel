import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';

interface FABProps {
  onClick: () => void;
  label?: string;
  children?: ReactNode;
}

/** 移动端右下角悬浮操作按钮，桌面端隐藏（桌面用页面内的普通按钮） */
export default function FAB({ onClick, label = '添加', children }: FABProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="fab lg:hidden no-print"
    >
      {children ?? <Plus size={24} strokeWidth={2.4} />}
    </button>
  );
}
