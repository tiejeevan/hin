const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(el => {
    if (el.closest('[aria-hidden="true"]')) return false;
    return el.getClientRects().length > 0;
  });
}

/** Trap Tab focus within `container`. Returns a teardown function. */
export function trapFocus(container: HTMLElement): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const focusable = getFocusableElements(container);
    if (focusable.length === 0) {
      e.preventDefault();
      if (container.tabIndex < 0) container.tabIndex = -1;
      container.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (!active || active === first || !container.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (!active || active === last || !container.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}
