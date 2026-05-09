import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useEntidade } from '../contexts/EntidadeContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Search, Pencil, Trash2, Power, Package, Tag, Calculator } from 'lucide-react'
import { gerarCodigo } from '../lib/codigos'
import { verificarExclusao } from '../lib/integridade'

const fmt = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})
const UNIDADES = ['un','kg','g','l','ml','m','m²','cx','pç','hr','dia','mês']

const EMPTY_PROD = {
  codigo:'', nome:'', tipo:'produto', categoria_id:'', unidade:'un',
  preco_custo:'', margem:'', preco_venda:'', estoque:'', estoque_min:'',
  codigo_barras:'', gtin:'', custo_medio:'', ultima_venda:'',
  // fiscal produto
  ncm:'', cest:'', cfop:'', origem:'0', gtin_comercial:'',
  cst_icms:'', aliquota_icms:'', cst_pis:'', aliquota_pis:'', cst_cofins:'', aliquota_cofins:'',
  ipi_cst:'', aliquota_ipi:'',
  // fiscal serviço
  codigo_servico:'', iss_retido: false, aliquota_iss:'',
  // logística
  peso_bruto:'', peso_liquido:'', altura:'', largura:'', comprimento:'',
  obs:'', ativo:true
}
const EMPTY_CAT = { nome:'', tipo:'produto', descricao:'' }

