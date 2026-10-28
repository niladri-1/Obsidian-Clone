import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../../store/useStore';
import type { Toast } from '../../store/types';

const ICONS = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
} as const;

function ToastRow({ toast }: { toast: Toast }) {
  const dismissToast = useStore((state) => state.dismissToast);
  const Icon = ICONS[toast.kind];
  return (
    <div className={clsx('toast', `kind-${toast.kind}`)} role="status">
      <span className="toast-icon">
        <Icon size={15} />
      </span>
      <span className="toast-message">{toast.message}</span>
      {toast.action && toast.actionLabel && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            toast.action?.();
            dismissToast(toast.id);
          }}
        >
          {toast.actionLabel}
        </button>
      )}
      <button
        type="button"
        className="toast-close"
        aria-label="Dismiss notification"
        onClick={() => dismissToast(toast.id)}
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((state) => state.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
