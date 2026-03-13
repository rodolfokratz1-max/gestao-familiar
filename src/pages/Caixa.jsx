import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Search, Pencil, Trash2, ArrowUpCircle, ArrowDownCircle } from 'lucide-react'

const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const today = () => new Date().toISOString().split('T')[0]
const EMPTY = { data: today(), tipo: 'entrada', descricao: '', valor: '', categoria: '', obs: '', ativo: true }

export default function Caixa() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('caixa').select('*').order('data', { ascending: false })
    if (error) toast(error.message, 'error')
    else setRows(data)
    setLoading(false)
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const matchS = !q || r.descricao?.toLowerCase().includes(q) || r.categoria?.toLowerCase().includes(q)
    const matchT = !filterTipo || r.tipo === filterTipo
    return matchS && matchT
  })

  const entradas = filtered.filter(r => r.tipo === 'entrada').reduce((s, r) => s + Number(r.valor || 0), 0)
  const saidas = filtered.filter(r => r.tipo === 'saida').reduce((s, r) => s + Number(r.valor || 0), 0)
  const saldo = entradas - saidas

  function openNew() { setForm(EMPTY); setEditing(null); setModal(true) }
  function openEdit(r) { setForm({ ...r }); setEditing(r.id); setModal(true) }

  async function save() {
    if (!form.descricao?.trim()) return toast('Descrição obrigatória', 'error')
    if (!form.valor) return toast('Valor obrigatório', 'error')
    let error
    if (editing) ({ error } = await supabase.from('caixa').update(form).eq('id', editing))
    else ({ error } = await supabase.from('caixa').insert(form))
    if (error) { toast(error.message, 'error'); return }
    toast('Salvo!', 'success'); setModal(false); load()
  }

  async function destroy() {
    await supabase.from('caixa').delete().eq('id', deleting.id)
    toast('Excluído', 'success'); setDeleting(null); load()
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div>
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
        <div className="stat-card green"><div className="stat-label">Entradas</div><div className="stat-value green text-mono">{fmt(entradas)}</div></div>
        <div className="stat-card red"><div className="stat-label">Saídas</div><div className="stat-value red text-mono">{fmt(saidas)}</div></div>
        <div className="stat-card blue"><div className="stat-label">Saldo</div><div className={`stat-value text-mono ${saldo >= 0 ? 'green' : 'red'}`}>{fmt(saldo)}</div></div>
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <Search size={14} />
          <input className="search-input" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
          <option value="">Todos</option>
          <option value="entrada">Entradas</option>
          <option value="saida">Saídas</option>
        </select>
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Novo Lançamento</button>
      </div>

      <div className="card">
        {loading ? <div className="loading"><div className="spinner" /></div> :
          filtered.length === 0 ? <div className="empty-state"><p>Nenhum lançamento</p></div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Ações</th></tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id}>
                      <td className="text-mono text-muted" style={{ fontSize: 12 }}>{r.data?.split('-').reverse().join('/')}</td>
                      <td>
                        <span className={`badge ${r.tipo === 'entrada' ? 'badge-green' : 'badge-red'}`} style={{ display: 'flex', alignItems: 'center', gap: 4, width: 'fit-content' }}>
                          {r.tipo === 'entrada' ? <ArrowUpCircle size={11} /> : <ArrowDownCircle size={11} />}
                          {r.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                        </span>
                      </td>
                      <td className="font-bold">{r.descricao}</td>
                      <td className="text-muted">{r.categoria || '—'}</td>
                      <td className={`text-mono font-bold ${r.tipo === 'entrada' ? 'text-green' : 'text-red'}`}>
                        {r.tipo === 'entrada' ? '+' : '-'}{fmt(r.valor)}
                      </td>
                      <td><div className="action-btns">
                        <button className="icon-btn edit" onClick={() => openEdit(r)}><Pencil size={14} /></button>
                        <button className="icon-btn del" onClick={() => setDeleting(r)}><Trash2 size={14} /></button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {modal && (
        <Modal title={editing ? 'Editar Lançamento' : 'Novo Lançamento'} onClose={() => setModal(false)} onSave={save}>
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Data *</label>
              <input className="form-input" type="date" value={form.data} onChange={e => f('data', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo *</label>
              <select className="form-select" value={form.tipo} onChange={e => f('tipo', e.target.value)}>
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Descrição *</label>
              <input className="form-input" value={form.descricao} onChange={e => f('descricao', e.target.value)} placeholder="Descrição do lançamento" />
            </div>
            <div className="form-group">
              <label className="form-label">Valor *</label>
              <input className="form-input" type="number" step="0.01" value={form.valor} onChange={e => f('valor', e.target.value)} placeholder="0,00" />
            </div>
            <div className="form-group">
              <label className="form-label">Categoria</label>
              <input className="form-input" value={form.categoria} onChange={e => f('categoria', e.target.value)} placeholder="Ex: Alimentação" />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Observações</label>
              <textarea className="form-textarea" value={form.obs} onChange={e => f('obs', e.target.value)} />
            </div>
          </div>
        </Modal>
      )}
      {deleting && <ConfirmDialog message={`Excluir "${deleting.descricao}"?`} onConfirm={destroy} onCancel={() => setDeleting(null)} />}
    </div>
  )
}
