import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Search, Pencil, Trash2, Power, Users } from 'lucide-react'
import { gerarCodigo } from '../lib/codigos'

const EMPTY = { codigo: '', nome: '', tipo: 'cliente', cpf_cnpj: '', telefone: '', email: '', endereco: '', obs: '', ativo: true }

export default function Pessoas() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [filterAtivo, setFilterAtivo] = useState('true')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('pessoas').select('*').order('nome')
    if (error) toast(error.message, 'error')
    else setRows(data)
    setLoading(false)
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const matchSearch = !q || r.nome?.toLowerCase().includes(q) || r.codigo?.toLowerCase().includes(q) || r.cpf_cnpj?.includes(q) || r.email?.toLowerCase().includes(q)
    const matchTipo = !filterTipo || r.tipo === filterTipo
    const matchAtivo = filterAtivo === '' || String(r.ativo) === filterAtivo
    return matchSearch && matchTipo && matchAtivo
  })

  async function openNew() { const codigo = await gerarCodigo('pessoas'); setForm({ ...EMPTY, codigo }); setEditing(null); setModal(true) }
  function openEdit(r) { setForm({ ...r }); setEditing(r.id); setModal(true) }

  async function save() {
    if (!form.nome.trim()) return toast('Nome é obrigatório', 'error')
    if (!form.codigo.trim()) return toast('Código é obrigatório', 'error')
    const payload = { ...form }
    let error
    if (editing) ({ error } = await supabase.from('pessoas').update(payload).eq('id', editing))
    else ({ error } = await supabase.from('pessoas').insert(payload))
    if (error) { toast(error.message, 'error'); return }
    toast(editing ? 'Registro atualizado!' : 'Registro criado!', 'success')
    setModal(false); load()
  }

  async function toggleAtivo(r) {
    const { error } = await supabase.from('pessoas').update({ ativo: !r.ativo }).eq('id', r.id)
    if (error) toast(error.message, 'error')
    else { toast(`Registro ${!r.ativo ? 'ativado' : 'desativado'}`, 'info'); load() }
  }

  async function destroy() {
    const { error } = await supabase.from('pessoas').delete().eq('id', deleting.id)
    if (error) toast(error.message, 'error')
    else { toast('Excluído com sucesso', 'success'); load() }
    setDeleting(null)
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const tipoColors = { cliente: 'badge-blue', fornecedor: 'badge-orange', ambos: 'badge-purple', membro: 'badge-green' }
  const tipoLabels = { cliente: 'Cliente', fornecedor: 'Fornecedor', ambos: 'Ambos', membro: 'Membro' }

  return (
    <div>
      <div className="toolbar">
        <div className="search-wrap">
          <Search size={14} />
          <input className="search-input" placeholder="Buscar por nome, código, CPF/CNPJ..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          <option value="cliente">Cliente</option>
          <option value="fornecedor">Fornecedor</option>
          <option value="ambos">Ambos</option>
                <option value="membro">Membro</option>
        </select>
        <select className="form-select" style={{ width: 'auto' }} value={filterAtivo} onChange={e => setFilterAtivo(e.target.value)}>
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
          <option value="">Todos</option>
        </select>
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Nova Pessoa</button>
      </div>

      <div className="card">
        {loading ? <div className="loading"><div className="spinner" /></div> :
          filtered.length === 0 ? (
            <div className="empty-state"><Users size={40} /><p>Nenhum registro encontrado</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>Código</th><th>Nome</th><th>Tipo</th><th>CPF/CNPJ</th><th>Telefone</th><th>E-mail</th><th>Status</th><th>Ações</th>
                </tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id}>
                      <td className="text-mono" style={{ fontSize: 12 }}>{r.codigo}</td>
                      <td className="font-bold">{r.nome}</td>
                      <td><span className={`badge ${tipoColors[r.tipo]}`}>{tipoLabels[r.tipo]}</span></td>
                      <td className="text-muted">{r.cpf_cnpj || '—'}</td>
                      <td className="text-muted">{r.telefone || '—'}</td>
                      <td className="text-muted">{r.email || '—'}</td>
                      <td><span className={`badge ${r.ativo ? 'badge-green' : 'badge-gray'}`}>{r.ativo ? 'Ativo' : 'Inativo'}</span></td>
                      <td>
                        <div className="action-btns">
                          <button className="icon-btn edit" title="Editar" onClick={() => openEdit(r)}><Pencil size={14} /></button>
                          <button className="icon-btn toggle" title={r.ativo ? 'Desativar' : 'Ativar'} onClick={() => toggleAtivo(r)}><Power size={14} /></button>
                          <button className="icon-btn del" title="Excluir" onClick={() => setDeleting(r)}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {modal && (
        <Modal title={editing ? 'Editar Pessoa' : 'Nova Pessoa'} onClose={() => setModal(false)} onSave={save}>
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Código</label>
              <input className="form-input" value={form.codigo} readOnly style={{ opacity: .7 }} />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo *</label>
              <select className="form-select" value={form.tipo} onChange={e => f('tipo', e.target.value)}>
                <option value="cliente">Cliente</option>
                <option value="fornecedor">Fornecedor</option>
                <option value="ambos">Ambos</option>
                <option value="membro">Membro</option>
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Nome *</label>
              <input className="form-input" value={form.nome} onChange={e => f('nome', e.target.value)} placeholder="Nome completo ou razão social" />
            </div>
            <div className="form-group">
              <label className="form-label">CPF / CNPJ</label>
              <input className="form-input" value={form.cpf_cnpj} onChange={e => f('cpf_cnpj', e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div className="form-group">
              <label className="form-label">Telefone</label>
              <input className="form-input" value={form.telefone} onChange={e => f('telefone', e.target.value)} placeholder="(00) 00000-0000" />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">E-mail</label>
              <input className="form-input" type="email" value={form.email} onChange={e => f('email', e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Endereço</label>
              <input className="form-input" value={form.endereco} onChange={e => f('endereco', e.target.value)} placeholder="Rua, número, cidade..." />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Observações</label>
              <textarea className="form-textarea" value={form.obs} onChange={e => f('obs', e.target.value)} placeholder="Observações adicionais..." />
            </div>
          </div>
        </Modal>
      )}

      {deleting && <ConfirmDialog message={`Excluir "${deleting.nome}"? Esta ação não pode ser desfeita.`} onConfirm={destroy} onCancel={() => setDeleting(null)} />}
    </div>
  )
}
