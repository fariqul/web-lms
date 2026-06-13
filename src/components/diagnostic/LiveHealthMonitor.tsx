'use client';

import React, { useState, useEffect } from 'react';
import { Server, Database, Cpu, CheckCircle, AlertTriangle, XCircle, Activity } from 'lucide-react';
import type { LiveHealthProps, SystemHealth } from '@/types/diagnostic';

export function LiveHealthMonitor({ autoRefresh, refreshInterval }: LiveHealthProps) {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/proctoring-diagnostic/health', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setHealth(data.data);
    } catch (error) {
      console.error('Failed to fetch health:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    if (!autoRefresh) return;

    const interval = setInterval(fetchHealth, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  if (loading || !health) {
    return <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 animate-pulse h-48" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Live System Health
        </h3>
        <span className="text-xs text-gray-500">{health.last_check}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ServiceCard
          icon={<Server className="w-5 h-5" />}
          name="Backend API"
          status={health.backend_api.status}
          responseTime={health.backend_api.response_time_ms}
          version={health.backend_api.version}
        />
        
        <ServiceCard
          icon={<Cpu className="w-5 h-5" />}
          name="Proctoring Service"
          status={health.proctoring_service.status}
          responseTime={health.proctoring_service.response_time_ms}
          details={
            <>
              <div className="text-xs space-y-0.5">
                <div>YOLO: {health.proctoring_service.yolo_loaded ? '✓' : '✗'}</div>
                <div>MediaPipe: {health.proctoring_service.mediapipe_loaded ? '✓' : '✗'}</div>
                <div>Face Rec: {health.proctoring_service.face_recognition_loaded ? '✓' : '✗'}</div>
                <div className="uppercase">{health.proctoring_service.device}</div>
              </div>
            </>
          }
        />
        
        <ServiceCard
          icon={<Database className="w-5 h-5" />}
          name="Database"
          status={health.database.status}
          responseTime={health.database.response_time_ms}
        />
        
        <ServiceCard
          icon={<Activity className="w-5 h-5" />}
          name="Queue Workers"
          status={health.queue_workers.status as any}
          details={<div className="text-xs">{health.queue_workers.worker_count} workers</div>}
        />
      </div>
    </div>
  );
}

function ServiceCard({
  icon,
  name,
  status,
  responseTime,
  version,
  details,
}: {
  icon: React.ReactNode;
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'running';
  responseTime?: number | null;
  version?: string;
  details?: React.ReactNode;
}) {
  const statusConfig = {
    healthy: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', icon: CheckCircle },
    degraded: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300', icon: AlertTriangle },
    down: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', icon: XCircle },
    running: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', icon: CheckCircle },
  };

  const { color, icon: StatusIcon } = statusConfig[status];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-start justify-between mb-2">
        <div className="text-gray-600 dark:text-gray-400">{icon}</div>
        <StatusIcon className={`w-4 h-4 ${color.split(' ')[1]}`} />
      </div>
      <div className="text-sm font-medium text-gray-900 dark:text-white mb-1">{name}</div>
      <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${color} capitalize`}>{status}</div>
      {responseTime && <div className="text-xs text-gray-500 mt-2">{responseTime}ms</div>}
      {version && <div className="text-xs text-gray-500 mt-1">v{version}</div>}
      {details && <div className="mt-2 text-gray-600 dark:text-gray-400">{details}</div>}
    </div>
  );
}
