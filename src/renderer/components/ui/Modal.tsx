import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

interface ModalProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  overlayClassName?: string;
  top?: boolean;
  ariaLabel?: string;
  closeLabel?: string;
  initialFocus?: string;
  /** Render children directly in the dialog shell (used by palettes and settings). */
  bare?: boolean;
}

const FOCUSABLE =
  'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  className,
  overlayClassName,
  top = false,
  ariaLabel,
  closeLabel = 'Close',
  initialFocus,
  bare = false,
}: ModalProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = rootRef.current;
    const target = initialFocus
      ? root?.querySelector<HTMLElement>(initialFocus)
      : root?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !root) return;
      const focusable = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !root.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      previous?.focus();
    };
  }, [initialFocus]);

  return createPortal(
    <div
      className={clsx('overlay', top && 'is-top', overlayClassName)}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={rootRef}
        className={bare ? className : clsx('modal', className)}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === 'string' ? title : 'Dialog')}
      >
        {bare ? (
          children
        ) : (
          <>
            {title !== undefined && (
              <header className="modal-header">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2>{title}</h2>
                  {subtitle !== undefined && <p>{subtitle}</p>}
                </div>
                <IconButton label={closeLabel} onClick={onClose}>
                  <X size={16} />
                </IconButton>
              </header>
            )}
            <div className="modal-body">{children}</div>
            {footer !== undefined && <footer className="modal-footer">{footer}</footer>}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
