// ============================================================
// ConfirmDialog — In-app confirmation modal
// ============================================================
// A styled replacement for window.confirm(), matching the app's
// dark glassmorphism theme. Controlled via the `open` prop.
// ============================================================

'use client';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** Render the confirm button in a destructive style. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <>
      <div className="modal-backdrop" onClick={onCancel} />
      <div
        className="modal"
        style={{ width: 'min(90vw, 420px)' }}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
        </div>
        {message && (
          <div className="modal-body">
            <p
              style={{
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--text-sm)',
                lineHeight: 'var(--leading-relaxed)',
              }}
            >
              {message}
            </p>
          </div>
        )}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </>
  );
}
