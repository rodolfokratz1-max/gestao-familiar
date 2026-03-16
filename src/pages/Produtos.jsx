import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Search, Pencil, Trash2, Power, Package, Tag, Calculator } from 'lucide-react'
import { gerarCodigo } from '../lib/codigos'

const fmt = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})
const UNIDADES = ['un','kg','g','l','ml','m','m²','cx','pç','hr','dia','mês']

const EMPTY_PROD = {
  codigo:'', nome:'', tipo:'produto', categoria_id:'', unidade:'un',
  preco_custo:'', margem:'', preco_venda:'', estoque:'', estoque_min:'', obs:'', ativo:true
}
const EMPTY_CAT = { nome:'', tipo:'produto', descricao:'' }

export default function Produtos() {
  const toast = useToast()
  const [rows, setRows]       = useState([])
  const [cats, setCats]       = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filterTipo, setFilterTipo]   = useState('')
  const [filterAtivo, setFilterAtivo] = useState('true')
  const [filterCat, setFilterCat]     = useState('')

  const [modal, setModal]           = useState(false)
  const [editing, setEditing]       = useState(null)
  const [form, setForm]             = useState(EMPTY_PROD)
  const [deleting, setDeleting]     = useState(null)

  const [modalCat, setModalCat]         = useState(false)
  const [editingCat, setEditingCat]     = useState(null)
  const [formCat, setFormCat]           = useState(EMPTY_CAT)
  const [deletingCat, setDeletingCat]   = useState(null)
  const [showCats, setShowCats]         = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('produtos').select('*').order('nome'),
      supabase.from('produto_categorias').select('*').order('nome'),
    ])
    setRows(p || [])
    setCats(c || [])
    setLoading(false)
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Cálculo de margem ↔ preço de venda
  function calcVenda(custo, margem) {
    const c = Number(custo); const m = Number(margem)
    if (!c || !m) return ''
    return (c / (1 - m/100)).toFixed(2)
  }
  function calcMargem(custo, venda) {
    const c = Number(custo); const v = Number(venda)
    if (!c || !v || v <= c) return ''
    return ((v - c) / v * 100).toFixed(2)
  }

  function onCustoChange(v) {
    f('preco_custo', v)
    if (form.margem) f('preco_venda', calcVenda(v, form.margem))
    else if (form.preco_venda) f('margem', calcMargem(v, form.preco_venda))
  }
  function onMargemChange(v) {
    f('margem', v)
    if (form.preco_custo) f('preco_venda', calcVenda(form.preco_custo, v))
  }
  function onVendaChange(v) {
    f('preco_venda', v)
    if (form.preco_custo) f('margem', calcMargem(form.preco_custo, v))
  }

  function aceitarVendaSugerido() {
    const sugerido = calcVenda(form.preco_custo, form.margem)
    if (sugerido) f('preco_venda', sugerido)
  }

  const margemNum = Number(form.margem)
  const margemColor = margemNum <= 0 ? 'var(--red)' : margemNum < 20 ? 'var(--yellow)' : 'var(--green)'

  // ── Produtos CRUD ────────────────────────────
  async function openNew() {
    const codigo = await gerarCodigo('produtos')
    setForm({ ...EMPTY_PROD, codigo }); setEditing(null); setModal(true)
  }
  function openEdit(r) { setForm({ ...EMPTY_PROD, ...r, margem: r.preco_custo && r.preco_venda ? calcMargem(r.preco_custo, r.preco_venda) : '' }); setEditing(r.id); setModal(true) }

  async function save() {
    if (!form.nome.trim()) return toast('Nome é obrigatório', 'error')
    if (!form.codigo.trim()) return toast('Código é obrigatório', 'error')
    const payload = {
      ...form,
      preco_custo: form.preco_custo || null,
      preco_venda: form.preco_venda || null,
      margem: form.margem || null,
      estoque: form.estoque || 0,
      estoque_min: form.estoque_min || 0,
      categoria_id: form.categoria_id || null,
    }
    let error
    if (editing) ({ error } = await supabase.from('produtos').update(payload).eq('id', editing))
    else ({ error } = await supabase.from('produtos').insert(payload))
    if (error) { toast(error.message,'error'); return }
    toast(editing ? 'Atualizado!' : 'Criado!', 'success')
    setModal(false); loadAll()
  }

  async function toggleAtivo(r) {
    await supabase.from('produtos').update({ ativo: !r.ativo }).eq('id', r.id)
    loadAll()
  }
  async function destroy() {
    await supabase.from('produtos').delete().eq('id', deleting.id)
    toast('Excluído','success'); setDeleting(null); loadAll()
  }

  // ── Categorias CRUD ──────────────────────────
  function openNewCat() { setFormCat(EMPTY_CAT); setEditingCat(null); setModalCat(true) }
  function openEditCat(c) { setFormCat({...c}); setEditingCat(c.id); setModalCat(true) }
  async function saveCat() {
    if (!formCat.nome?.trim()) return toast('Nome obrigatório','error')
    let error
    if (editingCat) ({ error } = await supabase.from('produto_categorias').update(formCat).eq('id', editingCat))
    else ({ error } = await supabase.from('produto_categorias').insert(formCat))
    if (error) { toast(error.message,'error'); return }
    toast('Categoria salva!','success'); setModalCat(false); loadAll()
  }
  async function destroyCat() {
    await supabase.from('produto_categorias').delete().eq('id', deletingCat.id)
    toast('Excluída','success'); setDeletingCat(null); loadAll()
  }

  const estoqueColor = r => r.tipo==='servico' ? '' : Number(r.estoque) <= Number(r.estoque_min) ? 'text-red' : 'text-green'
  const catNome = id => cats.find(c => c.id === id)?.nome || '—'

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const mQ = !q || r.nome?.toLowerCase().includes(q) || r.codigo?.toLowerCase().includes(q)
    const mT = !filterTipo || r.tipo === filterTipo
    const mA = filterAtivo === '' || String(r.ativo) === filterAtivo
    const mC = !filterCat || r.categoria_id === filterCat
    return mQ && mT && mA && mC
  })

  const catsFiltradas = form.tipo === 'servico' ? cats.filter(c => c.tipo !== 'produto') : cats.filter(c => c.tipo !== 'servico')

  return (
    <div>
      {/* Gerenciar categorias */}
      <div style={{ marginBottom:12 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowCats(!showCats)}>
          <Tag size={13} /> {showCats ? 'Ocultar' : 'Gerenciar'} categorias
        </button>
      </div>

      {showCats && (
        <div className="card" style={{ marginBottom:16 }}>
          <div className="card-header">
            <span className="card-title"><Tag size={14} /> Categorias de Produtos/Serviços</span>
            <button className="btn btn-sm btn-primary" onClick={openNewCat}><Plus size={13} /> Nova</button>
          </div>
          {cats.length === 0
            ? <div style={{ color:'var(--text3)', fontSize:13 }}>Nenhuma categoria. Crie para organizar seus produtos.</div>
            : <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:4 }}>
                {cats.map(c => (
                  <div key={c.id} style={{ display:'flex', alignItems:'center', gap:6, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:'5px 10px' }}>
                    <span style={{ fontSize:12, fontWeight:600 }}>{c.nome}</span>
                    <span className={`badge ${c.tipo==='produto' ? 'badge-blue' : c.tipo==='servico' ? 'badge-purple' : 'badge-gray'}`} style={{ fontSize:10 }}>{c.tipo}</span>
                    <button className="icon-btn edit" style={{ width:20, height:20 }} onClick={() => openEditCat(c)}><Pencil size={11}/></button>
                    <button className="icon-btn del" style={{ width:20, height:20 }} onClick={() => setDeletingCat(c)}><Trash2 size={11}/></button>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      <div className="toolbar">
        <div className="search-wrap">
          <Search size={14} />
          <input className="search-input" placeholder="Buscar por nome, código..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width:'auto' }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
          <option value="">Todos</option>
          <option value="produto">Produto</option>
          <option value="servico">Serviço</option>
        </select>
        <select className="form-select" style={{ width:'auto' }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">Todas categorias</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select className="form-select" style={{ width:'auto' }} value={filterAtivo} onChange={e => setFilterAtivo(e.target.value)}>
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
          <option value="">Todos</option>
        </select>
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Novo</button>
      </div>

      <div className="card">
        {loading ? <div className="loading"><div className="spinner"/></div> :
          filtered.length === 0 ? <div className="empty-state"><Package size={40}/><p>Nenhum registro</p></div> : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>Código</th><th>Nome</th><th>Tipo</th><th>Categoria</th>
                  <th>Custo</th><th>Margem</th><th>Venda</th><th>Estoque</th><th>Status</th><th>Ações</th>
                </tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} style={{ opacity: r.ativo ? 1 : .5 }}>
                      <td className="text-mono" style={{ fontSize:12 }}>{r.codigo}</td>
                      <td className="font-bold">{r.nome}</td>
                      <td><span className={`badge ${r.tipo==='produto' ? 'badge-blue' : 'badge-purple'}`}>{r.tipo==='produto' ? 'Produto' : 'Serviço'}</span></td>
                      <td className="text-muted" style={{ fontSize:12 }}>{catNome(r.categoria_id)}</td>
                      <td className="text-mono" style={{ fontSize:12 }}>{r.preco_custo ? fmt(r.preco_custo) : '—'}</td>
                      <td style={{ fontSize:12, fontWeight:700, color: Number(r.margem) > 0 ? 'var(--green)' : 'var(--text3)' }}>
                        {r.margem ? `${Number(r.margem).toFixed(1)}%` : '—'}
                      </td>
                      <td className="text-mono font-bold text-green" style={{ fontSize:12 }}>{r.preco_venda ? fmt(r.preco_venda) : '—'}</td>
                      <td className={`text-mono ${estoqueColor(r)}`} style={{ fontSize:12 }}>{r.tipo==='servico' ? '—' : `${r.estoque||0} ${r.unidade}`}</td>
                      <td><span className={`badge ${r.ativo ? 'badge-green' : 'badge-gray'}`}>{r.ativo ? 'Ativo' : 'Inativo'}</span></td>
                      <td><div className="action-btns">
                        <button className="icon-btn edit" onClick={() => openEdit(r)}><Pencil size={13}/></button>
                        <button className="icon-btn toggle" onClick={() => toggleAtivo(r)}><Power size={13}/></button>
                        <button className="icon-btn del" onClick={() => setDeleting(r)}><Trash2 size={13}/></button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* Modal produto */}
      {modal && (
        <Modal title={editing ? 'Editar' : 'Novo Produto / Serviço'} onClose={() => setModal(false)} onSave={save} size="modal-lg">
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Código</label>
              <input className="form-input" value={form.codigo} readOnly style={{ opacity:.7 }} />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo *</label>
              <select className="form-select" value={form.tipo} onChange={e => f('tipo', e.target.value)}>
                <option value="produto">Produto</option>
                <option value="servico">Serviço</option>
              </select>
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Nome *</label>
              <input className="form-input" value={form.nome} onChange={e => f('nome', e.target.value)} placeholder="Nome do produto ou serviço" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Categoria</label>
              <select className="form-select" value={form.categoria_id} onChange={e => f('categoria_id', e.target.value)}>
                <option value="">Sem categoria</option>
                {catsFiltradas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Unidade</label>
              <select className="form-select" value={form.unidade} onChange={e => f('unidade', e.target.value)}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            <div style={{ gridColumn:'1/-1', height:1, background:'var(--border)', margin:'2px 0' }} />

            {/* Precificação */}
            <div className="form-group">
              <label className="form-label">Preço de Custo</label>
              <input className="form-input" type="number" step="0.01" value={form.preco_custo}
                onChange={e => onCustoChange(e.target.value)} placeholder="0,00" />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ display:'flex', alignItems:'center', gap:6 }}>
                <Calculator size={12} /> Margem de Lucro (%)
              </label>
              <input className="form-input" type="number" step="0.1" value={form.margem}
                onChange={e => onMargemChange(e.target.value)} placeholder="Ex: 40"
                style={{ borderColor: form.margem ? margemColor : undefined }} />
            </div>

            {/* Preview do preço sugerido */}
            {form.preco_custo && form.margem && (
              <div style={{ gridColumn:'1/-1', background:'var(--bg3)', borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginBottom:3 }}>PREÇO SUGERIDO (margem {form.margem}%)</div>
                  <div style={{ fontSize:20, fontWeight:900, color:'var(--green)', fontFamily:'var(--mono)' }}>
                    {fmt(calcVenda(form.preco_custo, form.margem))}
                  </div>
                </div>
                <button className="btn btn-success btn-sm" onClick={aceitarVendaSugerido}>
                  ✓ Aceitar este valor
                </button>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Preço de Venda</label>
              <input className="form-input" type="number" step="0.01" value={form.preco_venda}
                onChange={e => onVendaChange(e.target.value)} placeholder="0,00"
                style={{ fontWeight:700, borderColor: form.preco_venda ? 'var(--accent)' : undefined }} />
              {form.preco_custo && form.preco_venda && (
                <span style={{ fontSize:11, color: margemColor, fontWeight:700 }}>
                  Margem: {calcMargem(form.preco_custo, form.preco_venda)}%
                </span>
              )}
            </div>
            <div className="form-group" style={{ alignSelf:'flex-end' }}>
              {form.preco_custo && form.preco_venda && (
                <div style={{ background:'var(--bg3)', borderRadius:8, padding:'8px 12px', fontSize:12 }}>
                  <div style={{ color:'var(--text3)', fontSize:10, marginBottom:2 }}>LUCRO UNITÁRIO</div>
                  <div style={{ fontWeight:800, color: Number(form.preco_venda) > Number(form.preco_custo) ? 'var(--green)' : 'var(--red)', fontFamily:'var(--mono)' }}>
                    {fmt(Number(form.preco_venda) - Number(form.preco_custo))}
                  </div>
                </div>
              )}
            </div>

            {form.tipo === 'produto' && <>
              <div style={{ gridColumn:'1/-1', height:1, background:'var(--border)', margin:'2px 0' }} />
              <div className="form-group">
                <label className="form-label">Estoque Atual</label>
                <input className="form-input" type="number" value={form.estoque} onChange={e => f('estoque', e.target.value)} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Estoque Mínimo</label>
                <input className="form-input" type="number" value={form.estoque_min} onChange={e => f('estoque_min', e.target.value)} placeholder="0" />
                <span style={{ fontSize:11, color:'var(--text3)' }}>Abaixo desse valor aparece alerta vermelho</span>
              </div>
            </>}

            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Observações</label>
              <textarea className="form-textarea" rows={2} value={form.obs} onChange={e => f('obs', e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      {/* Modal categoria */}
      {modalCat && (
        <Modal title={editingCat ? 'Editar Categoria' : 'Nova Categoria'} onClose={() => setModalCat(false)} onSave={saveCat}>
          <div className="form-grid form-grid-1">
            <div className="form-group">
              <label className="form-label">Nome *</label>
              <input className="form-input" value={formCat.nome} onChange={e => setFormCat(p=>({...p,nome:e.target.value}))} placeholder="Ex: Eletrônicos, Manutenção..." autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Aplica-se a</label>
              <select className="form-select" value={formCat.tipo} onChange={e => setFormCat(p=>({...p,tipo:e.target.value}))}>
                <option value="ambos">Produtos e Serviços</option>
                <option value="produto">Somente Produtos</option>
                <option value="servico">Somente Serviços</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Descrição</label>
              <input className="form-input" value={formCat.descricao||''} onChange={e => setFormCat(p=>({...p,descricao:e.target.value}))} placeholder="Opcional" />
            </div>
          </div>
        </Modal>
      )}

      {deleting && <ConfirmDialog message={`Excluir "${deleting.nome}"?`} onConfirm={destroy} onCancel={() => setDeleting(null)} />}
      {deletingCat && <ConfirmDialog message={`Excluir categoria "${deletingCat.nome}"?`} onConfirm={destroyCat} onCancel={() => setDeletingCat(null)} />}
    </div>
  )
}
