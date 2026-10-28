import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function IconButton({
  label,
  active = false,
  size = 'md',
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={clsx('icon-button', size !== 'md' && size, active && 'is-active', className)}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
