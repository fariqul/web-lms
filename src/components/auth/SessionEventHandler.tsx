'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useSocket } from '@/hooks/useSocket';

type ForceLogoutReason = 'blocked' | 'session_expired' | 'removed_by_admin';

interface ForceLogoutDetail {
  reason?: ForceLogoutReason;
  message?: string;
}

export function SessionEventHandler() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const isHandlingRef = useRef(false);
  const { isConnected, emit, on, off } = useSocket({
    autoConnect: !!user?.id,
  });

  useEffect(() => {
    if (!user?.id || !isConnected) return;

    emit('join-user', { userId: user.id });
  }, [user?.id, isConnected, emit]);

  useEffect(() => {
    if (!user?.id || !isConnected) return;

    const handleRealtimeNotification = (payload: unknown) => {
      const data = payload as {
        type?: string;
        reason?: string;
        message?: string;
      };

      const isForceLogoutEvent =
        data?.type === 'force_logout' ||
        data?.reason === 'blocked' ||
        data?.reason === 'session_expired' ||
        data?.reason === 'removed_by_admin';

      if (!isForceLogoutEvent) return;

      const reason: ForceLogoutReason =
        data?.reason === 'blocked' || data?.reason === 'removed_by_admin'
          ? data.reason
          : 'session_expired';

      window.dispatchEvent(
        new CustomEvent('lms:force-logout', {
          detail: {
            reason,
            message: data?.message,
          },
        })
      );
    };

    on('notification', handleRealtimeNotification);

    return () => {
      off('notification');
    };
  }, [user?.id, isConnected, on, off]);

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
        toast.showToast(message, 'error', 2000, {
          placement: 'center',
          prominent: true,
          dismissible: false,
        });

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
