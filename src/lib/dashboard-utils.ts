/**
 * Dashboard utility functions
 * - Dynamic color logic based on percentage thresholds
 * - Time-based greeting
 * - Role accent helpers
 */

// ── Dynamic Color Logic ──────────────────────────────
// Green: ≥ 75%  |  Yellow: 50–74%  |  Red: < 50%

export type ConditionColor = 'green' | 'yellow' | 'red';

export function getConditionColor(percentage: number): ConditionColor {
  if (percentage >= 75) return 'green';
  if (percentage >= 50) return 'yellow';
  return 'red';
}

/** Tailwind text color class based on percentage */
export function getConditionTextColor(percentage: number): string {
  const color = getConditionColor(percentage);
  switch (color) {
    case 'green': return 'text-emerald-600 dark:text-emerald-400';
    case 'yellow': return 'text-amber-600 dark:text-amber-400';
    case 'red': return 'text-red-600 dark:text-red-400';
  }
}

/** Tailwind bg color class based on percentage */
export function getConditionBgColor(percentage: number): string {
  const color = getConditionColor(percentage);
  switch (color) {
    case 'green': return 'bg-emerald-50 dark:bg-emerald-950/40';
    case 'yellow': return 'bg-amber-50 dark:bg-amber-950/40';
    case 'red': return 'bg-red-50 dark:bg-red-950/40';
  }
}

/** Tailwind ring/border color class based on percentage */
export function getConditionBorderColor(percentage: number): string {
  const color = getConditionColor(percentage);
  switch (color) {
    case 'green': return 'border-emerald-200 dark:border-emerald-800';
    case 'yellow': return 'border-amber-200 dark:border-amber-800';
    case 'red': return 'border-red-200 dark:border-red-800';
  }
}

/** SVG stroke color hex based on percentage */
export function getConditionHex(percentage: number): string {
  const color = getConditionColor(percentage);
  switch (color) {
    case 'green': return '#10b981';
    case 'yellow': return '#f59e0b';
    case 'red': return '#ef4444';
  }
}

/** Progress bar gradient class based on percentage */
export function getConditionGradient(percentage: number): string {
  const color = getConditionColor(percentage);
  switch (color) {
    case 'green': return 'from-emerald-500 to-emerald-400';
    case 'yellow': return 'from-amber-500 to-amber-400';
    case 'red': return 'from-red-500 to-red-400';
  }
}

// ── Time-Based Greeting ──────────────────────────────

export function getTimeGreeting(): { greeting: string; emoji: string } {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return { greeting: 'Selamat Pagi', emoji: '☀️' };
  if (hour >= 11 && hour < 15) return { greeting: 'Selamat Siang', emoji: '🌤️' };
  if (hour >= 15 && hour < 18) return { greeting: 'Selamat Sore', emoji: '🌅' };
  return { greeting: 'Selamat Malam', emoji: '🌙' };
}

// ── Role Accent Helpers ──────────────────────────────

export type UserRole = 'admin' | 'guru' | 'siswa';

/** Hero banner gradient per role */
export function getRoleBannerGradient(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'from-slate-800 via-slate-700 to-blue-800 dark:from-slate-900 dark:via-slate-800 dark:to-blue-900';
    case 'guru':
      return 'from-blue-800 via-blue-700 to-cyan-600 dark:from-blue-900 dark:via-blue-800 dark:to-cyan-700';
    case 'siswa':
      return 'from-sky-600 via-blue-600 to-cyan-500 dark:from-sky-800 dark:via-blue-800 dark:to-cyan-700';
  }
}

/** Banner shadow color per role */
export function getRoleBannerShadow(role: UserRole): string {
  switch (role) {
    case 'admin': return 'shadow-slate-900/20';
    case 'guru': return 'shadow-blue-900/20';
    case 'siswa': return 'shadow-blue-800/20';
  }
}
