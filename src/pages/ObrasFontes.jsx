import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import { Plus, Pencil, Power, Wallet } from 'lucide-react'

const EMPTY = { nome: '', ativo: true }

export default function ObrasFontes() {
  const toast = useToast()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(EMPTY)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('obras_fontes_pagamento').select('*').order('nome')
    setRows(data || [])
    setLoading(false)
  }

  function openNew() { setForm(EMPTY); setEditing(null); setModal(true) }
  function openEdit(r) { setForm({ ...r }); setEditing(r.id); setModal(true) }

  async function save() {
    if (!form.nome?.trim()) return toast('Nome obrigatório', 'error')
    let error
    if (editing) ({ error } = await supabase.from('obras_fontes_pagamento').update({ nome: form.nome }).eq('id', editing))
    else         ({ error } = await supabase.from('obras_fontes_pagamento').insert(form))
    if (error) { toast(error.message, 'error'); return }
    toast('Salvo!', 'success'); setModal(false); load()
  }

  async function toggleAtivo(r) {
    await supabase.from('obras_fontes_pagamento').update({ ativo: !r.ativo }).eq('id', r.id)
    load()
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>

  return (
    <div>
      <div className="toolbar">
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Nova Fonte</button>
      </div>

      <div className="card">
        {rows.length === 0
          ? <div className="empty-state"><Wallet size={40} /><p>Nenhuma fonte de pagamento cadastrada</p></div>
          : <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th><th style={{ textAlign: 'center' }}>Situação</th><th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} style={{ opacity: r.ativo ? 1 : .5 }}>
                      <td className="font-bold">{r.nome}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${r.ativo ? 'badge-green' : 'badge-gray'}`}>
                          {r.ativo ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td>
                        <div className="action-btns">
                          <button className="icon-btn edit" onClick={() => openEdit(r)}><Pencil size={14} /></button>
                          <button className="icon-btn toggle" onClick={() => toggleAtivo(r)}><Power size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </div>

      {modal && (
        <Modal title={editing ? 'Editar Fonte' : 'Nova Fonte de Pagamento'} onClose={() => setModal(false)} onSave={save}>
          <div className="form-grid form-grid-1">
            <div className="form-group">
              <label className="form-label">Nome *</label>
              <input className="form-input" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: Empresa, Pessoal, João..." autoFocus />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
