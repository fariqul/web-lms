'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { initializeSocket, getSocket } from '@/lib/socket';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';

export function AdminProctoringAlerts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    // Only mount for admin and guru
    if (!user || (user.role !== 'admin' && user.role !== 'guru')) {
      return;
    }

    const initEcho = async () => {
      try {
        await initializeSocket();
        const socket = getSocket();

        if (socket) {
interface AlertData {
  student_id: number;
  student_name: string;
  exam_id: number;
  risk_level: string;
}

          // Listen to the system admin alerts channel
          socket.channel('system.admin-alerts')
            .listen('.admin:proctoring-alert', (data: AlertData) => {
              toast(
                'Peringatan Kecurangan Ujian',
                `Siswa ${data.student_name} terdeteksi memiliki tingkat risiko ${data.risk_level.toUpperCase()} pada sesi ujian.`,
                'error',
                {
                  duration: 8000,
                  action: {
                    label: 'Lihat Detail',
                    onClick: () => {
                      router.push(`/admin/ujian/${data.exam_id}/monitor?studentId=${data.student_id}`);
                    }
                  },
                  icon: <AlertCircle className="w-5 h-5" />
                }
              );
            });
        }
      } catch (error) {
        console.error('Failed to initialize socket for admin alerts:', error);
      }
    };

    initEcho();

    return () => {
      const socket = getSocket();
      if (socket) {
        socket.leave('system.admin-alerts');
      }
    };
  }, [user, toast, router]);

  return null;
}
