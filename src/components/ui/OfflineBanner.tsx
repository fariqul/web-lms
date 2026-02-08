'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { WifiOff, Wifi, X } from 'lucide-react';

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [showReconnected, setShowReconnected] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    setDismissed(false);
    setShowReconnected(true);
    // Auto-hide reconnected message after 3 seconds
    setTimeout(() => setShowReconnected(false), 3000);
  }, []);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    setDismissed(false);
    setShowReconnected(false);
  }, []);

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  // Offline banner
  if (!isOnline && !dismissed) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[110] bg-red-600 text-white px-4 py-2.5 shadow-lg print:hidden">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-medium">
              Tidak ada koneksi internet. Beberapa fitur mungkin tidak berfungsi.
            </span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-white/80 hover:text-white flex-shrink-0"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Reconnected banner (auto-hides)
  if (showReconnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[110] bg-green-600 text-white px-4 py-2.5 shadow-lg print:hidden transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
          <Wifi className="w-4 h-4" />
          <span className="text-sm font-medium">Koneksi internet pulih kembali.</span>
        </div>
      </div>
    );
  }

  return null;
}
