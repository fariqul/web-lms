import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  loadingText,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const baseClasses =
    'inline-flex items-center justify-center font-semibold rounded-xl cursor-pointer transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.97]';

  const variantClasses = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring shadow-sm hover:shadow-md hover:shadow-blue-900/25',
    secondary: 'bg-brand-secondary text-white hover:bg-brand-secondary/90 focus-visible:ring-ring shadow-sm hover:shadow-md hover:shadow-cyan-500/25',
    danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive shadow-sm hover:shadow-md hover:shadow-red-500/25',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500 shadow-sm hover:shadow-md hover:shadow-emerald-500/25',
    outline:
      'border border-border text-foreground hover:bg-muted hover:border-border/80 focus-visible:ring-ring',
    ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2.5 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2',
  };

  return (
    <button
      className={clsx(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>{loadingText || 'Memproses…'}</span>
        </>
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
        </>
      )}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  label: string;
}

export function IconButton({
  icon,
  variant = 'ghost',
  size = 'md',
  label,
  className,
  disabled,
  ...props
}: IconButtonProps) {
  const variantClasses = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
    secondary: 'bg-brand-secondary text-white hover:bg-brand-secondary/90',
    danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  };

  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-2.5',
  };

  return (
    <button
      className={clsx(
        'rounded-xl cursor-pointer transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 active:scale-[0.95] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      aria-label={label}
      disabled={disabled}
      {...props}
    >
      {icon}
    </button>
  );
}
