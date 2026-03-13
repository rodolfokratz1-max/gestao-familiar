import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Search, Pencil, Trash2, Power, Package } from 'lucide-react'
import { gerarCodigo } from '../lib/codigos'

const EMPTY = { codigo: '', nome: '', tipo: 'produto', categoria: '', unidade: 'un', preco_custo: '', preco_venda: '', estoque: '', estoque_min: '', obs: '', ativo: true }
const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

export default function Produtos() {
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
    const { data, error } = await supabase.from('produtos').select('*').order('nome')
    if (error) toast(error.message, 'error')
    else setRows(data)
    setLoading(false)
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const matchS = !q || r.nome?.toLowerCase().includes(q) || r.codigo?.toLowerCase().includes(q) || r.categoria?.toLowerCase().includes(q)
    const matchT = !filterTipo || r.tipo === filterTipo
    const matchA = filterAtivo === '' || String(r.ativo) === filterAtivo
    return matchS && matchT && matchA
  })

  async function openNew() { const codigo = await gerarCodigo('produtos'); setForm({ ...EMPTY, codigo }); setEditing(null); setModal(true) }
  function openEdit(r) { setForm({ ...r }); setEditing(r.id); setModal(true) }

  async function save() {
    if (!form.nome.trim()) return toast('Nome é obrigatório', 'error')
    if (!form.codigo.trim()) return toast('Código é obrigatório', 'error')
    const payload = { ...form, preco_custo: form.preco_custo || null, preco_venda: form.preco_venda || null, estoque: form.estoque || 0, estoque_min: form.estoque_min || 0 }
    let error
    if (editing) ({ error } = await supabase.from('produtos').update(payload).eq('id', editing))
    else ({ error } = await supabase.from('produtos').insert(payload))
    if (error) { toast(error.message, 'error'); return }
    toast(editing ? 'Atualizado!' : 'Criado!', 'success')
    setModal(false); load()
  }

  async function toggleAtivo(r) {
    const { error } = await supabase.from('produtos').update({ ativo: !r.ativo }).eq('id', r.id)
    if (error) toast(error.message, 'error')
    else { toast(`${!r.ativo ? 'Ativado' : 'Desativado'}`, 'info'); load() }
  }

  async function destroy() {
    const { error } = await supabase.from('produtos').delete().eq('id', deleting.id)
    if (error) toast(error.message, 'error')
    else { toast('Excluído', 'success'); load() }
    setDeleting(null)
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const estoqueColor = r => r.tipo === 'servico' ? '' : Number(r.estoque) <= Number(r.estoque_min) ? 'text-red' : 'text-green'

  return (
    <div>
      <div className="toolbar">
        <div className="search-wrap">
          <Search size={14} />
          <input className="search-input" placeholder="Buscar por nome, código, categoria..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
          <option value="">Todos</option>
          <option value="produto">Produto</option>
          <option value="servico">Serviço</option>
        </select>
        <select className="form-select" style={{ width: 'auto' }} value={filterAtivo} onChange={e => setFilterAtivo(e.target.value)}>
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
          <option value="">Todos</option>
        </select>
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Novo</button>
      </div>

      <div className="card">
        {loading ? <div className="loading"><div className="spinner" /></div> :
          filtered.length === 0 ? <div className="empty-state"><Package size={40} /><p>Nenhum registro</p></div> : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>Código</th><th>Nome</th><th>Tipo</th><th>Categoria</th><th>Preço Venda</th><th>Estoque</th><th>Status</th><th>Ações</th>
                </tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id}>
                      <td className="text-mono" style={{ fontSize: 12 }}>{r.codigo}</td>
                      <td className="font-bold">{r.nome}</td>
                      <td><span className={`badge ${r.tipo === 'produto' ? 'badge-blue' : 'badge-purple'}`}>{r.tipo === 'produto' ? 'Produto' : 'Serviço'}</span></td>
                      <td className="text-muted">{r.categoria || '—'}</td>
                      <td className="text-mono">{r.preco_venda ? fmt(r.preco_venda) : '—'}</td>
                      <td className={`text-mono ${estoqueColor(r)}`}>{r.tipo === 'servico' ? '—' : `${r.estoque} ${r.unidade}`}</td>
                      <td><span className={`badge ${r.ativo ? 'badge-green' : 'badge-gray'}`}>{r.ativo ? 'Ativo' : 'Inativo'}</span></td>
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
        <Modal title={editing ? 'Editar' : 'Novo Produto/Serviço'} onClose={() => setModal(false)} onSave={save}>
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Código</label>
              <input className="form-input" value={form.codigo} readOnly style={{ opacity: .7 }} />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo *</label>
              <select className="form-select" value={form.tipo} onChange={e => f('tipo', e.target.value)}>
                <option value="produto">Produto</option>
                <option value="servico">Serviço</option>
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Nome *</label>
              <input className="form-input" value={form.nome} onChange={e => f('nome', e.target.value)} placeholder="Nome do produto ou serviço" />
            </div>
            <div className="form-group">
              <label className="form-label">Categoria</label>
              <input className="form-input" value={form.categoria} onChange={e => f('categoria', e.target.value)} placeholder="Ex: Alimentação" />
            </div>
            <div className="form-group">
              <label className="form-label">Unidade</label>
              <select className="form-select" value={form.unidade} onChange={e => f('unidade', e.target.value)}>
                {['un', 'kg', 'g', 'l', 'ml', 'm', 'm²', 'cx', 'pç', 'hr'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Preço de Custo</label>
              <input className="form-input" type="number" step="0.01" value={form.preco_custo} onChange={e => f('preco_custo', e.target.value)} placeholder="0,00" />
            </div>
            <div className="form-group">
              <label className="form-label">Preço de Venda</label>
              <input className="form-input" type="number" step="0.01" value={form.preco_venda} onChange={e => f('preco_venda', e.target.value)} placeholder="0,00" />
            </div>
            {form.tipo === 'produto' && <>
              <div className="form-group">
                <label className="form-label">Estoque Atual</label>
                <input className="form-input" type="number" value={form.estoque} onChange={e => f('estoque', e.target.value)} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Estoque Mínimo</label>
                <input className="form-input" type="number" value={form.estoque_min} onChange={e => f('estoque_min', e.target.value)} placeholder="0" />
              </div>
            </>}
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Observações</label>
              <textarea className="form-textarea" value={form.obs} onChange={e => f('obs', e.target.value)} />
            </div>
          </div>
        </Modal>
      )}
      {deleting && <ConfirmDialog message={`Excluir "${deleting.nome}"?`} onConfirm={destroy} onCancel={() => setDeleting(null)} />}
    </div>
  )
}
