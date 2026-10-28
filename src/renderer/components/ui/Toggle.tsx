import clsx from 'clsx';
import type { ReactNode } from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      className="switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  onChange: (value: T) => void;
  label: string;
}

export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={clsx(value === option.value && 'is-active')}
          aria-pressed={value === option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
