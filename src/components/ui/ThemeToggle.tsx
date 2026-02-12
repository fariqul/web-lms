'use client';

import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const options = [
    { value: 'light' as const, icon: Sun, label: 'Terang' },
    { value: 'dark' as const, icon: Moon, label: 'Gelap' },
    { value: 'system' as const, icon: Monitor, label: 'Sistem' },
  ];

  return (
    <div className="flex items-center bg-white/10 dark:bg-gray-700 rounded-lg p-0.5">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`p-1.5 rounded-md transition-colors ${
            theme === value
              ? 'bg-white/20 dark:bg-gray-600 text-white'
              : 'text-white/60 hover:text-white/80'
          }`}
          title={label}
          aria-label={`Tema ${label}`}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
}

export function ThemeToggleSimple() {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
      aria-label={resolvedTheme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="w-5 h-5" />
      ) : (
        <Moon className="w-5 h-5" />
      )}
    </button>
  );
}