export default function Produtos() {
  const toast = useToast()
  const { entidadeAtiva } = useEntidade()
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
  const [abaModal, setAbaModal]     = useState('geral')
  const [deleting, setDeleting]     = useState(null)

  const [modalCat, setModalCat]         = useState(false)
  const [editingCat, setEditingCat]     = useState(null)
  const [formCat, setFormCat]           = useState(EMPTY_CAT)
  const [deletingCat, setDeletingCat]   = useState(null)
  const [showCats, setShowCats]         = useState(false)


  // Sanitiza payload — converte strings vazias para null (evita erro uuid inválido)
  const sanitize = (obj) => Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v === '' ? null : v])
  )

  useEffect(() => { if (entidadeAtiva?.id) loadAll() }, [entidadeAtiva?.id])

  async function loadAll() {
    if (!entidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('produtos').select('*').eq('entidade_id', entidadeAtiva?.id).order('nome'),
      supabase.from('produto_categorias').select('*').eq('entidade_id', entidadeAtiva?.id).order('nome'),
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
    setForm({ ...EMPTY_PROD, codigo }); setEditing(null); setAbaModal('geral'); setModal(true)
  }
  function openEdit(r) { setForm({ ...EMPTY_PROD, ...r, margem: r.preco_custo && r.preco_venda ? calcMargem(r.preco_custo, r.preco_venda) : '' }); setEditing(r.id); setAbaModal('geral'); setModal(true) }

  async function save() {
    if (!entidadeAtiva?.id) return toast('Selecione uma entidade antes de salvar', 'error')
    if (!form.nome.trim()) return toast('Nome é obrigatório', 'error')
    if (!form.codigo.trim()) return toast('Código é obrigatório', 'error')
    const payload = {
      ...form,
      preco_custo:    form.preco_custo    || null,
      preco_venda:    form.preco_venda    || null,
      margem:         form.margem         || null,
      estoque:        form.estoque        || 0,
      estoque_min:    form.estoque_min    || 0,
      categoria_id:   form.categoria_id   || null,
      codigo_barras:  form.codigo_barras  || null,
      gtin:           form.gtin           || null,
      custo_medio:    form.custo_medio    || null,
      ultima_venda:   form.ultima_venda   || null,
      // fiscal produto
      ncm:            form.ncm            || null,
      cest:           form.cest           || null,
      cfop:           form.cfop           || null,
      origem:         form.origem         || '0',
      cst_icms:       form.cst_icms       || null,
      aliquota_icms:  form.aliquota_icms  || null,
      cst_pis:        form.cst_pis        || null,
      aliquota_pis:   form.aliquota_pis   || null,
      cst_cofins:     form.cst_cofins     || null,
      aliquota_cofins:form.aliquota_cofins|| null,
      ipi_cst:        form.ipi_cst        || null,
      aliquota_ipi:   form.aliquota_ipi   || null,
      // fiscal serviço
      codigo_servico: form.codigo_servico || null,
      iss_retido:     form.iss_retido     || false,
      aliquota_iss:   form.aliquota_iss   || null,
      // logística
      peso_bruto:     form.peso_bruto     || null,
      peso_liquido:   form.peso_liquido   || null,
      altura:         form.altura         || null,
      largura:        form.largura        || null,
      comprimento:    form.comprimento    || null,
    }
    let error
    if (editing) ({ error } = await supabase.from('produtos').update(payload).eq('id', editing))
    else ({ error } = await supabase.from('produtos').insert(sanitize({...payload, entidade_id: entidadeAtiva?.id || null})))
    if (error) { toast(error.message,'error'); return }
    toast(editing ? 'Atualizado!' : 'Criado!', 'success')
    setModal(false); loadAll()
  }

  async function toggleAtivo(r) {
    await supabase.from('produtos').update({ ativo: !r.ativo }).eq('id', r.id)
    loadAll()
  }
  async function destroy() {
    const { pode, motivos } = await verificarExclusao('produtos', deleting)
    if (!pode) {
      toast(`Não é possível excluir: ${motivos.join('; ')}.`, 'error')
      setDeleting(null)
      return
    }
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
    else ({ error } = await supabase.from('produto_categorias').insert(sanitize({...formCat, entidade_id: entidadeAtiva?.id || null})))
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

          {/* Abas */}
          <div style={{ display:'flex', gap:4, marginBottom:16, borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
            {[
              { id:'geral',    label:'Geral' },
              { id:'fiscal',   label: form.tipo === 'servico' ? 'Fiscal (serviço)' : 'Fiscal (produto)' },
              { id:'logistica',label:'Logística' },
            ].map(ab => (
              <button key={ab.id} onClick={() => setAbaModal(ab.id)}
                style={{ padding:'7px 16px', fontSize:13, fontWeight: abaModal===ab.id ? 700 : 400,
                  borderBottom: abaModal===ab.id ? '2px solid var(--accent)' : '2px solid transparent',
                  color: abaModal===ab.id ? 'var(--accent)' : 'var(--text2)',
                  background:'transparent', border:'none', borderBottom: abaModal===ab.id ? '2px solid var(--accent)' : '2px solid transparent',
                  cursor:'pointer' }}>
                {ab.label}
              </button>
            ))}
          </div>

          {/* ── ABA GERAL ── */}
          {abaModal === 'geral' && (
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
                <label className="form-label">Código de Barras</label>
                <input className="form-input" value={form.codigo_barras||''} onChange={e => f('codigo_barras', e.target.value)} placeholder="EAN-13, Code128..." />
              </div>
              <div className="form-group">
                <label className="form-label">GTIN</label>
                <input className="form-input" value={form.gtin||''} onChange={e => f('gtin', e.target.value)} placeholder="Global Trade Item Number" />
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
                <div className="form-group">
                  <label className="form-label">Custo Médio</label>
                  <input className="form-input" type="number" step="0.01" value={form.custo_medio||''} readOnly
                    style={{ opacity:.7, cursor:'default' }} placeholder="Calculado automaticamente" />
                </div>
                <div className="form-group">
                  <label className="form-label">Última Venda</label>
                  <input className="form-input" type="date" value={form.ultima_venda||''} readOnly
                    style={{ opacity:.7, cursor:'default' }} />
                </div>
              </>}

              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Observações</label>
                <textarea className="form-textarea" rows={2} value={form.obs} onChange={e => f('obs', e.target.value)} />
              </div>
            </div>
          )}

          {/* ── ABA FISCAL (PRODUTO) ── */}
          {abaModal === 'fiscal' && form.tipo === 'produto' && (
            <div className="form-grid form-grid-2">
              <div style={{ gridColumn:'1/-1', background:'rgba(79,142,247,.08)', border:'1px solid rgba(79,142,247,.2)', borderRadius:8, padding:'8px 14px', fontSize:12, color:'var(--text2)', marginBottom:4 }}>
                ℹ️ Campos utilizados na emissão de NF-e. Preenchimento necessário para integração com API fiscal (Focus NFe, Nuvem Fiscal, etc).
              </div>

              <div className="form-group">
                <label className="form-label">NCM <span style={{ fontSize:10, color:'var(--text3)' }}>Nomenclatura Comum Mercosul</span></label>
                <input className="form-input" value={form.ncm||''} onChange={e => f('ncm', e.target.value)} placeholder="Ex: 8471.30.12" maxLength={10} />
              </div>
              <div className="form-group">
                <label className="form-label">CEST <span style={{ fontSize:10, color:'var(--text3)' }}>Subst. tributária</span></label>
                <input className="form-input" value={form.cest||''} onChange={e => f('cest', e.target.value)} placeholder="Ex: 21.029.00" maxLength={9} />
              </div>
              <div className="form-group">
                <label className="form-label">CFOP</label>
                <input className="form-input" value={form.cfop||''} onChange={e => f('cfop', e.target.value)} placeholder="Ex: 5102" maxLength={5} />
              </div>
              <div className="form-group">
                <label className="form-label">Origem</label>
                <select className="form-select" value={form.origem||'0'} onChange={e => f('origem', e.target.value)}>
                  <option value="0">0 — Nacional</option>
                  <option value="1">1 — Estrangeira (importação direta)</option>
                  <option value="2">2 — Estrangeira (adq. mercado interno)</option>
                  <option value="3">3 — Nacional com + 40% conteúdo importado</option>
                  <option value="4">4 — Nacional produção conforme processos básicos</option>
                  <option value="5">5 — Nacional com ≤ 40% conteúdo importado</option>
                  <option value="6">6 — Estrangeira (importação direta, sem similar)</option>
                  <option value="7">7 — Estrangeira (adq. interno, sem similar)</option>
                  <option value="8">8 — Nacional, mercadoria ou bem com Conteúdo de Importação superior a 70%</option>
                </select>
              </div>

              <div style={{ gridColumn:'1/-1', height:1, background:'var(--border)', margin:'4px 0' }} />
              <div style={{ gridColumn:'1/-1', fontSize:12, fontWeight:700, color:'var(--text2)' }}>ICMS</div>

              <div className="form-group">
                <label className="form-label">CST / CSOSN ICMS</label>
                <input className="form-input" value={form.cst_icms||''} onChange={e => f('cst_icms', e.target.value)} placeholder="Ex: 00, 40, 101, 400..." maxLength={4} />
              </div>
              <div className="form-group">
                <label className="form-label">Alíquota ICMS (%)</label>
                <input className="form-input" type="number" step="0.01" value={form.aliquota_icms||''} onChange={e => f('aliquota_icms', e.target.value)} placeholder="Ex: 12.00" />
              </div>

              <div style={{ gridColumn:'1/-1', height:1, background:'var(--border)', margin:'4px 0' }} />
              <div style={{ gridColumn:'1/-1', fontSize:12, fontWeight:700, color:'var(--text2)' }}>IPI</div>

              <div className="form-group">
                <label className="form-label">CST IPI</label>
                <input className="form-input" value={form.ipi_cst||''} onChange={e => f('ipi_cst', e.target.value)} placeholder="Ex: 50, 99..." maxLength={2} />
              </div>
              <div className="form-group">
                <label className="form-label">Alíquota IPI (%)</label>
                <input className="form-input" type="number" step="0.01" value={form.aliquota_ipi||''} onChange={e => f('aliquota_ipi', e.target.value)} placeholder="Ex: 5.00" />
              </div>

              <div style={{ gridColumn:'1/-1', height:1, background:'var(--border)', margin:'4px 0' }} />
              <div style={{ gridColumn:'1/-1', fontSize:12, fontWeight:700, color:'var(--text2)' }}>PIS / COFINS</div>

              <div className="form-group">
                <label className="form-label">CST PIS</label>
                <input className="form-input" value={form.cst_pis||''} onChange={e => f('cst_pis', e.target.value)} placeholder="Ex: 01, 07..." maxLength={2} />
              </div>
              <div className="form-group">
                <label className="form-label">Alíquota PIS (%)</label>
                <input className="form-input" type="number" step="0.01" value={form.aliquota_pis||''} onChange={e => f('aliquota_pis', e.target.value)} placeholder="Ex: 0.65" />
              </div>
              <div className="form-group">
                <label className="form-label">CST COFINS</label>
                <input className="form-input" value={form.cst_cofins||''} onChange={e => f('cst_cofins', e.target.value)} placeholder="Ex: 01, 07..." maxLength={2} />
              </div>
              <div className="form-group">
                <label className="form-label">Alíquota COFINS (%)</label>
                <input className="form-input" type="number" step="0.01" value={form.aliquota_cofins||''} onChange={e => f('aliquota_cofins', e.target.value)} placeholder="Ex: 3.00" />
              </div>
            </div>
          )}

          {/* ── ABA FISCAL (SERVIÇO) ── */}
          {abaModal === 'fiscal' && form.tipo === 'servico' && (
            <div className="form-grid form-grid-2">
              <div style={{ gridColumn:'1/-1', background:'rgba(79,142,247,.08)', border:'1px solid rgba(79,142,247,.2)', borderRadius:8, padding:'8px 14px', fontSize:12, color:'var(--text2)', marginBottom:4 }}>
                ℹ️ Campos utilizados na emissão de NFS-e (nota fiscal de serviço). Varia conforme município.
              </div>
              <div className="form-group">
                <label className="form-label">Código do Serviço <span style={{ fontSize:10, color:'var(--text3)' }}>LC 116/2003</span></label>
                <input className="form-input" value={form.codigo_servico||''} onChange={e => f('codigo_servico', e.target.value)} placeholder="Ex: 14.01" maxLength={10} />
              </div>
              <div className="form-group">
                <label className="form-label">Alíquota ISS (%)</label>
                <input className="form-input" type="number" step="0.01" value={form.aliquota_iss||''} onChange={e => f('aliquota_iss', e.target.value)} placeholder="Ex: 5.00" />
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', gap:10, paddingTop:8 }}>
                <input type="checkbox" id="iss_retido" checked={!!form.iss_retido} onChange={e => f('iss_retido', e.target.checked)} style={{ width:16, height:16 }} />
                <label htmlFor="iss_retido" className="form-label" style={{ margin:0, cursor:'pointer' }}>ISS retido na fonte</label>
              </div>
              <div style={{ gridColumn:'1/-1', height:1, background:'var(--border)', margin:'4px 0' }} />
              <div className="form-group">
                <label className="form-label">CFOP</label>
                <input className="form-input" value={form.cfop||''} onChange={e => f('cfop', e.target.value)} placeholder="Ex: 5933" maxLength={5} />
              </div>
              <div className="form-group">
                <label className="form-label">CST PIS</label>
                <input className="form-input" value={form.cst_pis||''} onChange={e => f('cst_pis', e.target.value)} placeholder="Ex: 07" maxLength={2} />
              </div>
              <div className="form-group">
                <label className="form-label">CST COFINS</label>
                <input className="form-input" value={form.cst_cofins||''} onChange={e => f('cst_cofins', e.target.value)} placeholder="Ex: 07" maxLength={2} />
              </div>
            </div>
          )}

          {/* ── ABA LOGÍSTICA ── */}
          {abaModal === 'logistica' && (
            <div className="form-grid form-grid-2">
              <div style={{ gridColumn:'1/-1', background:'rgba(79,142,247,.08)', border:'1px solid rgba(79,142,247,.2)', borderRadius:8, padding:'8px 14px', fontSize:12, color:'var(--text2)', marginBottom:4 }}>
                ℹ️ Campos utilizados em NF-e e cálculo de frete (Correios, transportadoras).
              </div>
              <div className="form-group">
                <label className="form-label">Peso Bruto (kg)</label>
                <input className="form-input" type="number" step="0.001" value={form.peso_bruto||''} onChange={e => f('peso_bruto', e.target.value)} placeholder="0.000" />
              </div>
              <div className="form-group">
                <label className="form-label">Peso Líquido (kg)</label>
                <input className="form-input" type="number" step="0.001" value={form.peso_liquido||''} onChange={e => f('peso_liquido', e.target.value)} placeholder="0.000" />
              </div>
              <div style={{ gridColumn:'1/-1', fontSize:12, fontWeight:700, color:'var(--text2)', marginTop:4 }}>Dimensões (cm)</div>
              <div className="form-group">
                <label className="form-label">Altura</label>
                <input className="form-input" type="number" step="0.1" value={form.altura||''} onChange={e => f('altura', e.target.value)} placeholder="0.0" />
              </div>
              <div className="form-group">
                <label className="form-label">Largura</label>
                <input className="form-input" type="number" step="0.1" value={form.largura||''} onChange={e => f('largura', e.target.value)} placeholder="0.0" />
              </div>
              <div className="form-group">
                <label className="form-label">Comprimento</label>
                <input className="form-input" type="number" step="0.1" value={form.comprimento||''} onChange={e => f('comprimento', e.target.value)} placeholder="0.0" />
              </div>
              {form.altura && form.largura && form.comprimento && (
                <div className="form-group" style={{ alignSelf:'flex-end' }}>
                  <div style={{ background:'var(--bg3)', borderRadius:8, padding:'8px 12px', fontSize:12 }}>
                    <div style={{ color:'var(--text3)', fontSize:10, marginBottom:2 }}>VOLUME</div>
                    <div style={{ fontWeight:800, fontFamily:'var(--mono)' }}>
                      {(Number(form.altura) * Number(form.largura) * Number(form.comprimento) / 1000000).toFixed(4)} m³
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

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
