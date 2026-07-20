import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useEntidade } from '../contexts/EntidadeContext'
import { mesReferencia, dataVencimento, verificarRotativo, rolarFaturaAnterior } from '../lib/faturas'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Search, Pencil, Trash2, Power, CreditCard, Receipt, ChevronLeft, ChevronRight, Lock, Clock, CheckCircle } from 'lucide-react'
import { today } from '../lib/utils.js'

const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const EMPTY_CARTAO = { nome: '', bandeira: '', titular_id: '', titular_nome: '', limite: '', dia_vencimento: '', dia_fechamento: '', obs: '', ativo: true, compartilhado: false }
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
  const [deletingGrupo, setDeletingGrupo]   = useState(null)
  const [confirmFechar, setConfirmFechar]    = useState(false)
  const [confirmReabrir, setConfirmReabrir]  = useState(false)
  const [rotativoInfo, setRotativoInfo]      = useState(null)   // { faturaAnterior, contaPagar, saldo } ou null
  const [modalRotativo, setModalRotativo]    = useState(false)
  const [jurosRotativo, setJurosRotativo]    = useState('')

  useEffect(() => { if (entidadeAtiva?.id) loadAll() }, [entidadeAtiva?.id])
  useEffect(() => { if (cartaoSel) loadLancamentos() }, [cartaoSel, mesRef])

  async function loadAll() {
    if (!entidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const [{ data: c }, { data: m }, { data: f }] = await Promise.all([
      supabase.from('cartoes').select('*').eq('entidade_id', entidadeAtiva?.id).order('nome'),
      supabase.from('pessoas').select('id,nome').eq('tipo','membro').eq('ativo',true).order('nome'),
      supabase.from('faturas_cartao').select('*').eq('entidade_id', entidadeAtiva?.id).order('mes_ref', { ascending: false }),
    ])
    setCartoes(c || [])
    setMembros(m || [])
    setFaturas(f || [])
    setLoading(false)
  }

  async function loadLancamentos() {
    if (!entidadeAtiva?.id) { setLoading(false); return }
    const [ano, mes] = mesRef.split('-')
    const ultimoDia = new Date(Number(ano), Number(mes), 0).getDate()
    const { data } = await supabase
      .from('cartao_lancamentos')
      .select('*')
      .eq('cartao_id', cartaoSel.id)
      .eq('entidade_id', entidadeAtiva?.id)
      .gte('data_compra', `${ano}-${mes}-01`)
      .lte('data_compra', `${ano}-${mes}-${ultimoDia}`)
      .order('data_compra', { ascending: false })
    setLancamentos(data || [])
  }

  // Status da fatura do mês selecionado
  const faturaAtual = faturas.find(f => f.cartao_id === cartaoSel?.id && f.mes_ref === mesRef)
  const faturaFechada = !!faturaAtual
  const totalFatura = lancamentos.reduce((s, r) => s + Number(r.valor_total || 0), 0)
  const percLimite = cartaoSel ? Math.min(100, (totalFatura / Number(cartaoSel.limite || 1)) * 100) : 0

  function mudaMes(delta) {
    const [ano, mes] = mesRef.split('-').map(Number)
    const d = new Date(ano, mes - 1 + delta, 1)
    setMesRef(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
  }

  const nomeMes = new Date(Number(mesRef.split('-')[0]), Number(mesRef.split('-')[1])-1, 1)
    .toLocaleString('pt-BR', { month: 'long', year: 'numeric' })

  // ── Reabrir fatura ─────────────────────────────────────────
  async function reabrirFatura() {
    if (!faturaAtual) return
    if (faturaAtual.status === 'rolada') {
      toast('Esta fatura já foi rolada para o mês seguinte — não pode ser reaberta. Reabra a fatura seguinte se precisar corrigir algo.', 'error')
      setConfirmReabrir(false)
      return
    }

    // Bloqueia reabertura se a conta a pagar da fatura tem pagamentos REAIS
    // (dinheiro que saiu do caixa — rolagem de rotativo não conta, pois é desfeita automaticamente)
    const { data: cpFatura } = await supabase
      .from('contas_pagar')
      .select('id')
      .eq('origem_id', faturaAtual.id)
      .eq('origem_tabela', 'faturas_cartao')
      .maybeSingle()
    if (cpFatura) {
      const { data: pgtos } = await supabase
        .from('pagamentos_parciais')
        .select('valor, forma_pgto')
        .eq('tabela_origem', 'contas_pagar')
        .eq('origem_id', cpFatura.id)
      const pagoReal = (pgtos || [])
        .filter(p => p.forma_pgto !== 'Rolagem para próxima fatura')
        .reduce((s, p) => s + Number(p.valor || 0), 0)
      if (pagoReal > 0) {
        toast(`Esta fatura tem R$ ${pagoReal.toFixed(2)} em pagamentos registrados no Caixa. Estorne os pagamentos antes de reabrir.`, 'error')
        setConfirmReabrir(false)
        return
      }
    }

    // Se esta fatura recebeu uma rolagem, desfaz a rolagem primeiro (evita violação de FK)
    if (Number(faturaAtual.saldo_rotativo_anterior || 0) > 0) {
      const { data: fatAnterior } = await supabase
        .from('faturas_cartao')
        .select('id')
        .eq('rolada_para_fatura_id', faturaAtual.id)
        .maybeSingle()

      if (fatAnterior) {
        // Remove o link e reseta o status da fatura anterior
        await supabase.from('faturas_cartao')
          .update({ rolada_para_fatura_id: null, status: 'fechada' })
          .eq('id', fatAnterior.id)

        // Reseta status da conta a pagar anterior para pendente
        const { data: cpAnterior } = await supabase
          .from('contas_pagar')
          .select('id')
          .eq('origem_id', fatAnterior.id)
          .eq('origem_tabela', 'faturas_cartao')
          .maybeSingle()
        if (cpAnterior) {
          await supabase.from('contas_pagar').update({ status: 'pendente' }).eq('id', cpAnterior.id)
          // Remove o pagamento parcial de rolagem da conta anterior
          await supabase.from('pagamentos_parciais')
            .delete()
            .eq('tabela_origem', 'contas_pagar')
            .eq('origem_id', cpAnterior.id)
            .eq('forma_pgto', 'Rolagem para próxima fatura')
        }
      }
    }

    // Remove a conta a pagar gerada por esta fatura
    await supabase.from('contas_pagar').delete().eq('origem_id', faturaAtual.id).eq('origem_tabela', 'faturas_cartao')
    // Remove a fatura
    const { error } = await supabase.from('faturas_cartao').delete().eq('id', faturaAtual.id)
    if (error) { toast(error.message, 'error'); return }
    toast('Fatura reaberta!', 'success')
    setConfirmReabrir(false)
    loadAll(); loadLancamentos()
  }

  // ── Verifica rotativo ANTES de abrir a confirmação de fechamento ──
  // Se houver fatura anterior vencida e não paga, pede o juros do rotativo
  // antes de prosseguir. Se não houver, mantém o fluxo de sempre.
  async function iniciarFechamento() {
    if (!totalFatura) return toast('Fatura sem lançamentos', 'info')
    if (faturaFechada) return toast('Fatura já fechada', 'info')

    const rotativo = await verificarRotativo(cartaoSel.id)
    if (rotativo) {
      setRotativoInfo(rotativo)
      setJurosRotativo('')
      setModalRotativo(true)
    } else {
      setRotativoInfo(null)
      setConfirmFechar(true)
    }
  }

  // ── Fechar fatura manualmente ─────────────────────────────
  // Se rotativoInfo estiver preenchido, incorpora o saldo anterior + juros
  // informado ao total da nova fatura, e encerra contabilmente a fatura antiga.
  async function fecharFatura() {
    const cartao = cartaoSel
    const venc = dataVencimento(mesRef, cartao.dia_vencimento)
    const [anoRef, mesNum] = mesRef.split('-')
    const nomeM = new Date(Number(anoRef), Number(mesNum)-1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })

    const saldoAnterior = rotativoInfo?.saldo || 0
    const juros = Number(jurosRotativo || 0)
    const totalComRotativo = totalFatura + saldoAnterior + juros

    // Cria registro de fatura fechada
    const { data: fat, error: e1 } = await supabase.from('faturas_cartao').insert({entidade_id: entidadeAtiva?.id || null, 
      cartao_id: cartao.id, cartao_nome: cartao.nome,
      mes_ref: mesRef, total: totalComRotativo,
      vencimento: venc, status: 'fechada',
      saldo_rotativo_anterior: saldoAnterior,
      juros_rotativo: juros,
    }).select().single()
    if (e1) { toast(e1.message, 'error'); return }

    // Se veio de rotativo, encerra contabilmente a fatura antiga e liga as duas
    if (rotativoInfo) {
      const { error: eRol } = await rolarFaturaAnterior(rotativoInfo, fat.id, entidadeAtiva?.id || null)
      if (eRol) { toast('Erro ao rolar fatura anterior: ' + eRol.message, 'error') }
    }

    const descricaoRotativo = rotativoInfo
      ? ` (inclui R$${saldoAnterior.toFixed(2)} não pago do mês anterior + R$${juros.toFixed(2)} de juros rotativo)`
      : ''

    // Gera UMA conta a pagar
    await supabase.from('contas_pagar').insert({entidade_id: entidadeAtiva?.id || null, 
      data_emissao: today(),
      descricao: `Fatura ${cartao.nome} — ${nomeM}${descricaoRotativo}`,
      valor: totalComRotativo, vencimento: venc,
      pago: false, categoria: 'Cartão de Crédito',
      origem_id: fat.id, origem_tabela: 'faturas_cartao', ativo: true,
    })

    toast(`✅ Fatura fechada! R$${totalComRotativo.toFixed(2)} gerado em Contas a Pagar`, 'success')
    setRotativoInfo(null); setJurosRotativo(''); setModalRotativo(false)
    loadAll(); loadLancamentos()
  }

  // ── Cartão CRUD ───────────────────────────────────────────
  function openNewCartao() { setFormCartao(EMPTY_CARTAO); setEditingCartao(null); setModalCartao(true) }
  function openEditCartao(c) { setFormCartao({...c}); setEditingCartao(c.id); setModalCartao(true) }

  async function saveCartao() {
    if (!formCartao.nome?.trim()) return toast('Nome obrigatório', 'error')
    let error
    if (editingCartao) ({ error } = await supabase.from('cartoes').update(formCartao).eq('id', editingCartao))
    else ({ error } = await supabase.from('cartoes').insert({entidade_id: entidadeAtiva?.id || null, ...formCartao}))
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
    if (!entidadeAtiva?.id) return toast('Selecione uma entidade antes de salvar', 'error')
    if (!formLanc.descricao?.trim()) return toast('Descrição obrigatória', 'error')
    if (!formLanc.valor) return toast('Valor obrigatório', 'error')
    if (faturaFechada) return toast('Fatura fechada — não é possível adicionar lançamentos', 'error')

    if (!editingLanc && formLanc.parcelado && Number(formLanc.num_parcelas) > 1) {
      const n = Number(formLanc.num_parcelas)
      const valorParcela = (Number(formLanc.valor) / n).toFixed(2)
      const inserts = []
      const grupoId = crypto.randomUUID()
      const base = new Date(formLanc.data + 'T12:00:00')
      const diaBase = base.getDate()
      for (let i = 0; i < n; i++) {
        // Calcula ano e mes da parcela
        const anoParc = base.getFullYear() + Math.floor((base.getMonth() + i) / 12)
        const mesParc = (base.getMonth() + i) % 12
        // Usa o ultimo dia do mes se o dia nao existir (ex: 30/fev → 28/fev)
        const ultimoDia = new Date(anoParc, mesParc + 1, 0).getDate()
        const diaParc = Math.min(diaBase, ultimoDia)
        const dataParc = new Date(anoParc, mesParc, diaParc)
        inserts.push({
          entidade_id: entidadeAtiva?.id || null,
          grupo_parcela: grupoId,
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

  async function destroyGrupo() {
    const { error } = await supabase.from('cartao_lancamentos')
      .delete().eq('grupo_parcela', deletingGrupo.grupo_parcela)
    if (error) { toast(error.message, 'error'); setDeletingGrupo(null); return }
    toast('Todas as parcelas removidas!', 'success')
    setDeletingGrupo(null); loadLancamentos()
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
              const faturaAberta = faturasCartao.find(f => f.status === 'fechada' && !f.pago && !f.rolada_para_fatura_id)
              return (
                <div key={c.id} className="card" style={{ opacity: c.ativo ? 1 : .5, cursor:'pointer', position:'relative', overflow:'hidden' }}
                  onClick={() => { setCartaoSel(c); setView('fatura'); setSearch('') }}>
                  <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:'linear-gradient(90deg, var(--accent), var(--accent2))' }} />
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:15, display:'flex', alignItems:'center', gap:6 }}>
                  {c.nome}
                  {c.compartilhado && <span className="badge badge-blue" style={{ fontSize:9 }}>Compartilhado</span>}
                  {c.compartilhado && c.entidade_id !== entidadeAtiva?.id && <span className="badge badge-gray" style={{ fontSize:9 }}>Outra entidade</span>}
                </div>
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
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                <input type="checkbox" checked={formCartao.compartilhado || false}
                  onChange={e => fc('compartilhado', e.target.checked)}
                  style={{ width:15, height:15 }} />
                Cartão compartilhado entre entidades
              </label>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:4, paddingLeft:23 }}>
                Quando marcado, este cartão aparece em todas as entidades que você tem acesso
              </div>
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
        {faturaAtual?.status === 'rolada'
          ? <span className="badge badge-purple" style={{ display:'flex', alignItems:'center', gap:4 }}>🔁 Rolada para fatura seguinte</span>
          : faturaFechada
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
          <button className="btn btn-sm" style={{ background:'var(--red)', color:'#fff' }} onClick={iniciarFechamento}>
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
          <button className="btn btn-sm btn-secondary" onClick={() => setConfirmReabrir(true)}>
            Reabrir fatura
          </button>
        )}
        {faturaFechada && (
          <div style={{ marginTop:10, fontSize:12, color:'var(--red)', display:'flex', alignItems:'center', gap:6 }}>
            <Lock size={12} />
            Fatura fechada em {faturaAtual?.vencimento?.split('-').reverse().join('/')} · Gerado em Contas a Pagar automaticamente
          </div>
        )}
        {faturaFechada && Number(faturaAtual?.saldo_rotativo_anterior) > 0 && (
          <div style={{ marginTop:8, fontSize:12, color:'var(--accent2)', background:'rgba(124,106,247,.1)', border:'1px solid rgba(124,106,247,.3)', borderRadius:8, padding:'8px 12px' }}>
            🔁 Esta fatura inclui <strong>{fmt(faturaAtual.saldo_rotativo_anterior)}</strong> não pago do mês anterior
            {Number(faturaAtual?.juros_rotativo) > 0 && <> + <strong>{fmt(faturaAtual.juros_rotativo)}</strong> de juros do rotativo</>}
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
                            {r.total_parcelas > 1 && r.grupo_parcela && (
                              <button className="icon-btn del" title={`Excluir todas as ${r.total_parcelas} parcelas`} onClick={() => setDeletingGrupo(r)}>
                                <Trash2 size={13} /><span style={{ fontSize: 9, marginLeft: 2 }}>{r.total_parcelas}x</span>
                              </button>
                            )}
                            <button className="icon-btn del" title="Excluir esta parcela" onClick={() => setDeletingLanc(r)}><Trash2 size={14} /></button>
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
      {confirmFechar && (
        <ConfirmDialog
          message={`Fechar a fatura de ${cartaoSel?.nome} — ${mesRef}?\n\nValor: R$ ${totalFatura.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n\nIsso irá gerar uma conta a pagar. Você poderá reabrir depois se precisar.`}
          confirmLabel="Fechar fatura"
          confirmStyle="danger"
          onConfirm={() => { setConfirmFechar(false); fecharFatura() }}
          onCancel={() => setConfirmFechar(false)} />
      )}
      {modalRotativo && rotativoInfo && (
        <Modal
          title="⚠️ Fatura anterior não foi paga — rotativo"
          onClose={() => { setModalRotativo(false); setRotativoInfo(null); setJurosRotativo('') }}
          onSave={() => { setModalRotativo(false); fecharFatura() }}
        >
          <div style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.25)', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13, color:'var(--red)', lineHeight:1.5 }}>
            A fatura de <strong>{rotativoInfo.faturaAnterior.mes_ref}</strong> venceu em{' '}
            {rotativoInfo.faturaAnterior.vencimento?.split('-').reverse().join('/')} e ainda tem saldo de{' '}
            <strong>{fmt(rotativoInfo.saldo)}</strong> não pago.
          </div>
          <p style={{ fontSize:13, color:'var(--text2)', marginBottom:14 }}>
            Isso é o <strong>rotativo do cartão</strong> — a operadora vai incorporar esse saldo na fatura
            deste mês, junto com juros. Informe abaixo o valor do juros cobrado (aparece no extrato/app do banco):
          </p>
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Saldo não pago (mês anterior)</label>
              <input className="form-input" value={fmt(rotativoInfo.saldo)} disabled />
            </div>
            <div className="form-group">
              <label className="form-label">Juros do rotativo (R$) *</label>
              <input className="form-input" type="number" step="0.01" autoFocus
                value={jurosRotativo} onChange={e => setJurosRotativo(e.target.value)} placeholder="0,00" />
            </div>
          </div>
          <div style={{ marginTop:14, background:'rgba(124,106,247,.1)', border:'1px solid rgba(124,106,247,.3)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'var(--accent2)' }}>
            Total da nova fatura: compras do mês (<strong>{fmt(totalFatura)}</strong>) + saldo anterior (<strong>{fmt(rotativoInfo.saldo)}</strong>)
            {' '}+ juros (<strong>{fmt(Number(jurosRotativo || 0))}</strong>) = <strong>{fmt(totalFatura + rotativoInfo.saldo + Number(jurosRotativo || 0))}</strong>
          </div>
        </Modal>
      )}
      {confirmReabrir && (
        <ConfirmDialog
          message={`Reabrir a fatura de ${cartaoSel?.nome} — ${mesRef}?\n\nIsso irá remover a conta a pagar gerada. Os lançamentos do cartão serão mantidos.`}
          confirmLabel="Reabrir"
          confirmStyle="primary"
          onConfirm={reabrirFatura}
          onCancel={() => setConfirmReabrir(false)} />
      )}
      {deletingGrupo && (
        <ConfirmDialog
          message={`Excluir TODAS as ${deletingGrupo.total_parcelas} parcelas desta compra? Essa ação não pode ser desfeita.`}
          confirmLabel="Excluir todas"
          onConfirm={destroyGrupo}
          onCancel={() => setDeletingGrupo(null)} />
      )}
      {deletingLanc && <ConfirmDialog message={`Excluir "${deletingLanc.descricao}"?`} onConfirm={destroyLanc} onCancel={() => setDeletingLanc(null)} />}
    </div>
  )
}
