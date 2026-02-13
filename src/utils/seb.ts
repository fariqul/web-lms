/**
 * Safe Exam Browser (SEB) Integration Utilities
 *
 * SEB uses Apple plist XML format for .seb configuration files.
 * This module generates SEB config files and detects the SEB browser.
 */

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────
export interface SEBConfig {
  /** The URL to load inside SEB */
  startURL: string;
  /** SHA-256 hash of the config for server-side validation (Browser Exam Key) */
  browserExamKey?: string;
  /** Allow quitting SEB (usually false during exams) */
  allowQuit: boolean;
  /** Password hash required to quit SEB (empty = no password) */
  quitPassword?: string;
  /** Enable URL filtering to restrict navigation */
  enableURLFilter: boolean;
  /** Allow user to navigate back */
  allowBrowseBack: boolean;
  /** Show the SEB taskbar */
  showTaskbar: boolean;
  /** Show reload button */
  showReloadButton: boolean;
  /** Show timer */
  showTime: boolean;
  /** Show keyboard layout chooser */
  showInputLanguage: boolean;
  /** Block right-click context menu */
  blockPopUpWindows: boolean;
  /** Enable spell checking */
  allowSpellCheck: boolean;
  /** Allow audio */
  enableAudio: boolean;
  /** Allow virtual machine */
  allowVirtualMachine: boolean;
  /** Allow screen sharing / screen capture */
  allowScreenCapture: boolean;
  /** Enable logging */
  enableLogging: boolean;
  /** Exam title for display */
  examTitle?: string;
}

export interface SEBExamSettings {
  /** Whether SEB is required for this exam */
  sebRequired: boolean;
  /** Allow quitting SEB */
  sebAllowQuit: boolean;
  /** Quit password (plain text, hashed when generating config) */
  sebQuitPassword: string;
  /** Block screen capture */
  sebBlockScreenCapture: boolean;
  /** Allow virtual machine for testing */
  sebAllowVirtualMachine: boolean;
  /** Show taskbar in SEB */
  sebShowTaskbar: boolean;
}

export const DEFAULT_SEB_SETTINGS: SEBExamSettings = {
  sebRequired: false,
  sebAllowQuit: true,
  sebQuitPassword: '',
  sebBlockScreenCapture: true,
  sebAllowVirtualMachine: false,
  sebShowTaskbar: true,
};

// ────────────────────────────────────────────────
// SEB Browser Detection
// ────────────────────────────────────────────────

/**
 * Detect if the current browser is Safe Exam Browser.
 * SEB adds identifiers to the User-Agent string.
 */
export function isSEBBrowser(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent;

  // SEB adds "SEB/" or "SafeExamBrowser" to the user agent
  if (/SEB\/\d/i.test(ua) || /SafeExamBrowser/i.test(ua)) {
    return true;
  }

  // SEB for iOS / Mac might have different identifiers
  if (/SEB_iOS/i.test(ua) || /SEB_macOS/i.test(ua)) {
    return true;
  }

  return false;
}

/**
 * Get SEB version from user agent if available.
 */
export function getSEBVersion(): string | null {
  if (typeof navigator === 'undefined') return null;

  const match = navigator.userAgent.match(/SEB\/(\d+[\d.]*)/i);
  return match ? match[1] : null;
}

// ────────────────────────────────────────────────
// Plist XML Generation
// ────────────────────────────────────────────────

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function plistValue(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? '<true/>' : '<false/>';
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return `<integer>${value}</integer>`;
    }
    return `<real>${value}</real>`;
  }
  if (typeof value === 'string') {
    return `<string>${escapeXml(value)}</string>`;
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => `\t\t${plistValue(v)}`).join('\n');
    return `<array>\n${items}\n\t</array>`;
  }
  if (value === null || value === undefined) {
    return '<string></string>';
  }
  return `<string>${escapeXml(String(value))}</string>`;
}

function plistEntry(key: string, value: unknown): string {
  return `\t<key>${escapeXml(key)}</key>\n\t${plistValue(value)}`;
}

/**
 * Generate a SEB configuration file content (Apple plist XML).
 */
