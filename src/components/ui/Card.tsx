import React, { ReactNode } from 'react';
import Link from 'next/link';
import clsx from 'clsx';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

export function Card({ children, className, padding = 'md', onClick }: CardProps) {
  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={clsx(
        'bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-[var(--shadow-card)]',
        paddingClasses[padding],
        onClick && 'cursor-pointer text-left w-full hover:border-slate-200 dark:hover:border-slate-600 hover:shadow-[var(--shadow-md)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 active:scale-[0.99]',
        className
      )}
    >
      {children}
    </Component>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, action, className }: CardHeaderProps) {
  return (
    <div className={clsx('flex items-center justify-between mb-4', className)}>
      <div>
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

interface StatCardProps {
  value: string | number;
  label: string;
  icon?: ReactNode;
  color?: 'blue' | 'green' | 'orange' | 'red' | 'teal' | 'purple';
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export function StatCard({ value, label, icon, color = 'blue', trend }: StatCardProps) {
  const colorClasses = {
    blue: 'from-blue-800 to-blue-900',
    green: 'from-emerald-500 to-emerald-600',
    orange: 'from-orange-400 to-orange-500',
    red: 'from-red-500 to-red-600',
    teal: 'from-cyan-500 to-cyan-600',
    purple: 'from-violet-500 to-purple-600',
  };

  return (
    <div className={clsx('rounded-2xl p-5 text-white bg-gradient-to-br shadow-lg', colorClasses[color])}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-extrabold tracking-tight tabular-nums">{value}</p>
          <p className="text-sm opacity-90 mt-1 font-medium">{label}</p>
          {trend && (
            <p className="text-xs mt-1.5 opacity-80 font-medium">
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        {icon && <div className="opacity-70 bg-white/10 rounded-xl p-2.5">{icon}</div>}
      </div>
    </div>
  );
}

interface QuickActionCardProps {
  icon: ReactNode;
  title: string;
  onClick?: () => void;
  href?: string;
  color?: 'blue' | 'green' | 'orange' | 'teal';
  badge?: string | number;
}

export function QuickActionCard({
  icon,
  title,
  onClick,
  href,
  color = 'blue',
  badge,
}: QuickActionCardProps) {
  const colorClasses = {
    blue: 'bg-sky-50 text-sky-600 hover:bg-sky-100 border border-sky-100 dark:bg-sky-950/50 dark:text-sky-400 dark:border-sky-900 dark:hover:bg-sky-900/50',
    green: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900 dark:hover:bg-emerald-900/50',
    orange: 'bg-orange-50 text-orange-500 hover:bg-orange-100 border border-orange-100 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-900 dark:hover:bg-orange-900/50',
    teal: 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-100 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-900 dark:hover:bg-blue-900/50',
  };

  const sharedClasses = clsx(
    'flex flex-col items-center justify-center p-4 rounded-2xl cursor-pointer transition-all duration-200 relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 active:scale-[0.97]',
    colorClasses[color]
  );

  const badgeEl = badge ? (
    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full min-w-[20px] text-center font-medium">
      {badge}
    </span>
  ) : null;

  const content = (
    <>
      {badgeEl}
      <div className="w-12 h-12 flex items-center justify-center mb-2">{icon}</div>
      <span className="text-sm font-medium text-center">{title}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={sharedClasses}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={sharedClasses}>
      {content}
    </button>
  );
}

interface InfoCardProps {
  icon?: ReactNode;
  iconColor?: string;
  title: string;
  subtitle?: string;
  badge?: {
    text: string;
    color: 'green' | 'red' | 'yellow' | 'blue';
  };
  action?: ReactNode;
}

export function InfoCard({ icon, iconColor, title, subtitle, badge, action }: InfoCardProps) {
  const badgeColors = {
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    blue: 'bg-sky-50 text-sky-700',
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700 transition-colors duration-200 hover:bg-slate-100 dark:hover:bg-slate-800">
      {icon && (
        <div
          className={clsx(
            'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
            iconColor || 'bg-sky-50 text-sky-500 dark:bg-sky-950/50 dark:text-sky-400'
          )}
        >
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{title}</p>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>}
      </div>
      {badge && (
        <span className={clsx('text-xs px-2 py-1 rounded-full flex-shrink-0 font-medium', badgeColors[badge.color])}>
          {badge.text}
        </span>
      )}
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
