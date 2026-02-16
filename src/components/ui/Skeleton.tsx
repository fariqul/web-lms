import React from 'react';
import clsx from 'clsx';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export function Skeleton({ className, variant = 'text', width, height, lines = 1 }: SkeletonProps) {
  const baseClasses = 'bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]';

  const variantClasses = {
    text: 'rounded-md h-4',
    circular: 'rounded-full',
    rectangular: '',
    rounded: 'rounded-xl',
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  if (lines > 1) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={clsx(baseClasses, variantClasses[variant], className)}
            style={{ ...style, width: i === lines - 1 ? '75%' : style.width }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={clsx(baseClasses, variantClasses[variant], className)}
      style={style}
    />
  );
}

/**
 * Dashboard skeleton that matches the general layout of dashboard pages.
 * Shows skeleton cards, stats strips, and content grids.
 */
export function DashboardSkeleton() {
  return (
    <div className="animate-fadeIn space-y-6">
      {/* Welcome header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton variant="text" width="280px" height={28} />
          <Skeleton variant="text" width="200px" height={16} />
        </div>
        <Skeleton variant="rounded" width={120} height={40} />
      </div>

      {/* Quick actions skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 flex flex-col items-center gap-3">
            <Skeleton variant="circular" width={48} height={48} />
            <Skeleton variant="text" width="70%" />
          </div>
        ))}
      </div>

      {/* Stats strip skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-2">
            <Skeleton variant="text" width="60%" height={12} />
            <Skeleton variant="text" width="40%" height={24} />
          </div>
        ))}
      </div>

      {/* Content grid skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton variant="text" width="60%" height={18} />
              <Skeleton variant="rounded" width={60} height={24} />
            </div>
            <Skeleton variant="rounded" width="100%" height={120} />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <Skeleton variant="circular" width={32} height={32} />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton variant="text" width="80%" />
                    <Skeleton variant="text" width="50%" height={12} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Table skeleton for data-heavy pages
 */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} variant="text" width={`${100 / cols}%`} height={14} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-5 py-3.5 border-b border-slate-50 dark:border-slate-700/50 flex gap-4 items-center">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} variant="text" width={`${100 / cols}%`} height={14} />
          ))}
        </div>
      ))}
    </div>
  );
}
