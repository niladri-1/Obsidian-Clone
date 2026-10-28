import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  ariaLabel?: string;
}

/**
 * A viewport-clamped context menu. Rendered in a portal so overflow-hidden panes cannot clip
 * it. Clicking elsewhere, scrolling, pressing Escape or selecting an item closes it.
 * Arrow keys, Home/End and Enter follow the usual desktop menu keyboard contract.
 */
export function ContextMenu({ x, y, items, onClose, ariaLabel = 'Context menu' }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const margin = 8;
    setPosition({
      left: Math.min(Math.max(margin, x), Math.max(margin, window.innerWidth - rect.width - margin)),
      top: Math.min(Math.max(margin, y), Math.max(margin, window.innerHeight - rect.height - margin)),
    });
  }, [x, y, items.length]);

  useEffect(() => {
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = itemRefs.current.find((button) => button && !button.disabled);
    first?.focus({ preventScroll: true });
    return () => {
      const target = previousFocus.current;
      if (target && document.contains(target)) target.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    const onScroll = (): void => onClose();
    window.addEventListener('mousedown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [onClose]);

  const moveFocus = (direction: 1 | -1): void => {
    const enabled = itemRefs.current.filter(
      (button): button is HTMLButtonElement => !!button && !button.disabled,
    );
    if (enabled.length === 0) return;
    const current = document.activeElement;
    const index = enabled.findIndex((button) => button === current);
    const next = index === -1 ? (direction === 1 ? 0 : enabled.length - 1) : index + direction;
    const wrapped = (next + enabled.length) % enabled.length;
    enabled[wrapped]?.focus({ preventScroll: true });
  };

  return createPortal(
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      aria-label={ariaLabel}
      style={{ left: position.left, top: position.top }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveFocus(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          moveFocus(-1);
        } else if (event.key === 'Home') {
          event.preventDefault();
          itemRefs.current.find((button) => button && !button.disabled)?.focus();
        } else if (event.key === 'End') {
          event.preventDefault();
          [...itemRefs.current]
            .reverse()
            .find((button) => button && !button.disabled)
            ?.focus();
        }
      }}
    >
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`}>
          {item.separatorBefore && <div className="context-separator" role="separator" />}
          <button
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            type="button"
            role="menuitem"
            className={clsx('context-item', item.danger && 'is-danger')}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
            {item.shortcut && <span className="context-shortcut">{item.shortcut}</span>}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
