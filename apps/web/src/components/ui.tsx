import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, LoaderCircle, X } from 'lucide-react';
import { PLATFORMS, type MetricAvailability, type Platform } from '@creator-center/shared';
import { cn } from '../utils';

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}) {
  return (
    <button className={cn('btn', `btn-${variant}`, `btn-${size}`, className)} {...props}>
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className={cn('icon-btn', className)} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

export function PlatformMark({
  platform,
  size = 'md',
  muted = false,
}: {
  platform: Platform;
  size?: 'sm' | 'md' | 'lg';
  muted?: boolean;
}) {
  const info = PLATFORMS[platform];
  const content =
    platform === 'youtube' ? (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 7.5v9l7.5-4.5L9 7.5Z" fill="currentColor" />
      </svg>
    ) : platform === 'wechat' ? (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M10.1 4.5c-3.5 0-6.3 2.2-6.3 4.9 0 1.5.8 2.9 2.1 3.8l-.5 1.7 2-1c.6.2 1.2.3 1.9.3h.5c-.1-.4-.2-.9-.2-1.4 0-2.6 2.5-4.7 5.6-4.7h.5c-.7-2-3.2-3.6-5.6-3.6Zm-2 3.1a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Zm4 0a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Z"
          fill="currentColor"
        />
        <path
          d="M20.2 12.9c0-2.2-2.3-3.9-5-3.9s-5 1.7-5 3.9 2.3 3.9 5 3.9c.5 0 1-.1 1.5-.2l1.7.8-.4-1.4c1.4-.7 2.2-1.8 2.2-3.1Zm-6.6-1a.7.7 0 1 1 0 1.4.7.7 0 0 1 0-1.4Zm3.3 0a.7.7 0 1 1 0 1.4.7.7 0 0 1 0-1.4Z"
          fill="currentColor"
        />
      </svg>
    ) : (
      <span aria-hidden="true">{info.label.slice(0, 1)}</span>
    );
  return (
    <span
      className={cn('platform-mark', `platform-mark-${size}`, muted && 'is-muted')}
      style={{
        '--platform-color': info.color,
        '--platform-tint': info.tint,
      } as React.CSSProperties}
      title={info.label}
    >
      {content}
    </span>
  );
}

export function PlatformLabel({ platform }: { platform: Platform }) {
  return (
    <span className="platform-label">
      <PlatformMark platform={platform} size="sm" />
      <span>{PLATFORMS[platform].label}</span>
    </span>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
  className?: string;
}) {
  return <span className={cn('badge', `badge-${tone}`, className)}>{children}</span>;
}

export function AvailabilityBadge({ availability }: { availability: MetricAvailability }) {
  if (availability === 'value') return null;
  return (
    <span className={cn('availability', `availability-${availability}`)}>
      {availability === 'unsupported' ? 'n/a' : 'pending'}
    </span>
  );
}

export function StatusDot({ tone }: { tone: 'good' | 'warn' | 'bad' | 'idle' }) {
  return <span className={cn('status-dot', `status-${tone}`)} aria-hidden="true" />;
}

export function AccountAvatar({
  name,
  platform,
  size = 'md',
}: {
  name: string;
  platform: Platform;
  size?: 'sm' | 'md' | 'lg';
}) {
  const initial = [...name.trim()][0]?.toUpperCase() ?? '?';
  return (
    <span
      className={cn('account-avatar', `account-avatar-${size}`)}
      style={{
        '--platform-color': PLATFORMS[platform].color,
        '--platform-tint': PLATFORMS[platform].tint,
      } as React.CSSProperties}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  description,
  children,
  footer,
  width = 'md',
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
  labelledBy?: string;
}) {
  const generated = useId();
  const titleId = labelledBy ?? generated;
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key !== 'Tab' || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('has-modal');
    const focusTimer = window.setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>(
        'input, select, textarea, button:not(.modal-close)',
      );
      first?.focus();
    }, 30);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('has-modal');
      previous?.focus();
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={panel}
        className={cn('modal-panel', `modal-${width}`)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="modal-header">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <IconButton label="Close" className="modal-close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  children,
  headerExtra,
  width = 'wide',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  headerExtra?: ReactNode;
  width?: 'wide' | 'wider';
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('has-modal');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('has-modal');
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside
        className={cn('drawer-panel', `drawer-${width}`)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="drawer-header">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <div className="drawer-header-actions">
            {headerExtra}
            <IconButton label="Close" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </div>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : destructive ? <AlertTriangle size={16} /> : <Check size={16} />}
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="confirm-message">{message}</div>
    </Modal>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  required,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
}) {
  return (
    <div className={cn('field', error && 'has-error')}>
      <label htmlFor={htmlFor}>
        {label}
        {required && <span className="required" aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('input', className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('input textarea', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('input select', className)} {...props}>
      {children}
    </select>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn('segmented-option', value === option.value && 'is-active')}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <LoaderCircle size={18} className="spin" />
      <span>{label}</span>
    </span>
  );
}

export function SectionHeading({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function ProgressBar({ value, max = 100, tone = 'accent' }: { value: number; max?: number; tone?: string }) {
  const width = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="progress" data-tone={tone} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <span style={{ width: `${width}%` }} />
    </div>
  );
}
