import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useEntidade } from '../contexts/EntidadeContext'
import { mesReferencia, dataVencimento } from '../lib/faturas'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Search, Pencil, Trash2, Power, CreditCard, Receipt, ChevronLeft, ChevronRight, Lock, Clock, CheckCircle } from 'lucide-react'
import { today } from '../lib/utils.js'

const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const EMPTY_CARTAO = { nome: '', bandeira: '', titular_id: '', titular_nome: '', limite: '', dia_vencimento: '', dia_fechamento: '', obs: '', ativo: true }
const EMPTY_LANC   = { data: today(), descricao: '', categoria: '', valor: '', parcelado: false, num_parcelas: 2, obs: '' }
const bandeiras    = ['Visa','Mastercard','Elo','American Express','Hipercard','Outro']

export default function Cartoes() {
  const toast = useToast()
  const { entidadeAtiva } = useEntidade()
  const [view, setView] = useState('cartoes')
  const [cartoes, setCartoes] = useState([])
  const [membros, setMembros] = useState([])
  const [lancamentos, setLancamentos] = useState([])
  const [faturas, setFaturas] = useState([])
  const [loading, setLoading] = useState(true)
  const [cartaoSel, setCartaoSel] = useState(null)
  const [mesRef, setMesRef] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  })
  const [search, setSearch] = useState('')
  const [modalCartao, setModalCartao] = useState(false)
  const [modalLanc, setModalLanc]     = useState(false)
  const [formCartao, setFormCartao]   = useState(EMPTY_CARTAO)
  const [formLanc, setFormLanc]       = useState(EMPTY_LANC)
  const [editingCartao, setEditingCartao] = useState(null)
  const [editingLanc, setEditingLanc]     = useState(null)
  const [deletingCartao, setDeletingCartao] = useState(null)
  const [deletingLanc, setDeletingLanc]     = useState(null)

  useEffect(() => { if (entidadeAtiva?.id) loadAll() }, [entidadeAtiva?.id])
  useEffect(() => { if (cartaoSel) loadLancamentos() }, [cartaoSel, mesRef])

  async function loadAll() {
    setLoading(true)
    const [{ data: c }, { data: m }, { data: f }] = await Promise.all([
      supabase.from('cartoes').select('*').order('nome'),
      supabase.from('pessoas').select('id,nome').eq('tipo','membro').eq('ativo',true).order('nome'),
      supabase.from('faturas_cartao').select('*').order('mes_ref', { ascending: false }),
    ])
    setCartoes(c || [])
    setMembros(m || [])
    setFaturas(f || [])
    setLoading(false)
  }

  async function loadLancamentos() {
    const [ano, mes] = mesRef.split('-')
    const ultimoDia = new Date(Number(ano), Number(mes), 0).getDate()
    const { data } = await supabase
      .from('cartao_lancamentos')
      .select('*')
      .eq('cartao_id', cartaoSel.id)
      .gte('data_compra', `${ano}-${mes}-01`)
      .lte('data_compra', `${ano}-${mes}-${ultimoDia}`)
      .order('data_compra', { ascending: false })
    setLancamentos(data || [])
  }

  // Status da fatura do mês selecionado
  const faturaAtual = faturas.find(f => f.cartao_id === cartaoSel?.id && f.mes_ref === mesRef)
  const faturaFechada = !!faturaAtual
  const totalFatura = lancamentos.reduce((s, r) => s + Number(r.valor_total || 0), 0)
  const percLimite = cartaoSel ? Math.min(100, (totalFatura / Number(cartaoSel.limite || 1)
        .eq('entidade_id', entidadeAtiva?.id)
        .eq('entidade_id', entidadeAtiva?.id)
        .eq('entidade_id', entidadeAtiva?.id)) * 100) : 0

  function mudaMes(delta) {
    const [ano, mes] = mesRef.split('-').map(Number)
    const d = new Date(ano, mes - 1 + delta, 1)
    setMesRef(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
  }

  const nomeMes = new Date(Number(mesRef.split('-')[0]), Number(mesRef.split('-')[1])-1, 1)
    .toLocaleString('pt-BR', { month: 'long', year: 'numeric' })

  // ── Fechar fatura manualmente ─────────────────────────────
  async function fecharFatura() {
    if (!totalFatura) return toast('Fatura sem lançamentos', 'info')
    if (faturaFechada) return toast('Fatura já fechada', 'info')

    const cartao = cartaoSel
    const venc = dataVencimento(mesRef, cartao.dia_vencimento)
    const [anoRef, mesNum] = mesRef.split('-')
    const nomeM = new Date(Number(anoRef), Number(mesNum)-1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })

    // Cria registro de fatura fechada
    const { data: fat, error: e1 } = await supabase.from('faturas_cartao').insert({entidade_id: entidadeAtiva?.id, 
      cartao_id: cartao.id, cartao_nome: cartao.nome,
      mes_ref: mesRef, total: totalFatura,
      vencimento: venc, status: 'fechada',
    }).select().single()
    if (e1) { toast(e1.message, 'error'); return }

    // Gera UMA conta a pagar
    await supabase.from('contas_pagar').insert({entidade_id: entidadeAtiva?.id, 
      data_emissao: today(),
      descricao: `Fatura ${cartao.nome} — ${nomeM}`,
      valor: totalFatura, vencimento: venc,
      pago: false, categoria: 'Cartão de Crédito',
      origem_id: fat.id, origem_tabela: 'faturas_cartao', ativo: true,
    })

    toast(`✅ Fatura fechada! R$${totalFatura.toFixed(2)} gerado em Contas a Pagar`, 'success')
    loadAll(); loadLancamentos()
  }

  // ── Cartão CRUD ───────────────────────────────────────────
  function openNewCartao() { setFormCartao(EMPTY_CARTAO); setEditingCartao(null); setModalCartao(true) }
  function openEditCartao(c) { setFormCartao({...c}); setEditingCartao(c.id); setModalCartao(true) }

  async function saveCartao() {
    if (!formCartao.nome?.trim()) return toast('Nome obrigatório', 'error')
    let error
    if (editingCartao) ({ error } = await supabase.from('cartoes').update(formCartao).eq('id', editingCartao))
    else ({ error } = await supabase.from('cartoes').insert(formCartao))
    if (error) { toast(error.message, 'error'); return }
    toast('Cartão salvo!', 'success'); setModalCartao(false); loadAll()
  }

  async function toggleCartao(c) {
    await supabase.from('cartoes').update({ ativo: !c.ativo }).eq('id', c.id); loadAll()
  }

  async function destroyCartao() {
    await supabase.from('cartoes').delete().eq('id', deletingCartao.id)
    toast('Excluído', 'success'); setDeletingCartao(null); loadAll()
    if (cartaoSel?.id === deletingCartao.id) { setCartaoSel(null); setView('cartoes') }
  }

  // ── Lançamento CRUD ───────────────────────────────────────
  function openNewLanc() { setFormLanc(EMPTY_LANC); setEditingLanc(null); setModalLanc(true) }
  function openEditLanc(l) { setFormLanc({...l, parcelado: false, num_parcelas: 2}); setEditingLanc(l.id); setModalLanc(true) }

  async function saveLanc() {
    if (!formLanc.descricao?.trim()) return toast('Descrição obrigatória', 'error')
    if (!formLanc.valor) return toast('Valor obrigatório', 'error')
    if (faturaFechada) return toast('Fatura fechada — não é possível adicionar lançamentos', 'error')

    if (!editingLanc && formLanc.parcelado && Number(formLanc.num_parcelas) > 1) {
      const n = Number(formLanc.num_parcelas)
      const valorParcela = (Number(formLanc.valor) / n).toFixed(2)
      const inserts = []
      for (let i = 0; i < n; i++) {
        const base = new Date(formLanc.data + 'T12:00:00')
        const dataParc = new Date(base.getFullYear(), base.getMonth() + i, base.getDate())
        inserts.push({
          cartao_id: cartaoSel.id,
          data_compra: dataParc.toISOString().split('T')[0],
          descricao: `${formLanc.descricao} (${i+1}/${n})`,
          categoria: formLanc.categoria,
          valor_total: valorParcela,
          num_parcela: i+1, total_parcelas: n,
          obs: formLanc.obs,
        })
      }
      const { error } = await supabase.from('cartao_lancamentos').insert(inserts)
      if (error) { toast(error.message, 'error'); return }
      toast(`${n} parcelas lançadas! A fatura será gerada automaticamente no fechamento.`, 'success')
      setModalLanc(false); loadLancamentos(); return
    }

    const payload = {
      cartao_id: cartaoSel.id,
      data_compra: formLanc.data,
      descricao: formLanc.descricao,
      categoria: formLanc.categoria,
      valor_total: formLanc.valor,
      num_parcela: 1, total_parcelas: 1,
      obs: formLanc.obs,
    }
    let error
    if (editingLanc) ({ error } = await supabase.from('cartao_lancamentos').update(payload).eq('id', editingLanc))
    else ({ error } = await supabase.from('cartao_lancamentos').insert(payload))
    if (error) { toast(error.message, 'error'); return }
    toast('Lançado! A fatura será gerada no fechamento.', 'success')
    setModalLanc(false); loadLancamentos()
  }

  async function destroyLanc() {
    await supabase.from('cartao_lancamentos').delete().eq('id', deletingLanc.id)
    toast('Lançamento excluído', 'success'); setDeletingLanc(null); loadLancamentos()
  }

  const fc = (k, v) => setFormCartao(p => ({...p, [k]: v}))
  const fl = (k, v) => setFormLanc(p => ({...p, [k]: v}))
  const filteredLanc = lancamentos.filter(r => {
    const q = search.toLowerCase()
    return !q || r.descricao?.toLowerCase().includes(q) || r.categoria?.toLowerCase().includes(q)
  })

  // ── VIEW: Lista de cartões ────────────────────────────────
  if (view === 'cartoes') return (
    <div>
      <div className="toolbar">
        <div className="search-wrap">
          <Search size={14} />
          <input className="search-input" placeholder="Buscar cartão..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={openNewCartao}><Plus size={15} /> Novo Cartão</button>
      </div>

      {loading ? <div className="loading"><div className="spinner" /></div> :
        cartoes.length === 0 ? <div className="empty-state"><CreditCard size={40} /><p>Nenhum cartão cadastrado</p></div> : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
            {cartoes.filter(c => !search || c.nome.toLowerCase().includes(search.toLowerCase())).map(c => {
              const faturasCartao = faturas.filter(f => f.cartao_id === c.id)
              const faturaAberta = faturasCartao.find(f => f.status === 'fechada' && !f.pago)
              return (
                <div key={c.id} className="card" style={{ opacity: c.ativo ? 1 : .5, cursor:'pointer', position:'relative', overflow:'hidden' }}
                  onClick={() => { setCartaoSel(c); setView('fatura'); setSearch('') }}>
                  <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:'linear-gradient(90deg, var(--accent), var(--accent2))' }} />
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:15 }}>{c.nome}</div>
                      <div style={{ color:'var(--text2)', fontSize:12, marginTop:2 }}>{c.bandeira} · {c.titular_nome || '—'}</div>
                    </div>
                    <CreditCard size={24} color="var(--accent)" />
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text2)', marginBottom:8 }}>
                    <span>Fecha dia <strong style={{ color:'var(--text)' }}>{c.dia_fechamento || '—'}</strong></span>
                    <span>Vence dia <strong style={{ color:'var(--text)' }}>{c.dia_vencimento || '—'}</strong></span>
                    <span>Limite <strong style={{ color:'var(--green)' }}>{fmt(c.limite)}</strong></span>
                  </div>
                  {faturaAberta && (
                    <div style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.2)', borderRadius:6, padding:'6px 10px', fontSize:12, color:'var(--red)', marginTop:8 }}>
                      Fatura fechada: <strong>{fmt(faturaAberta.total)}</strong> · vence {faturaAberta.vencimento?.split('-').reverse().join('/')}
                    </div>
                  )}
                  <div style={{ display:'flex', gap:6, marginTop:12 }} onClick={e => e.stopPropagation()}>
                    <button className="btn btn-sm btn-secondary" onClick={() => openEditCartao(c)}><Pencil size={12} /></button>
                    <button className="btn btn-sm btn-secondary" onClick={() => toggleCartao(c)}><Power size={12} /></button>
                    <button className="btn btn-sm btn-danger" onClick={() => setDeletingCartao(c)}><Trash2 size={12} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      {modalCartao && (
        <Modal title={editingCartao ? 'Editar Cartão' : 'Novo Cartão'} onClose={() => setModalCartao(false)} onSave={saveCartao}>
          <div className="form-grid form-grid-2">
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Nome do Cartão *</label>
              <input className="form-input" value={formCartao.nome} onChange={e => fc('nome', e.target.value)} placeholder="Ex: Nubank, Itaú Visa..." />
            </div>
            <div className="form-group">
              <label className="form-label">Bandeira</label>
              <select className="form-select" value={formCartao.bandeira} onChange={e => fc('bandeira', e.target.value)}>
                <option value="">Selecionar...</option>
                {bandeiras.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Titular</label>
              <select className="form-select" value={formCartao.titular_id} onChange={e => {
                const m = membros.find(x => x.id === e.target.value)
                fc('titular_id', e.target.value); fc('titular_nome', m?.nome || '')
              }}>
                <option value="">Selecionar membro...</option>
                {membros.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Limite (R$)</label>
              <input className="form-input" type="number" step="0.01" value={formCartao.limite} onChange={e => fc('limite', e.target.value)} placeholder="0,00" />
            </div>
            <div className="form-group">
              <label className="form-label">Dia de Fechamento</label>
              <input className="form-input" type="number" min={1} max={31} value={formCartao.dia_fechamento} onChange={e => fc('dia_fechamento', e.target.value)} placeholder="Ex: 25" />
            </div>
            <div className="form-group">
              <label className="form-label">Dia de Vencimento</label>
              <input className="form-input" type="number" min={1} max={31} value={formCartao.dia_vencimento} onChange={e => fc('dia_vencimento', e.target.value)} placeholder="Ex: 5" />
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Observações</label>
              <textarea className="form-textarea" value={formCartao.obs} onChange={e => fc('obs', e.target.value)} rows={2} />
            </div>
          </div>
        </Modal>
      )}
      {deletingCartao && <ConfirmDialog message={`Excluir cartão "${deletingCartao.nome}"?`} onConfirm={destroyCartao} onCancel={() => setDeletingCartao(null)} />}
    </div>
  )

  // ── VIEW: Fatura do cartão ────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => { setView('cartoes'); setSearch('') }}>
          <ChevronLeft size={14} /> Voltar
        </button>
        <CreditCard size={18} color="var(--accent)" />
        <span style={{ fontWeight:700, fontSize:16 }}>{cartaoSel?.nome}</span>
        <span className="badge badge-gray">{cartaoSel?.bandeira}</span>
        <span className="text-muted" style={{ fontSize:12 }}>Titular: {cartaoSel?.titular_nome || '—'}</span>
        {faturaFechada
          ? <span className="badge badge-red" style={{ display:'flex', alignItems:'center', gap:4 }}><Lock size={11} /> Fatura Fechada</span>
          : <span className="badge badge-yellow" style={{ display:'flex', alignItems:'center', gap:4 }}><Clock size={11} /> Fatura Aberta</span>
        }
        <div style={{ flex:1 }} />
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button className="btn btn-secondary btn-sm btn-icon" onClick={() => mudaMes(-1)}><ChevronLeft size={14} /></button>
          <span style={{ fontSize:13, fontWeight:600, textTransform:'capitalize', minWidth:140, textAlign:'center' }}>{nomeMes}</span>
          <button className="btn btn-secondary btn-sm btn-icon" onClick={() => mudaMes(1)}><ChevronRight size={14} /></button>
        </div>
        {!faturaFechada && totalFatura > 0 && (
          <button className="btn btn-sm" style={{ background:'var(--red)', color:'#fff' }} onClick={fecharFatura}>
            <Lock size={14} /> Fechar Fatura
          </button>
        )}
        {!faturaFechada && (
          <button className="btn btn-primary btn-sm" onClick={openNewLanc}><Plus size={14} /> Lançamento</button>
        )}
      </div>

      {/* Cards resumo */}
      <div className="stats-grid" style={{ gridTemplateColumns:'repeat(3,1fr)', marginBottom:16 }}>
        <div className="stat-card red">
          <div className="stat-label">Total da Fatura</div>
          <div className="stat-value red text-mono">{fmt(totalFatura)}</div>
          <div className="stat-sub">{lancamentos.length} lançamentos</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Limite Disponível</div>
          <div className="stat-value blue text-mono">{fmt(Number(cartaoSel?.limite || 0) - totalFatura)}</div>
        </div>
        <div className="stat-card yellow">
          <div className="stat-label">Vence dia {cartaoSel?.dia_vencimento}</div>
          <div className="stat-value yellow text-mono">{fmt(cartaoSel?.limite || 0)}</div>
          <div className="stat-sub">Limite total</div>
        </div>
      </div>

      {/* Barra de limite */}
      <div className="card" style={{ marginBottom:16, padding:'14px 20px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text2)', marginBottom:6 }}>
          <span>Uso do limite — Fecha dia {cartaoSel?.dia_fechamento}</span>
          <span>{percLimite.toFixed(1)}%</span>
        </div>
        <div style={{ background:'var(--bg3)', borderRadius:4, height:8, overflow:'hidden' }}>
          <div style={{ height:'100%', borderRadius:4, width:`${percLimite}%`, background: percLimite > 80 ? 'var(--red)' : percLimite > 50 ? 'var(--yellow)' : 'var(--green)', transition:'width .3s' }} />
        </div>
        {faturaFechada && (
          <div style={{ marginTop:10, fontSize:12, color:'var(--red)', display:'flex', alignItems:'center', gap:6 }}>
            <Lock size={12} />
            Fatura fechada em {faturaAtual?.vencimento?.split('-').reverse().join('/')} · Gerado em Contas a Pagar automaticamente
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-wrap">
          <Search size={14} />
          <input className="search-input" placeholder="Buscar lançamento..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Tabela */}
      <div className="card">
        {filteredLanc.length === 0
          ? <div className="empty-state"><Receipt size={36} /><p>Nenhum lançamento neste mês</p></div>
          : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Parcela</th><th>Valor</th><th>Ações</th></tr></thead>
                <tbody>
                  {filteredLanc.map(r => (
                    <tr key={r.id}>
                      <td className="text-mono text-muted" style={{ fontSize:12 }}>{r.data_compra?.split('-').reverse().join('/')}</td>
                      <td className="font-bold">{r.descricao}</td>
                      <td className="text-muted">{r.categoria || '—'}</td>
                      <td>{r.total_parcelas > 1 ? <span className="badge badge-purple">{r.num_parcela}/{r.total_parcelas}</span> : '—'}</td>
                      <td className="text-mono font-bold text-red">{fmt(r.valor_total)}</td>
                      <td>
                        {!faturaFechada && (
                          <div className="action-btns">
                            <button className="icon-btn edit" onClick={() => openEditLanc(r)}><Pencil size={14} /></button>
                            <button className="icon-btn del" onClick={() => setDeletingLanc(r)}><Trash2 size={14} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ borderTop:'2px solid var(--border)' }}>
                    <td colSpan={4} style={{ textAlign:'right', fontWeight:700, padding:'12px 14px', color:'var(--text2)', fontSize:12 }}>TOTAL:</td>
                    <td className="text-mono font-bold text-red" style={{ padding:'12px 14px' }}>{fmt(totalFatura)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* Modal lançamento */}
      {modalLanc && (
        <Modal title={editingLanc ? 'Editar Lançamento' : 'Novo Lançamento'} onClose={() => setModalLanc(false)} onSave={saveLanc}>
          <div style={{ background:'rgba(79,142,247,.08)', border:'1px solid rgba(79,142,247,.2)', borderRadius:8, padding:'8px 12px', marginBottom:16, fontSize:12, color:'var(--accent)' }}>
            ℹ️ A Conta a Pagar será gerada automaticamente quando a fatura fechar no dia <strong>{cartaoSel?.dia_fechamento}</strong>.
          </div>
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Data da Compra *</label>
              <input className="form-input" type="date" value={formLanc.data} onChange={e => fl('data', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Valor *</label>
              <input className="form-input" type="number" step="0.01" value={formLanc.valor} onChange={e => fl('valor', e.target.value)} placeholder="0,00" />
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Descrição *</label>
              <input className="form-input" value={formLanc.descricao} onChange={e => fl('descricao', e.target.value)} placeholder="O que foi comprado" />
            </div>
            <div className="form-group">
              <label className="form-label">Categoria</label>
              <input className="form-input" value={formLanc.categoria} onChange={e => fl('categoria', e.target.value)} placeholder="Ex: Alimentação, Lazer..." />
            </div>
            {!editingLanc && (
              <div className="form-group" style={{ display:'flex', flexDirection:'row', alignItems:'center', gap:10, paddingTop:20 }}>
                <input type="checkbox" id="parc" checked={formLanc.parcelado} onChange={e => fl('parcelado', e.target.checked)} style={{ width:16, height:16 }} />
                <label htmlFor="parc" className="form-label" style={{ margin:0, cursor:'pointer' }}>Parcelar</label>
              </div>
            )}
            {!editingLanc && formLanc.parcelado && (
              <div className="form-group">
                <label className="form-label">Nº de Parcelas</label>
                <input className="form-input" type="number" min={2} max={48} value={formLanc.num_parcelas} onChange={e => fl('num_parcelas', e.target.value)} />
              </div>
            )}
            {!editingLanc && formLanc.parcelado && (
              <div style={{ gridColumn:'1/-1', background:'rgba(124,106,247,.1)', border:'1px solid rgba(124,106,247,.3)', borderRadius:8, padding:'10px 14px', fontSize:12, color:'var(--accent2)' }}>
                {formLanc.num_parcelas}x de <strong>{fmt(Number(formLanc.valor||0)/Number(formLanc.num_parcelas))}</strong> — cada parcela cai na fatura do mês correspondente.
              </div>
            )}
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Observações</label>
              <textarea className="form-textarea" value={formLanc.obs} onChange={e => fl('obs', e.target.value)} rows={2} />
            </div>
          </div>
        </Modal>
      )}
      {deletingLanc && <ConfirmDialog message={`Excluir "${deletingLanc.descricao}"?`} onConfirm={destroyLanc} onCancel={() => setDeletingLanc(null)} />}
    </div>
  )
}
