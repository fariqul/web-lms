'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useSocket } from '@/hooks/useSocket';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';

interface AlertData {
  student_id: number;
  student_name: string;
  exam_id: number;
  risk_level: string;
}

export function AdminProctoringAlerts() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const { isConnected, emit, on, off } = useSocket();

  useEffect(() => {
    // Only mount for admin and guru
    if (!user || (user.role !== 'admin' && user.role !== 'guru')) {
      return;
    }

    if (isConnected) {
      // Join the system room for admin alerts
      emit('join-system', { room: 'system.admin-alerts' });

      // Listen for the specific alert event
      const handleAlert = (data: unknown) => {
        const alertData = data as AlertData;
        showToast(
          `Peringatan: Siswa ${alertData.student_name} terdeteksi memiliki tingkat risiko ${alertData.risk_level.toUpperCase()} pada sesi ujian. Segera periksa pantauan ujian!`,
          'error',
          8000,
          { prominent: true, placement: 'center' }
        );
      };

      on('admin:proctoring-alert', handleAlert);

      return () => {
        off('admin:proctoring-alert');
        emit('leave-system', { room: 'system.admin-alerts' });
      };
    }
  }, [user, isConnected, emit, on, off, showToast, router]);

  return null;
}
