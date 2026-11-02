'use client';
import { useEffect } from 'react';

/** Calls onClose when clicking outside `ref` or pressing Escape, while `open` is true. */
export function useOutside(ref, open, onClose) {
  useEffect(() => {
    if (!open) return;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [ref, open, onClose]);
}
