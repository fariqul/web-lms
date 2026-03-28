'use client';

import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Input } from '@/components/ui';
import type { SEBExamSettings } from '@/utils/seb';

interface SEBSettingsFieldsProps {
  sebSettings: SEBExamSettings;
  onChange: (next: SEBExamSettings) => void;
}

export const SEBSettingsFields = React.memo(function SEBSettingsFields({
  sebSettings,
  onChange,
}: SEBSettingsFieldsProps) {
  return (
    <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm text-slate-700 dark:text-slate-300">Izinkan keluar SEB</label>
          <p className="text-xs text-slate-400 dark:text-slate-500">Siswa bisa keluar SEB dengan password</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={sebSettings.sebAllowQuit}
            onChange={(e) => onChange({ ...sebSettings, sebAllowQuit: e.target.checked })}
          />
          <div className="w-9 h-5 bg-slate-200 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      {sebSettings.sebAllowQuit && (
        <div>
          <Input
            label="Password untuk keluar SEB *"
            type="text"
            value={sebSettings.sebQuitPassword}
            onChange={(e) => onChange({ ...sebSettings, sebQuitPassword: e.target.value })}
            placeholder="Wajib diisi - password yang guru bagikan untuk keluar"
          />
          {!sebSettings.sebQuitPassword && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              Password wajib diisi agar guru/siswa bisa keluar SEB
            </p>
          )}
        </div>
      )}

      {!sebSettings.sebAllowQuit && (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
          <p className="text-xs text-red-700 dark:text-red-300">
            <AlertTriangle className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
            <strong>Peringatan:</strong> Jika quit dinonaktifkan, tidak ada cara keluar SEB selain restart komputer. Sangat disarankan untuk mengaktifkan quit dengan password.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <label className="text-sm text-slate-700 dark:text-slate-300">Blokir screen capture</label>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={sebSettings.sebBlockScreenCapture}
            onChange={(e) => onChange({ ...sebSettings, sebBlockScreenCapture: e.target.checked })}
          />
          <div className="w-9 h-5 bg-slate-200 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <label className="text-sm text-slate-700 dark:text-slate-300">Izinkan Virtual Machine</label>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={sebSettings.sebAllowVirtualMachine}
            onChange={(e) => onChange({ ...sebSettings, sebAllowVirtualMachine: e.target.checked })}
          />
          <div className="w-9 h-5 bg-slate-200 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <label className="text-sm text-slate-700 dark:text-slate-300">Tampilkan taskbar SEB</label>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={sebSettings.sebShowTaskbar}
            onChange={(e) => onChange({ ...sebSettings, sebShowTaskbar: e.target.checked })}
          />
          <div className="w-9 h-5 bg-slate-200 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          <Info className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
          File konfigurasi SEB (.seb) dapat didownload setelah ujian dibuat. Bagikan file tersebut ke siswa untuk membuka ujian menggunakan Safe Exam Browser.
        </p>
      </div>
    </div>
  );
});
