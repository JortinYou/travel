import { useEffect } from 'react';

/**
 * 弹窗打开时锁定背景页面滚动。
 * 移动端点输入框弹出键盘时，iOS/Android 会把整个 fixed 弹窗连同页面一起顶走，
 * 导致弹窗上半部分被顶栏盖住、无法点击输入。锁定 body 后页面不再被滚动。
 * 同时监听 focusin，把聚焦的输入框滚回弹窗可视区中间。
 */
export default function useBodyScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const y = window.scrollY;
    const body = document.body;
    const prevCss = body.style.cssText;
    body.style.position = 'fixed';
    body.style.top = `-${y}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.overflow = 'hidden';

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (!t.closest('.modal-content')) return;
      // 等键盘弹出、视口稳定后再滚动
      setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
    };
    document.addEventListener('focusin', onFocusIn);

    return () => {
      body.style.cssText = prevCss;
      window.scrollTo(0, y);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open]);
}
