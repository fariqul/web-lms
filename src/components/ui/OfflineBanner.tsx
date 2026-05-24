'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { WifiOff, Wifi, X } from 'lucide-react';

export function OfflineBanner() {
  // Always start as online to prevent SSR hydration mismatch / false flash
  const [isOnline, setIsOnline] = useState(true);
  const [showReconnected, setShowReconnected] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Robust check to double check with a fetch if navigator says offline
  const verifyConnectivity = useCallback(async () => {
    if (!navigator.onLine) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        // Fetch favicon or any tiny static file from origin to see if we're actually connected
        const response = await fetch('/favicon.ico', {
          method: 'HEAD',
          signal: controller.signal,
          cache: 'no-store',
        });
        clearTimeout(timeoutId);
        if (response.ok || response.status < 500) {
          setIsOnline(true);
          return;
        }
      } catch (e) {
        // Fetch failed, we are indeed offline
      }
      setIsOnline(false);
    } else {
      setIsOnline(true);
    }
  }, []);

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    setDismissed(false);
    setShowReconnected(true);
    // Auto-hide reconnected message after 3 seconds
    setTimeout(() => setShowReconnected(false), 3000);
  }, []);

  const handleOffline = useCallback(() => {
    verifyConnectivity();
  }, [verifyConnectivity]);

  useEffect(() => {
    // Delay the initial check to avoid false positives on slow page loads
    const initTimer = setTimeout(async () => {
      await verifyConnectivity();
      setMounted(true);
    }, 1500);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      clearTimeout(initTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline, verifyConnectivity]);

  // Don't show anything until after the delayed mount check
  if (!mounted && isOnline) return null;

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
            className="text-white/80 hover:text-white flex-shrink-0 cursor-pointer"
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
      <div className="fixed top-0 left-0 right-0 z-[110] bg-green-600 text-white px-4 py-2.5 shadow-lg print:hidden transition-colors">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
          <Wifi className="w-4 h-4" />
          <span className="text-sm font-medium">Koneksi internet pulih kembali.</span>
        </div>
      </div>
    );
  }

  return null;
}
