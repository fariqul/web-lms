'use client';

import { useState, useEffect, useMemo } from 'react';

interface DevicePerformance {
  isLowEnd: boolean;
  prefersReducedMotion: boolean;
  connectionType: 'slow' | 'fast' | 'unknown';
  deviceMemory: number | null;
  hardwareConcurrency: number;
  isMobile: boolean;
  isTouch: boolean;
}

/**
 * Hook to detect device performance capabilities
 * Useful for conditionally reducing animations/effects on low-end devices
 */
export function useDevicePerformance(): DevicePerformance {
  const [connectionType, setConnectionType] = useState<'slow' | 'fast' | 'unknown'>('unknown');

  // Check reduced motion preference
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Check device memory (Chrome only)
  const deviceMemory = useMemo(() => {
    if (typeof navigator === 'undefined') return null;
    // @ts-expect-error - deviceMemory is not in standard types
    return navigator.deviceMemory ?? null;
  }, []);

  // Check hardware concurrency (CPU cores)
  const hardwareConcurrency = useMemo(() => {
    if (typeof navigator === 'undefined') return 4;
    return navigator.hardwareConcurrency ?? 4;
  }, []);

  // Check if mobile device
  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) || window.innerWidth < 768;
  }, []);

  // Check if touch device
  const isTouch = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }, []);

  // Monitor connection type
  useEffect(() => {
    if (typeof navigator === 'undefined') return;

    const updateConnection = () => {
      // @ts-expect-error - connection is not in standard types
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (conn) {
        const effectiveType = conn.effectiveType;
        if (effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g') {
          setConnectionType('slow');
        } else {
          setConnectionType('fast');
        }
      }
    };

    updateConnection();

    // @ts-expect-error - connection is not in standard types
    const conn = navigator.connection;
    if (conn) {
      conn.addEventListener('change', updateConnection);
      return () => conn.removeEventListener('change', updateConnection);
    }
  }, []);

  // Determine if low-end device
  const isLowEnd = useMemo(() => {
    // Low memory (< 4GB)
    if (deviceMemory !== null && deviceMemory < 4) return true;
    
    // Low CPU cores (< 4)
    if (hardwareConcurrency < 4) return true;
    
    // Slow connection
    if (connectionType === 'slow') return true;
    
    // User prefers reduced motion
    if (prefersReducedMotion) return true;
    
    return false;
  }, [deviceMemory, hardwareConcurrency, connectionType, prefersReducedMotion]);

  return {
    isLowEnd,
    prefersReducedMotion,
    connectionType,
    deviceMemory,
    hardwareConcurrency,
    isMobile,
    isTouch,
  };
}

/**
 * Simple hook to check if should reduce animations
 */
export function useShouldReduceAnimations(): boolean {
  const { isLowEnd, prefersReducedMotion } = useDevicePerformance();
  return isLowEnd || prefersReducedMotion;
}
