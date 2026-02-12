import React, { ReactNode } from 'react';
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
        'bg-white rounded-xl shadow-sm',
        paddingClasses[padding],
        onClick && 'cursor-pointer text-left w-full',
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
        <h3 className="font-semibold text-gray-800">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
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
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
    teal: 'bg-teal-500',
    purple: 'bg-purple-500',
  };

  return (
    <div className={clsx('rounded-xl p-4 text-white', colorClasses[color])}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-bold">{value}</p>
          <p className="text-sm opacity-90">{label}</p>
          {trend && (
            <p className="text-xs mt-1 opacity-80">
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        {icon && <div className="opacity-80">{icon}</div>}
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
    blue: 'bg-blue-100 text-blue-600 hover:bg-blue-200',
    green: 'bg-green-100 text-green-600 hover:bg-green-200',
    orange: 'bg-orange-100 text-orange-600 hover:bg-orange-200',
    teal: 'bg-teal-100 text-teal-600 hover:bg-teal-200',
  };

  const Component = href ? 'a' : 'button';
  const props = href ? { href } : { onClick, type: 'button' as const };

  return (
    <Component
      {...props}
      className={clsx(
        'flex flex-col items-center justify-center p-4 rounded-xl transition-colors duration-200 relative',
        colorClasses[color]
      )}
    >
      {badge && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full min-w-[20px] text-center">
          {badge}
        </span>
      )}
      <div className="w-12 h-12 flex items-center justify-center mb-2">{icon}</div>
      <span className="text-sm font-medium text-center">{title}</span>
    </Component>
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
    blue: 'bg-blue-100 text-blue-700',
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
      {icon && (
        <div
          className={clsx(
            'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
            iconColor || 'bg-blue-100 text-blue-600'
          )}
        >
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-800 truncate">{title}</p>
        {subtitle && <p className="text-sm text-gray-500 truncate">{subtitle}</p>}
      </div>
      {badge && (
        <span className={clsx('text-xs px-2 py-1 rounded-full flex-shrink-0', badgeColors[badge.color])}>
          {badge.text}
        </span>
      )}
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
