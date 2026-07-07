import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

/**
 * ConfirmModal — the platform-standard confirmation dialog. Use this for ALL
 * destructive/irreversible actions (delete, remove, reset, etc.) — NEVER the native
 * `window.confirm/alert/prompt` (those use the browser chrome and break the aesthetic).
 * Styled like the rest of the app, dark-aware, with an icon + Cancel/Confirm actions.
 */
interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  busyLabel?: string;
  busy?: boolean;
  variant?: 'destructive' | 'primary';
}

export const ConfirmModal: React.FC<Props> = ({ open, onClose, onConfirm, title, message, confirmLabel = 'Delete', busyLabel = 'Deleting…', busy = false, variant = 'destructive' }) => (
  <Modal open={open} onClose={onClose} title={title} size="sm"
    footer={<>
      <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant={variant} disabled={busy} onClick={onConfirm}>{busy ? busyLabel : confirmLabel}</Button>
    </>}>
    <div className="flex items-start gap-3">
      <div className={'w-9 h-9 rounded-full flex items-center justify-center shrink-0 ' + (variant === 'destructive' ? 'bg-rose-500/10 text-rose-500' : 'bg-brand/10 text-brand')}>
        <AlertTriangle size={18} />
      </div>
      <div className="text-sm text-slate-600 dark:text-slate-300 pt-1.5 leading-relaxed">
        {message || 'This action cannot be undone.'}
      </div>
    </div>
  </Modal>
);
