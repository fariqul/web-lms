'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';

type ForceLogoutReason = 'blocked' | 'session_expired' | 'removed_by_admin';

interface ForceLogoutDetail {
  reason?: ForceLogoutReason;
  message?: string;
}

export function SessionEventHandler() {
  const { logout } = useAuth();
  const toast = useToast();
  const isHandlingRef = useRef(false);

  useEffect(() => {
    const handleForceLogout = async (event: Event) => {
      if (isHandlingRef.current) return;

      const customEvent = event as CustomEvent<ForceLogoutDetail>;
      const reasonDetail = customEvent.detail?.reason;
      const reason: ForceLogoutReason =
        reasonDetail === 'blocked' || reasonDetail === 'removed_by_admin'
          ? reasonDetail
          : 'session_expired';
      const message = customEvent.detail?.message ||
        (reason === 'blocked'
          ? 'Akun Anda diblokir oleh admin. Anda akan dikeluarkan dari sistem.'
          : reason === 'removed_by_admin'
            ? 'Anda dikeluarkan sementara dari ujian oleh admin. Silakan login kembali.'
          : 'Sesi Anda berakhir. Anda akan diarahkan ke halaman login.');

      isHandlingRef.current = true;

      try {
        sessionStorage.setItem('force_logout_bypass', '1');
        if (reason === 'removed_by_admin') {
          sessionStorage.setItem('force_logout_message', message);
        }
        toast.error(message);

        await new Promise((resolve) => setTimeout(resolve, 1300));

        await logout();
        window.location.href =
          reason === 'blocked'
            ? '/login?reason=blocked'
            : reason === 'removed_by_admin'
              ? '/login?reason=removed_by_admin'
              : '/login?reason=session_expired';
      } finally {
        isHandlingRef.current = false;
      }
    };

    window.addEventListener('lms:force-logout', handleForceLogout as EventListener);

    return () => {
      window.removeEventListener('lms:force-logout', handleForceLogout as EventListener);
    };
  }, [logout, toast]);

  return null;
}
