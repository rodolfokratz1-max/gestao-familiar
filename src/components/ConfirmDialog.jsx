import { AlertTriangle, X } from 'lucide-react'

export default function ConfirmDialog({ message = 'Deseja realmente excluir este registro?', onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} color="var(--red)" /> Confirmar exclusão
          </span>
          <button className="icon-btn" onClick={onCancel}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text2)', fontSize: 14 }}>{message}</p>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
            <button className="btn btn-danger" onClick={onConfirm}>Excluir</button>
          </div>
        </div>
      </div>
    </div>
  )
}
