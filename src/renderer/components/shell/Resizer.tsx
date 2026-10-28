import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

interface ResizerProps {
  side: 'left' | 'right';
  width: number;
  onChange: (width: number) => void;
  label: string;
}

/** Draggable sidebar divider. Width is clamped again by the store. */
export function Resizer({ side, width, onChange, label }: ResizerProps) {
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, width: 0 });

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent): void => {
      const delta = event.clientX - start.current.x;
      onChange(side === 'left' ? start.current.width + delta : start.current.width - delta);
    };
    const onUp = (): void => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });
    const previous = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.userSelect = previous;
    };
  }, [dragging, onChange, side]);

  return (
    <div
      className={clsx('resizer', dragging && 'is-dragging')}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        start.current = { x: event.clientX, width };
        setDragging(true);
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onChange(width - (event.shiftKey ? 32 : 12));
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          onChange(width + (event.shiftKey ? 32 : 12));
        }
      }}
      onDoubleClick={() => onChange(side === 'left' ? 260 : 300)}
    />
  );
}
