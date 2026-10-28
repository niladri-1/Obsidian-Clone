import { useEffect } from 'react';
import { useStore } from '../store/useStore';

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function hexToHsl(value: string): Hsl | null {
  const raw = value.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(raw);
  const long = /^#([0-9a-f]{6})$/i.exec(raw);
  if (!short && !long) return null;
  const hex = short
    ? short[1]!
        .split('')
        .map((char) => char + char)
        .join('')
    : long![1]!;
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function readableOn(hsl: Hsl | null): string {
  if (!hsl) return '#ffffff';
  return hsl.l > 68 ? '#15161b' : '#ffffff';
}

/** Applies the persisted theme, accent, base font size and CSS zoom to the document. */
export function useTheme(): void {
  const theme = useStore((state) => state.settings.appearance.theme);
  const accent = useStore((state) => state.settings.appearance.accentColor);
  const baseFontSize = useStore((state) => state.settings.appearance.baseFontSize);
  const zoom = useStore((state) => state.settings.app.zoom);

  useEffect(() => {
    const root = document.documentElement;
    const apply = (): void => {
      const resolved =
        theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : theme;
      root.dataset.theme = resolved;
    };
    apply();
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    const hsl = hexToHsl(accent);
    if (!hsl) {
      for (const property of ['--accent-h', '--accent-s', '--accent-l', '--text-on-accent', '--accent']) {
        root.style.removeProperty(property);
      }
      return;
    }
    root.style.setProperty('--accent-h', String(hsl.h));
    root.style.setProperty('--accent-s', `${hsl.s}%`);
    root.style.setProperty('--accent-l', `${hsl.l}%`);
    root.style.setProperty('--accent', `hsl(${hsl.h} ${hsl.s}% ${hsl.l}%)`);
    root.style.setProperty('--text-on-accent', readableOn(hsl));
  }, [accent]);

  useEffect(() => {
    const size = Math.min(24, Math.max(12, Math.round(baseFontSize)));
    document.documentElement.style.setProperty('--base-font-size', `${size}px`);
  }, [baseFontSize]);

  useEffect(() => {
    const value = Math.min(2, Math.max(0.5, zoom));
    document.documentElement.style.setProperty('zoom', String(value));
  }, [zoom]);
}
