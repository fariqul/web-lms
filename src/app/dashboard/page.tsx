'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push('/login');
      } else if (user) {
        // Redirect based on role
        switch (user.role) {
          case 'admin':
            router.push('/dashboard/admin');
            break;
          case 'guru':
            router.push('/dashboard/guru');
            break;
          case 'siswa':
            router.push('/dashboard/siswa');
            break;
          default:
            router.push('/login');
        }
      }
    }
  }, [user, isLoading, isAuthenticated, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-10 h-10 text-sky-500 animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground font-medium">Memuat dashboard…</p>
      </div>
    </div>
  );
}
