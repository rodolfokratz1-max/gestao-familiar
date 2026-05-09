import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { gerarCodigo } from '../lib/codigos'
import { useToast } from '../contexts/ToastContext'
import { useEntidade } from '../contexts/EntidadeContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Search, Pencil, Trash2, Power, Landmark } from 'lucide-react'

const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const TIPOS = ['Conta Corrente','Conta Poupança','Carteira (Dinheiro)','Cartão de Crédito','Cartão de Débito','PIX','Caixa Eletrônico','Outro']
const EMPTY = { codigo: '', nome: '', tipo: 'Conta Corrente', banco: '', agencia: '', conta_num: '', saldo_inicial: '', obs: '', ativo: true }

export default function Contas() {
  const toast = useToast()
  const { entidadeAtiva } = useEntidade()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { if (entidadeAtiva?.id) load() }, [entidadeAtiva?.id])

  async function load() {
    if (!entidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase.from('contas').select('*').eq('entidade_id', entidadeAtiva?.id).order('nome')
    if (error) toast(error.message, 'error')
    else setRows(data || [])
    setLoading(false)
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    return !q || r.nome?.toLowerCase().includes(q) || r.banco?.toLowerCase().includes(q) || r.tipo?.toLowerCase().includes(q)
  })

  const totalSaldo = filtered.filter(r => r.ativo).reduce((s, r) => s + Number(r.saldo_atual || r.saldo_inicial || 0), 0)

  async function openNew() {
    const codigo = await gerarCodigo('contas')
    setForm({ ...EMPTY, codigo })
    setEditing(null)
    setModal(true)
  }

  function openEdit(r) { setForm({ ...r }); setEditing(r.id); setModal(true) }

  async function save() {
    if (!form.nome?.trim()) return toast('Nome é obrigatório', 'error')
    const payload = { entidade_id: entidadeAtiva?.id || null, ...form, saldo_inicial: form.saldo_inicial || 0, saldo_atual: editing ? form.saldo_atual : (form.saldo_inicial || 0) }
    let error
    if (editing) ({ error } = await supabase.from('contas').update(payload).eq('id', editing))
    else ({ error } = await supabase.from('contas').insert(payload))
    if (error) { toast(error.message, 'error'); return }
    toast('Salvo!', 'success'); setModal(false); load()
  }

  async function toggleAtivo(r) {
    await supabase.from('contas').update({ ativo: !r.ativo }).eq('id', r.id)
    toast(`${!r.ativo ? 'Ativada' : 'Desativada'}`, 'info'); load()
  }

  async function destroy() {
    await supabase.from('contas').delete().eq('id', deleting.id)
    toast('Excluída', 'success'); setDeleting(null); load()
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div>
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', marginBottom: 16 }}>
        <div className="stat-card green">
          <div className="stat-label">Saldo Total (contas ativas)</div>
          <div className={`stat-value text-mono ${totalSaldo >= 0 ? 'green' : 'red'}`}>{fmt(totalSaldo)}</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Contas Cadastradas</div>
          <div className="stat-value blue">{filtered.filter(r => r.ativo).length}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <Search size={14} />
          <input className="search-input" placeholder="Buscar conta, banco, tipo..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Nova Conta</button>
      </div>

      <div className="card">
        {loading ? <div className="loading"><div className="spinner" /></div> :
          filtered.length === 0 ? <div className="empty-state"><Landmark size={40} /><p>Nenhuma conta cadastrada</p></div> : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>Cód.</th><th>Nome</th><th>Tipo</th><th>Banco</th><th>Ag. / Conta</th><th>Saldo Atual</th><th>Status</th><th>Ações</th>
                </tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} style={{ opacity: r.ativo ? 1 : .5 }}>
                      <td className="text-mono text-muted" style={{ fontSize: 12 }}>{r.codigo}</td>
                      <td className="font-bold">{r.nome}</td>
                      <td><span className="badge badge-blue">{r.tipo}</span></td>
                      <td className="text-muted">{r.banco || '—'}</td>
                      <td className="text-muted text-mono" style={{ fontSize: 12 }}>{r.agencia ? `${r.agencia} / ${r.conta_num}` : '—'}</td>
                      <td className={`text-mono font-bold ${Number(r.saldo_atual || 0) >= 0 ? 'text-green' : 'text-red'}`}>{fmt(r.saldo_atual || r.saldo_inicial || 0)}</td>
                      <td><span className={`badge ${r.ativo ? 'badge-green' : 'badge-gray'}`}>{r.ativo ? 'Ativa' : 'Inativa'}</span></td>
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
        <Modal title={editing ? 'Editar Conta' : 'Nova Conta'} onClose={() => setModal(false)} onSave={save}>
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Código</label>
              <input className="form-input" value={form.codigo} readOnly style={{ opacity: .7 }} />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo *</label>
              <select className="form-select" value={form.tipo} onChange={e => f('tipo', e.target.value)}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Nome da Conta *</label>
              <input className="form-input" value={form.nome} onChange={e => f('nome', e.target.value)} placeholder="Ex: Nubank, Bradesco CC, Carteira..." />
            </div>
            <div className="form-group">
              <label className="form-label">Banco / Instituição</label>
              <input className="form-input" value={form.banco} onChange={e => f('banco', e.target.value)} placeholder="Ex: Itaú, Nubank, Caixa..." />
            </div>
            <div className="form-group">
              <label className="form-label">Saldo Inicial (R$)</label>
              <input className="form-input" type="number" step="0.01" value={form.saldo_inicial} onChange={e => f('saldo_inicial', e.target.value)} placeholder="0,00" />
            </div>
            <div className="form-group">
              <label className="form-label">Agência</label>
              <input className="form-input" value={form.agencia} onChange={e => f('agencia', e.target.value)} placeholder="0000" />
            </div>
            <div className="form-group">
              <label className="form-label">Número da Conta</label>
              <input className="form-input" value={form.conta_num} onChange={e => f('conta_num', e.target.value)} placeholder="00000-0" />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Observações</label>
              <textarea className="form-textarea" value={form.obs} onChange={e => f('obs', e.target.value)} />
            </div>
          </div>
        </Modal>
      )}
      {deleting && <ConfirmDialog message={`Excluir conta "${deleting.nome}"?`} onConfirm={destroy} onCancel={() => setDeleting(null)} />}
    </div>
  )
}
