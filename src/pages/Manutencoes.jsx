import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useEntidade } from '../contexts/EntidadeContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Search, Pencil, Trash2, Power, Wrench } from 'lucide-react'
import { today } from '../lib/utils.js'

const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const EMPTY = { data_abertura: today(), bem: '', tipo: '', descricao: '', responsavel: '', custo: '', status: 'pendente', data_conclusao: '', obs: '', ativo: true }

export default function Manutencoes() {
  const toast = useToast()
  const { entidadeAtiva } = useEntidade()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('manutencoes').select('*').eq('entidade_id', entidadeAtiva?.id).order('data_abertura', { ascending: false })
    if (error) toast(error.message, 'error')
    else setRows(data)
    setLoading(false)
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const matchS = !q || r.bem?.toLowerCase().includes(q) || r.descricao?.toLowerCase().includes(q) || r.responsavel?.toLowerCase().includes(q)
    const matchF = !filterStatus || r.status === filterStatus
    return matchS && matchF
  })

  function openNew() { setForm(EMPTY); setEditing(null); setModal(true) }
  function openEdit(r) { setForm({ ...r }); setEditing(r.id); setModal(true) }

  async function save() {
    if (!form.bem?.trim()) return toast('Bem/Equipamento obrigatório', 'error')
    if (!form.descricao?.trim()) return toast('Descrição obrigatória', 'error')
    let error
    if (editing) ({ error } = await supabase.from('manutencoes').update(form).eq('id', editing))
    else ({ error } = await supabase.from('manutencoes').insert({...form, entidade_id: entidadeAtiva?.id}))
    if (error) { toast(error.message, 'error'); return }
    toast('Salvo!', 'success'); setModal(false); load()
  }

  async function toggleAtivo(r) {
    await supabase.from('manutencoes').update({ ativo: !r.ativo }).eq('id', r.id); load()
  }

  async function destroy() {
    await supabase.from('manutencoes').delete().eq('id', deleting.id)
    toast('Excluído', 'success'); setDeleting(null); load()
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const statusColors = { pendente: 'badge-yellow', 'em andamento': 'badge-blue', concluido: 'badge-green', cancelado: 'badge-red' }
  const totalCusto = filtered.reduce((s, r) => s + Number(r.custo || 0), 0)
  const pendentes = filtered.filter(r => r.status === 'pendente').length

  return (
    <div>
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
        <div className="stat-card yellow"><div className="stat-label">Pendentes</div><div className="stat-value yellow">{pendentes}</div></div>
        <div className="stat-card purple"><div className="stat-label">Custo Total</div><div className="stat-value purple text-mono">{fmt(totalCusto)}</div></div>
        <div className="stat-card green"><div className="stat-label">Concluídas</div><div className="stat-value green">{filtered.filter(r => r.status === 'concluido').length}</div></div>
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <Search size={14} />
          <input className="search-input" placeholder="Buscar bem, descrição, responsável..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos</option>
          <option value="pendente">Pendente</option>
          <option value="em andamento">Em andamento</option>
          <option value="concluido">Concluído</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Nova Manutenção</button>
      </div>

      <div className="card">
        {loading ? <div className="loading"><div className="spinner" /></div> :
          filtered.length === 0 ? <div className="empty-state"><Wrench size={40} /><p>Nenhuma manutenção registrada</p></div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Abertura</th><th>Bem / Equipamento</th><th>Tipo</th><th>Descrição</th><th>Responsável</th><th>Custo</th><th>Status</th><th>Ações</th></tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} style={{ opacity: r.ativo ? 1 : .5 }}>
                      <td className="text-mono text-muted" style={{ fontSize: 12 }}>{r.data_abertura?.split('-').reverse().join('/')}</td>
                      <td className="font-bold">{r.bem}</td>
                      <td className="text-muted">{r.tipo || '—'}</td>
                      <td style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.descricao}</td>
                      <td className="text-muted">{r.responsavel || '—'}</td>
                      <td className="text-mono">{r.custo ? fmt(r.custo) : '—'}</td>
                      <td><span className={`badge ${statusColors[r.status] || 'badge-gray'}`}>{r.status}</span></td>
                      <td><div className="action-btns">
                        <button className="icon-btn edit" onClick={() => openEdit(r)}><Pencil size={14} /></button>
                        <button className="icon-btn toggle" onClick={() => toggleAtivo(r)}><Power size={14} /></button>
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
        <Modal title={editing ? 'Editar Manutenção' : 'Nova Manutenção'} onClose={() => setModal(false)} onSave={save}>
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Data Abertura *</label>
              <input className="form-input" type="date" value={form.data_abertura} onChange={e => f('data_abertura', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e => f('status', e.target.value)}>
                <option value="pendente">Pendente</option>
                <option value="em andamento">Em andamento</option>
                <option value="concluido">Concluído</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Bem / Equipamento *</label>
              <input className="form-input" value={form.bem} onChange={e => f('bem', e.target.value)} placeholder="Ex: Carro, Geladeira, Notebook..." />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de Manutenção</label>
              <select className="form-select" value={form.tipo} onChange={e => f('tipo', e.target.value)}>
                <option value="">Selecionar...</option>
                {['Preventiva','Corretiva','Revisão','Instalação','Limpeza','Troca de peça','Outro'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Descrição *</label>
              <textarea className="form-textarea" value={form.descricao} onChange={e => f('descricao', e.target.value)} placeholder="Descreva o problema ou serviço..." />
            </div>
            <div className="form-group">
              <label className="form-label">Responsável / Técnico</label>
              <input className="form-input" value={form.responsavel} onChange={e => f('responsavel', e.target.value)} placeholder="Nome do técnico ou empresa" />
            </div>
            <div className="form-group">
              <label className="form-label">Custo (R$)</label>
              <input className="form-input" type="number" step="0.01" value={form.custo} onChange={e => f('custo', e.target.value)} placeholder="0,00" />
            </div>
            <div className="form-group">
              <label className="form-label">Data Conclusão</label>
              <input className="form-input" type="date" value={form.data_conclusao} onChange={e => f('data_conclusao', e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Observações</label>
              <textarea className="form-textarea" value={form.obs} onChange={e => f('obs', e.target.value)} />
            </div>
          </div>
        </Modal>
      )}
      {deleting && <ConfirmDialog message={`Excluir manutenção de "${deleting.bem}"?`} onConfirm={destroy} onCancel={() => setDeleting(null)} />}
    </div>
  )
}
