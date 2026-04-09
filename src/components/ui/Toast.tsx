'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';
type ToastPlacement = 'top-right' | 'center';

interface ToastOptions {
  duration?: number;
  placement?: ToastPlacement;
  prominent?: boolean;
  dismissible?: boolean;
}

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  placement?: ToastPlacement;
  prominent?: boolean;
  dismissible?: boolean;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number, options?: ToastOptions) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const enterRaf = requestAnimationFrame(() => setIsVisible(true));
    const duration = toast.duration || 4000;
    const exitTimer = setTimeout(() => setIsExiting(true), Math.max(0, duration - 300));
    const removeTimer = setTimeout(() => onRemove(toast.id), duration);
    return () => {
      cancelAnimationFrame(enterRaf);
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, [toast, onRemove]);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />,
    error: <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />,
    info: <Info className="w-5 h-5 text-sky-500 flex-shrink-0" />,
  };

  const bgColors = {
    success: 'bg-card border-l-4 border-l-emerald-500 border-border',
    error: 'bg-card border-l-4 border-l-red-500 border-border',
    warning: 'bg-card border-l-4 border-l-amber-500 border-border',
    info: 'bg-card border-l-4 border-l-sky-500 border-border',
  };

  const isCenterPopup = toast.placement === 'center';
  const baseSizing = isCenterPopup || toast.prominent
    ? 'w-[min(92vw,560px)] p-5 sm:p-6 rounded-2xl shadow-2xl'
    : 'max-w-sm w-full p-4 rounded-xl shadow-lg';

  const enterExitClass = isVisible && !isExiting
    ? 'opacity-100 scale-100 translate-y-0'
    : isExiting
      ? 'opacity-0 scale-95 translate-y-2'
      : 'opacity-0 scale-90 translate-y-3';

  return (
    <div
      className={`flex items-start gap-3 border ${baseSizing} ${bgColors[toast.type]} ${enterExitClass} transition-all duration-300 ease-out`}
      role="alert"
    >
      {icons[toast.type]}
      <p className={`${isCenterPopup || toast.prominent ? 'text-base sm:text-lg leading-relaxed' : 'text-sm'} text-foreground flex-1 pt-0.5`}>
        {toast.message}
      </p>
      {toast.dismissible !== false && (
        <button
          onClick={() => {
            setIsExiting(true);
            setTimeout(() => onRemove(toast.id), 300);
          }}
          className="text-muted-foreground hover:text-foreground flex-shrink-0 cursor-pointer rounded-lg p-0.5 hover:bg-muted transition-colors"
          aria-label="Tutup notifikasi"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 4000, options: ToastOptions = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const placement = options.placement || 'top-right';
    const prominent = options.prominent ?? false;
    const dismissible = options.dismissible ?? true;
    setToasts((prev) => [...prev.slice(-4), { id, type, message, duration, placement, prominent, dismissible }]);
  }, []);

  const success = useCallback((message: string) => showToast(message, 'success'), [showToast]);
  const error = useCallback((message: string) => showToast(message, 'error', 5000), [showToast]);
  const warning = useCallback((message: string) => showToast(message, 'warning'), [showToast]);
  const info = useCallback((message: string) => showToast(message, 'info'), [showToast]);

  const topRightToasts = toasts.filter((t) => (t.placement || 'top-right') === 'top-right');
  const centerToasts = toasts.filter((t) => t.placement === 'center');
  const latestCenterToast = centerToasts.length > 0 ? centerToasts[centerToasts.length - 1] : null;

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}

      {/* Default toast (pojok kanan atas) */}
      <div className="fixed top-[72px] sm:top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none" aria-live="polite">
        {topRightToasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onRemove={removeToast} />
          </div>
        ))}
      </div>

      {/* Popup tengah untuk notifikasi penting */}
      {latestCenterToast && (
        <div className="fixed inset-0 z-[200] pointer-events-none flex items-center justify-center p-4" aria-live="assertive">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />
          <div className="relative pointer-events-auto">
            <ToastItem toast={latestCenterToast} onRemove={removeToast} />
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
