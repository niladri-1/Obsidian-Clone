import type { WebPreferences } from 'electron';

/**
 * The single source of truth for renderer privileges. FR-9.1 and
 * `tests/security.test.ts` assert these values.
 */
export const SECURE_RENDERER_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  sandbox: true,
  webviewTag: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  navigateOnDragDrop: false,
  // Native spellcheck is not a renderer privilege; the per-vault setting controls
  // the editor attribute. Keeping the Chromium spellchecker available is required
  // for FR-7.2 when the user enables it.
  spellcheck: true,
} as const;

export function secureWebPreferences(preload: string): WebPreferences {
  return {
    ...SECURE_RENDERER_PREFERENCES,
    preload,
  };
}

export const ALLOWED_EXTERNAL_PROTOCOLS = ['http:', 'https:', 'mailto:'] as const;

export function isAllowedExternalUrl(raw: string): boolean {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return false;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  return (ALLOWED_EXTERNAL_PROTOCOLS as readonly string[]).includes(parsed.protocol);
}

/**
 * Strict production CSP. In development the renderer is served by Vite, whose React
 * refresh preamble requires inline scripts, so development omits this policy. The
 * production HTML additionally carries a meta CSP injected at build time.
 */
export const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: vaultfile:",
  "media-src 'self' vaultfile:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
