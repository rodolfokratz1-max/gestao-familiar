import { X } from 'lucide-react'

export default function Modal({ title, onClose, onSave, children, size = '' }) {
  return (
    <div className="modal-overlay">
      <div className={`modal ${size}`}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          {children}
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={onSave}>Salvar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
