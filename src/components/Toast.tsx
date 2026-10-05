'use client';

import { useEffect } from 'react';
import { useLibraryStore } from '../store/useLibraryStore';

export function Toast() {
  const toastMessage = useLibraryStore((state) => state.toastMessage);
  const setToastMessage = useLibraryStore((state) => state.setToastMessage);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toastMessage, setToastMessage]);

  if (!toastMessage) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 z-50 bg-slate-900 border border-amber-500/40 text-amber-400 font-semibold text-xs md:text-sm px-4 py-3 rounded-xl shadow-2xl backdrop-blur-xl flex items-center space-x-2 animate-bounce">
      <span>✨</span>
      <span>{toastMessage}</span>
    </div>
  );
}
