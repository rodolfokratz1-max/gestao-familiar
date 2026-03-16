import { AlertTriangle, CheckCircle, X } from 'lucide-react'

export default function ConfirmDialog({
  message = 'Deseja realmente excluir este registro?',
  onConfirm, onCancel,
  title = null,
  confirmLabel = null,
  confirmStyle = null, // 'danger' | 'primary' | 'success'
}) {
  const isDanger   = !confirmStyle || confirmStyle === 'danger'
  const isPrimary  = confirmStyle === 'primary'
  const isSuccess  = confirmStyle === 'success'

  const btnClass = isPrimary ? 'btn-primary' : isSuccess ? 'btn-success' : 'btn-danger'
  const defaultLabel = isDanger ? 'Excluir' : 'Confirmar'
  const icon = isDanger ? <AlertTriangle size={18} color="var(--red)" /> : <CheckCircle size={18} color={isSuccess ? 'var(--green)' : 'var(--accent)'} />
  const defaultTitle = isDanger ? 'Confirmar exclusão' : 'Confirmar'

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {icon} {title || defaultTitle}
          </span>
          <button className="icon-btn" onClick={onCancel}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text2)', fontSize: 14, whiteSpace: 'pre-line', lineHeight: 1.6 }}>{message}</p>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
            <button className={`btn ${btnClass}`} onClick={onConfirm}>{confirmLabel || defaultLabel}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
