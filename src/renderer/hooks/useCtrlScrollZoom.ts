import { useEffect } from 'react';
import { useStore } from '../store/useStore';

export function useCtrlScrollZoom(): void {
  const ctrlScrollZoom = useStore((state) => state.settings.app.ctrlScrollZoom);
  const zoom = useStore((state) => state.settings.app.zoom);
  const updateApp = useStore((state) => state.updateAppSettings);

  useEffect(() => {
    if (ctrlScrollZoom === false) return;
    const handler = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.1 : 0.1;
      const next = Math.min(2, Math.max(0.5, zoom + delta));
      if (Math.abs(next - zoom) < 0.0001) return;
      void updateApp({ zoom: Number(next.toFixed(2)) });
    };
    window.addEventListener('wheel', handler, { passive: false });
    return () => window.removeEventListener('wheel', handler);
  }, [ctrlScrollZoom, zoom, updateApp]);
}