export function generateSEBConfigXML(config: SEBConfig): string {
  const entries: string[] = [];

  // Start URL (required)
  entries.push(plistEntry('startURL', config.startURL));

  // Exam title
  if (config.examTitle) {
    entries.push(plistEntry('browserWindowTitleSuffix', config.examTitle));
  }

  // Quit settings
  entries.push(plistEntry('allowQuit', config.allowQuit));
  if (config.quitPassword) {
    // SEB expects the SHA-256 hash in hashedQuitPassword
    entries.push(plistEntry('hashedQuitPassword', config.quitPassword));
  }
  // Also set the confirm quit option so a prompt appears
  entries.push(plistEntry('quitURLConfirm', true));

  // Navigation
  entries.push(plistEntry('allowBrowseBack', config.allowBrowseBack));
  entries.push(plistEntry('enableURLFilter', config.enableURLFilter));
  entries.push(plistEntry('blockPopUpWindows', config.blockPopUpWindows));

  // URL filter rules — only allow the exam URL domain
  if (config.enableURLFilter) {
    try {
      const url = new URL(config.startURL);
      const baseHost = url.hostname;
      // Allow the exam domain and its API
      entries.push(plistEntry('URLFilterRules', [
        {
          action: 1, // allow
          active: true,
          expression: `${baseHost}/*`,
          regex: false,
        },
      ]));
    } catch {
      // If URL parsing fails, skip filter rules
    }
  }

  // Taskbar
  entries.push(plistEntry('showTaskBar', config.showTaskbar));
  entries.push(plistEntry('showReloadButton', config.showReloadButton));
  entries.push(plistEntry('showTime', config.showTime));
  entries.push(plistEntry('showInputLanguage', config.showInputLanguage));

  // Security
  entries.push(plistEntry('allowSpellCheck', config.allowSpellCheck));
  entries.push(plistEntry('enableAudio', config.enableAudio));
  entries.push(plistEntry('allowVirtualMachine', config.allowVirtualMachine));
  entries.push(plistEntry('allowScreenCapture', config.allowScreenCapture));
  entries.push(plistEntry('enableLogging', config.enableLogging));

  // Additional security settings for exam mode
  entries.push(plistEntry('allowSwitchToApplications', false));
  entries.push(plistEntry('allowFlashFullscreen', false));
  entries.push(plistEntry('allowUserSwitching', false));
  entries.push(plistEntry('enableAltTab', false));
  entries.push(plistEntry('enableRightMouse', false));
  entries.push(plistEntry('enablePrintScreen', false));
  entries.push(plistEntry('enableCtrlEsc', false));
  entries.push(plistEntry('enableAltEsc', false));
  // Allow Alt+F4 and Ctrl+Q only when quit is allowed (so user can trigger quit dialog)
  entries.push(plistEntry('enableAltF4', config.allowQuit));
  entries.push(plistEntry('enableStartMenu', false));
  entries.push(plistEntry('enableF1', false));
  entries.push(plistEntry('enableF3', false));
  entries.push(plistEntry('enableF5', false));
  entries.push(plistEntry('enableF6', false));
  entries.push(plistEntry('enableF7', false));
  entries.push(plistEntry('enableF8', false));
  entries.push(plistEntry('enableF10', false));
  entries.push(plistEntry('enableF11', false));
  entries.push(plistEntry('enableF12', false));

  // Browser settings
  entries.push(plistEntry('browserViewMode', 1)); // 1 = fullscreen
  entries.push(plistEntry('mainBrowserWindowWidth', '100%'));
  entries.push(plistEntry('mainBrowserWindowHeight', '100%'));
  entries.push(plistEntry('mainBrowserWindowPositioning', 1)); // centered
  entries.push(plistEntry('enableBrowserWindowToolbar', false));

  // Network / certificate
  entries.push(plistEntry('sebConfigPurpose', 0)); // 0 = configure client, 1 = start exam
  entries.push(plistEntry('allowPreferencesWindow', false));

  // Browser Exam Key
  if (config.browserExamKey) {
    entries.push(plistEntry('browserExamKey', config.browserExamKey));
  }

  const xmlContent = entries.join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${xmlContent}
</dict>
</plist>`;
}

// ────────────────────────────────────────────────
// File Download Helper
// ────────────────────────────────────────────────

/**
 * Hash a password string using SHA-256 (Web Crypto API).
 * Returns the hex-encoded hash that SEB expects for hashedQuitPassword.
 */
async function hashPasswordSHA256(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate and download a .seb config file.
 * Password is hashed with SHA-256 before embedding in config.
 */
export async function downloadSEBConfig(
  examTitle: string,
  examId: number,
  settings: SEBExamSettings,
  baseUrl?: string,
): Promise<void> {
  // Determine the exam URL
  const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://web-lms-rowr.vercel.app');
  const startURL = `${origin}/ujian/${examId}`;

  // Hash the quit password if provided
  let hashedPassword: string | undefined;
  if (settings.sebQuitPassword) {
    hashedPassword = await hashPasswordSHA256(settings.sebQuitPassword);
  }

  const config: SEBConfig = {
    startURL,
    examTitle,
    allowQuit: settings.sebAllowQuit,
    quitPassword: hashedPassword,
    enableURLFilter: true,
    allowBrowseBack: false,
    showTaskbar: settings.sebShowTaskbar,
    showReloadButton: true,
    showTime: true,
    showInputLanguage: false,
    blockPopUpWindows: true,
    allowSpellCheck: false,
    enableAudio: false,
    allowVirtualMachine: settings.sebAllowVirtualMachine,
    allowScreenCapture: !settings.sebBlockScreenCapture,
    enableLogging: true,
  };

  const xmlContent = generateSEBConfigXML(config);
  const blob = new Blob([xmlContent], { type: 'application/seb' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  // Sanitize filename
  const safeTitle = examTitle
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
  link.download = `${safeTitle}_SEB.seb`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
