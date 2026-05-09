import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useEntidade } from '../contexts/EntidadeContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  Plus, Search, Pencil, Trash2, Power, ChevronLeft,
  FileText, Package, Wrench, CheckCircle, Clock,
  AlertCircle, XCircle, DollarSign, Eye, Printer
} from 'lucide-react'
import { bloquear, verificarExclusao } from '../lib/integridade'
import { today, fmtDate } from '../lib/utils.js'

const fmt = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})

const STATUS = [
  { id:'orcamento',   label:'Orçamento',       cls:'os-orcamento',  icon:'📋' },
  { id:'andamento',   label:'Em andamento',     cls:'os-andamento',  icon:'🔧' },
  { id:'aguardando',  label:'Aguard. peças',    cls:'os-aguardando', icon:'⏳' },
  { id:'finalizado',  label:'Finalizado',       cls:'os-finalizado', icon:'✅' },
  { id:'recebido',    label:'Recebido',         cls:'os-recebido',   icon:'💰' },
  { id:'cancelado',   label:'Cancelado',        cls:'os-cancelado',  icon:'❌' },
]

const EMPTY_OS = {
  numero:'', empresa_id:'', empresa_nome:'',
  cliente_id:'', cliente_nome:'', cliente_telefone:'', cliente_email:'', cliente_endereco:'',
  equipamento:'', local_servico:'', prazo:'', status:'orcamento', obs:'', ativo:true
}
const EMPTY_ITEM = { descricao:'', quantidade:1, valor_unit:0, pago:false, obs:'' }

export default function OrdemServico() {
  const { user } = useAuth()
  const toast = useToast()
  const { entidadeAtiva } = useEntidade()
  const [view, setView] = useState('lista') // lista | detalhe
  const [os, setOs] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [osSel, setOsSel] = useState(null)
  const [itens, setItens] = useState([])
  const [produtos, setProdutos] = useState([])
  const [empresas, setEmpresas] = useState([])
  const [modalOs, setModalOs] = useState(false)
  const [modalItem, setModalItem] = useState(null) // null | 'peca' | 'servico'
  const [editingOs, setEditingOs] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [deletingOs, setDeletingOs] = useState(null)
  const [deletingItem, setDeletingItem] = useState(null)
  const [formOs, setFormOs] = useState(EMPTY_OS)
  const [formItem, setFormItem] = useState(EMPTY_ITEM)
  const [confirmReceberOs, setConfirmReceberOs] = useState(null)

  useEffect(() => { if (entidadeAtiva?.id) loadAll() }, [entidadeAtiva?.id])
  useEffect(() => { if (osSel) loadItens(osSel.id) }, [osSel])

  async function loadAll() {
    if (!entidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const [{ data: o }, { data: c }, { data: p }, { data: emp }] = await Promise.all([
      supabase.from('ordens_servico').select('*').eq('entidade_id', entidadeAtiva?.id).order('created_at', { ascending: false }),
      supabase.from('pessoas').select('id,nome,telefone,email,endereco').in('tipo',['cliente','ambos']).eq('ativo',true).eq('entidade_id', entidadeAtiva?.id).order('nome'),
      supabase.from('produtos').select('id,nome,tipo,preco_venda').eq('ativo',true).eq('entidade_id', entidadeAtiva?.id).order('nome'),
      supabase.from('empresa').select('id,nome,nome_fantasia').eq('ativo',true).order('nome'),
    ])
    setOs(o || [])
    setClientes(c || [])
    setProdutos(p || [])
    setEmpresas(emp || [])
    setLoading(false)
  }

  async function loadItens(osId) {
    const { data } = await supabase.from('os_itens').select('*').eq('os_id', osId).order('created_at')
    setItens(data || [])
  }

  // Totais
  const totalPecas     = itens.filter(i => i.tipo==='peca').reduce((s,i) => s + Number(i.quantidade)*Number(i.valor_unit), 0)
  const totalServicos  = itens.filter(i => i.tipo==='servico').reduce((s,i) => s + Number(i.quantidade)*Number(i.valor_unit), 0)
  const totalOs        = totalPecas + totalServicos
  const totalPago      = itens.filter(i => i.pago).reduce((s,i) => s + Number(i.quantidade)*Number(i.valor_unit), 0)
  const totalPendente  = totalOs - totalPago

  // ── OS CRUD ───────────────────────────────────────────
  async function proximoNumero() {
    const { data } = await supabase.from('ordens_servico').select('numero').order('created_at', { ascending: false }).limit(1)
    if (!data?.length) return 'OS-001'
    const last = data[0].numero?.replace('OS-','')
    const n = (parseInt(last || '0') + 1)
    return 'OS-' + String(n).padStart(3,'0')
  }

  async function openNewOs() {
    const num = await proximoNumero()
    setFormOs({ ...EMPTY_OS, numero: num })
    setEditingOs(null); setModalOs(true)
  }

  function openEditOs(o) { setFormOs({...o}); setEditingOs(o.id); setModalOs(true) }

  async function saveOs() {
    if (!formOs.cliente_id) return toast('Selecione o cliente', 'error')
    if (!formOs.equipamento?.trim()) return toast('Informe o equipamento/serviço', 'error')
    const payload = {
      ...formOs,
      prazo: formOs.prazo || null,
      usuario_email: user?.email || '',
      usuario_nome: user?.user_metadata?.name || user?.email?.split('@')[0] || '',
    }
    let error
    if (editingOs) ({ error } = await supabase.from('ordens_servico').update(payload).eq('id', editingOs))
    else ({ error } = await supabase.from('ordens_servico').insert(payload))
    if (error) { toast(error.message,'error'); return }
    toast(editingOs ? 'OS atualizada!' : 'OS criada!', 'success')
    setModalOs(false); loadAll()
    if (editingOs && osSel?.id === editingOs) {
      const { data } = await supabase.from('ordens_servico').select('*').eq('id', editingOs).single()
      setOsSel(data)
    }
  }

  async function mudarStatus(osId, status) {
    if (status === 'recebido') { setConfirmReceberOs(os.find(o => o.id === osId)); return }
    await supabase.from('ordens_servico').update({ status }).eq('id', osId)
    toast('Status atualizado!', 'success')
    loadAll()
    if (osSel?.id === osId) setOsSel(p => ({...p, status}))
  }

  async function receberOs() {
    const o = confirmReceberOs
    setConfirmReceberOs(null)
    if (!itens.length && !osSel) return

    const itensList = osSel?.id === o.id ? itens : (await supabase.from('os_itens').select('*').eq('os_id', o.id)).data || []
    const total = itensList.reduce((s,i) => s + Number(i.quantidade)*Number(i.valor_unit), 0)

    // Cria Conta a Receber já marcada como recebida
    const { data: cr } = await supabase.from('contas_receber').insert({
      data_emissao: today(),
      descricao: `OS ${o.numero} — ${o.cliente_nome} — ${o.equipamento}`,
      valor: total, recebido: true,
      data_recebimento: today(),
      pessoa_id: o.cliente_id || null, pessoa_nome: o.cliente_nome,
      origem_id: o.id, origem_tabela: 'ordens_servico', ativo: true,
    }).select().single()

    // Registra pagamento parcial (total) para aparecer quitado no sistema
    if (cr?.id) {
      await supabase.from('pagamentos_parciais').insert({
        tabela_origem: 'contas_receber',
        origem_id: cr.id,
        valor: total,
        data: today(),
        forma_pgto: 'Recebimento OS',
        obs: `OS ${o.numero}`,
      })
    }

    // Lança no Caixa (conta_id vindo da conta_receber criada, se houver)
    await supabase.from('caixa').insert({
      data: today(), tipo: 'entrada',
      descricao: `OS ${o.numero} — ${o.cliente_nome}`,
      valor: total, categoria: 'Ordem de Serviço',
      conta_id: cr?.conta_id || null,
      forma_pgto: o.forma_pgto || null,
      origem_id: cr?.id, origem_tabela: 'contas_receber', obs: o.obs,
    })

    // Atualiza status da OS
    await supabase.from('ordens_servico').update({ status:'recebido', data_recebimento: today() }).eq('id', o.id)

    // Bloqueia a OS pois gerou CR e lançamento no caixa
    await bloquear('ordens_servico', o.id)

    toast(`✅ OS recebida! ${fmt(total)} lançado em Contas a Receber e Caixa`, 'success')
    loadAll()
    if (osSel?.id === o.id) setOsSel(p => ({...p, status:'recebido'}))
  }

  async function destroyOs() {
    const { pode, motivos } = await verificarExclusao('ordens_servico', deletingOs)
    if (!pode) {
      toast(`Não é possível excluir: ${motivos.join('; ')}.`, 'error')
      setDeletingOs(null)
      return
    }
    await supabase.from('os_itens').delete().eq('os_id', deletingOs.id)
    await supabase.from('ordens_servico').delete().eq('id', deletingOs.id)
    toast('OS excluída', 'success'); setDeletingOs(null)
    if (osSel?.id === deletingOs.id) { setOsSel(null); setView('lista') }
    loadAll()
  }

  // ── ITEM CRUD ─────────────────────────────────────────
  function openNewItem(tipo) { setFormItem({ ...EMPTY_ITEM }); setEditingItem(null); setModalItem(tipo) }
  function openEditItem(item) { setFormItem({...item}); setEditingItem(item.id); setModalItem(item.tipo) }

  async function saveItem() {
    if (!formItem.descricao?.trim()) return toast('Descrição obrigatória', 'error')
    if (!formItem.valor_unit) return toast('Valor obrigatório', 'error')
    const payload = { ...formItem, tipo: modalItem, os_id: osSel.id, valor_total: Number(formItem.quantidade) * Number(formItem.valor_unit) }
    let error
    if (editingItem) ({ error } = await supabase.from('os_itens').update(payload).eq('id', editingItem))
    else ({ error } = await supabase.from('os_itens').insert(payload))
    if (error) { toast(error.message,'error'); return }
    toast('Salvo!', 'success'); setModalItem(null); loadItens(osSel.id)
  }

  async function togglePagoItem(item) {
    await supabase.from('os_itens').update({ pago: !item.pago }).eq('id', item.id)
    loadItens(osSel.id)
  }

  async function destroyItem() {
    await supabase.from('os_itens').delete().eq('id', deletingItem.id)
    toast('Item excluído', 'success'); setDeletingItem(null); loadItens(osSel.id)
  }

  async function printOs() {
    // Busca empresa ligada à OS (ou a única cadastrada como fallback)
    let empData = null
    if (osSel?.empresa_id) {
      const { data } = await supabase.from('empresa').select('*').eq('id', osSel.empresa_id).single()
      empData = data
    }
    if (!empData) {
      const { data } = await supabase.from('empresa').select('*').eq('ativo', true).limit(1).single()
      empData = data
    }
    const e = empData || {}
    const corP = e.cor_primaria || '#1e3a5f'
    const corS = e.cor_secundaria || '#2563eb'

    const si = statusInfo(osSel?.status)
    const pecas    = itens.filter(i => i.tipo === 'peca')
    const servicos = itens.filter(i => i.tipo === 'servico')
    const totalP = pecas.reduce((s,i) => s + Number(i.quantidade)*Number(i.valor_unit), 0)
    const totalS = servicos.reduce((s,i) => s + Number(i.quantidade)*Number(i.valor_unit), 0)
    const total  = totalP + totalS

    const fmtVal = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})

    const enderecoEmp = [e.endereco, e.numero, e.complemento, e.bairro, e.cidade && e.estado ? `${e.cidade}/${e.estado}` : (e.cidade||e.estado), e.cep].filter(Boolean).join(', ')

    const rowsPecas = pecas.map((i,idx) => `
      <tr class="${idx%2===0?'even':'odd'}">
        <td style="padding:9px 12px;font-size:13px">${i.descricao}${i.obs ? `<div style="font-size:11px;color:#888;margin-top:2px">${i.obs}</div>` : ''}</td>
        <td style="padding:9px 12px;text-align:center;font-size:13px;white-space:nowrap">${Number(i.quantidade)}</td>
        <td style="padding:9px 12px;text-align:right;font-size:13px;white-space:nowrap">${fmtVal(i.valor_unit)}</td>
        <td style="padding:9px 12px;text-align:right;font-size:13px;font-weight:700;white-space:nowrap">${fmtVal(Number(i.quantidade)*Number(i.valor_unit))}</td>
      </tr>`).join('')

    const rowsServicos = servicos.map((i,idx) => `
      <tr class="${idx%2===0?'even':'odd'}">
        <td style="padding:9px 12px;font-size:13px">${i.descricao}${i.obs ? `<div style="font-size:11px;color:#888;margin-top:2px">${i.obs}</div>` : ''}</td>
        <td style="padding:9px 12px;text-align:center;font-size:13px;white-space:nowrap">${Number(i.quantidade)}</td>
        <td style="padding:9px 12px;text-align:right;font-size:13px;white-space:nowrap">${fmtVal(i.valor_unit)}</td>
        <td style="padding:9px 12px;text-align:right;font-size:13px;font-weight:700;white-space:nowrap">${fmtVal(Number(i.quantidade)*Number(i.valor_unit))}</td>
      </tr>`).join('')

    const contatos = [e.telefone&&`📞 ${e.telefone}`, e.whatsapp&&`💬 ${e.whatsapp}`, e.email&&`✉ ${e.email}`, e.site&&`🌐 ${e.site}`].filter(Boolean).join('  ·  ')
    const docInfo  = [e.cnpj&&`CNPJ: ${e.cnpj}`, e.ie&&`IE: ${e.ie}`].filter(Boolean).join('  ·  ')

    const statusColors = {
      orcamento:  { bg:'#e5e7eb', color:'#374151' },
      andamento:  { bg:'#dbeafe', color:'#1d4ed8' },
      aguardando: { bg:'#fef3c7', color:'#92400e' },
      finalizado: { bg:'#ffedd5', color:'#c2410c' },
      recebido:   { bg:'#d1fae5', color:'#065f46' },
      cancelado:  { bg:'#fee2e2', color:'#991b1b' },
    }
    const sc = statusColors[osSel?.status] || statusColors.orcamento

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>${osSel?.numero} — ${e.nome || 'Ordem de Serviço'}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',Arial,sans-serif;background:#f8fafc;color:#1e293b;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:820px;margin:0 auto;background:#fff;min-height:100vh;display:flex;flex-direction:column}

  /* CABEÇALHO */
  .cabecalho{background:linear-gradient(135deg,${corP} 0%,${corS} 100%);padding:28px 36px;display:flex;justify-content:space-between;align-items:center;gap:20px}
  .cab-logo-area{display:flex;align-items:center;gap:16px}
  .cab-logo{height:60px;max-width:140px;object-fit:contain;background:white;border-radius:8px;padding:6px}
  .cab-logo-placeholder{width:60px;height:60px;border-radius:10px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:28px}
  .cab-empresa-nome{color:#fff;font-weight:900;font-size:20px;line-height:1.2;letter-spacing:-.3px}
  .cab-empresa-fantasia{color:rgba(255,255,255,.75);font-size:13px;margin-top:3px}
  .cab-empresa-contato{color:rgba(255,255,255,.6);font-size:11.5px;margin-top:6px;line-height:1.7}
  .cab-os-area{text-align:right;flex-shrink:0}
  .cab-os-label{color:rgba(255,255,255,.65);font-size:10px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:4px}
  .cab-os-numero{color:#fff;font-weight:900;font-size:36px;line-height:1;letter-spacing:-1px}
  .cab-os-data{color:rgba(255,255,255,.6);font-size:11.5px;margin-top:6px}
  .cab-os-status{display:inline-block;background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700;letter-spacing:.5px;margin-top:6px}

  /* FAIXA INFO DOC */
  .doc-info{background:#f1f5f9;border-bottom:2px solid #e2e8f0;padding:8px 36px;display:flex;gap:24px;font-size:11px;color:#64748b}
  .doc-info span{font-weight:600;color:#475569}

  /* CORPO */
  .corpo{flex:1;padding:28px 36px}

  /* BLOCO CLIENTE */
  .bloco-cliente{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:24px}
  .bloco-col{padding:14px 18px}
  .bloco-col:first-child{border-right:1px solid #e2e8f0}
  .bloco-titulo{font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:#94a3b8;margin-bottom:8px}
  .bloco-valor{font-size:14px;font-weight:700;color:#0f172a;line-height:1.4}
  .bloco-sub{font-size:12px;color:#64748b;margin-top:3px}

  /* STATUS BADGE inline */
  .status-badge{display:inline-flex;align-items:center;gap:6px;background:${sc.bg};color:${sc.color};border-radius:20px;padding:4px 12px;font-size:11.5px;font-weight:700}

  /* SEÇÃO */
  .secao{margin-bottom:22px}
  .secao-header{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid ${corS}20}
  .secao-icone{width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
  .secao-titulo{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:${corP}}

  /* TABELA ITENS */
  table{width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0}
  thead tr{background:linear-gradient(135deg,${corP},${corS});color:white}
  thead th{padding:10px 12px;text-align:left;font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase}
  tr.even{background:#fff}
  tr.odd{background:#f8fafc}
  tbody tr:last-child td{border-bottom:none}
  .subtotal-row td{padding:8px 12px;border-top:2px solid ${corS}30;background:#f8fafc;text-align:right;font-size:12px;color:#64748b}
  .subtotal-row td:last-child{font-weight:800;color:${corP}}

  /* TOTAL GERAL */
  .total-geral{background:linear-gradient(135deg,${corP},${corS});border-radius:12px;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;margin-top:6px}
  .total-geral-label{color:rgba(255,255,255,.8);font-size:13px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
  .total-geral-valor{color:#fff;font-size:28px;font-weight:900;letter-spacing:-1px}

  /* OBS */
  .obs-box{background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:8px;padding:12px 16px;font-size:13px;color:#78350f;line-height:1.6}

  /* ASSINATURAS */
  .assinaturas{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px}
  .assinatura-linha{border-top:1.5px solid #94a3b8;padding-top:8px;text-align:center}
  .assinatura-label{font-size:11px;color:#64748b;font-weight:500}

  /* RODAPÉ */
  .rodape{background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 36px;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#94a3b8}

  @media print{
    body{background:white}
    .page{max-width:none;min-height:0}
    @page{margin:0;size:A4}
  }
</style>
</head>
<body>
<div class="page">

  <!-- CABEÇALHO -->
  <div class="cabecalho">
    <div class="cab-logo-area">
      ${e.logo_base64 ? `<img class="cab-logo" src="${e.logo_base64}" alt="logo" />` : '<div class="cab-logo-placeholder">🏢</div>'}
      <div>
        <div class="cab-empresa-nome">${e.nome || 'Sua Empresa'}</div>
        ${e.nome_fantasia ? `<div class="cab-empresa-fantasia">${e.nome_fantasia}</div>` : ''}
        ${contatos ? `<div class="cab-empresa-contato">${contatos.replace(/  ·  /g,'<br>')}</div>` : ''}
      </div>
    </div>
    <div class="cab-os-area">
      <div class="cab-os-label">Ordem de Serviço</div>
      <div class="cab-os-numero">${osSel?.numero}</div>
      <div class="cab-os-data">Emitida em ${fmtDate(today())}</div>
      <div><span class="cab-os-status">${si.icon} ${si.label}</span></div>
    </div>
  </div>

  <!-- FAIXA INFO -->
  ${(enderecoEmp || docInfo) ? `<div class="doc-info">
    ${enderecoEmp ? `<div>📍 <span>${enderecoEmp}</span></div>` : ''}
    ${docInfo ? `<div>📄 <span>${docInfo}</span></div>` : ''}
  </div>` : ''}

  <!-- CORPO -->
  <div class="corpo">

    <!-- CLIENTE E OS -->
    <div class="bloco-cliente">
      <div class="bloco-col">
        <div class="bloco-titulo">Cliente</div>
        <div class="bloco-valor">${osSel?.cliente_nome || '—'}</div>
        ${osSel?.cliente_telefone ? `<div class="bloco-sub">📞 ${osSel.cliente_telefone}</div>` : ''}
        ${osSel?.cliente_email ? `<div class="bloco-sub">✉ ${osSel.cliente_email}</div>` : ''}
        ${osSel?.cliente_endereco ? `<div class="bloco-sub">📍 ${osSel.cliente_endereco}</div>` : ''}
      </div>
      <div class="bloco-col">
        <div class="bloco-titulo">Equipamento / Serviço</div>
        <div class="bloco-valor">${osSel?.equipamento || '—'}</div>
        ${osSel?.local_servico && osSel.local_servico !== osSel?.cliente_endereco
          ? `<div class="bloco-sub" style="margin-top:8px"><strong>📍 Local do serviço:</strong><br>${osSel.local_servico}</div>`
          : ''}
      </div>
      ${osSel?.prazo ? `
      <div class="bloco-col" style="border-top:1px solid #e2e8f0">
        <div class="bloco-titulo">Prazo de Entrega</div>
        <div class="bloco-valor">${osSel.prazo.split('-').reverse().join('/')}</div>
      </div>
      <div class="bloco-col" style="border-top:1px solid #e2e8f0;border-left:1px solid #e2e8f0">
        <div class="bloco-titulo">Data de Emissão</div>
        <div class="bloco-valor">${fmtDate(today())}</div>
      </div>` : ''}
    </div>

    <!-- OBS -->
    ${osSel?.obs ? `<div class="obs-box" style="margin-bottom:22px"><strong>📋 Descrição / Defeito relatado:</strong> ${osSel.obs}</div>` : ''}

    <!-- PEÇAS -->
    ${pecas.length > 0 ? `
    <div class="secao">
      <div class="secao-header">
        <div class="secao-icone" style="background:${corP}18">🔩</div>
        <div class="secao-titulo">Peças &amp; Materiais</div>
      </div>
      <table>
        <thead><tr>
          <th>Descrição</th>
          <th style="text-align:center;width:70px">Qtd</th>
          <th style="text-align:right;width:110px">Vlr Unit.</th>
          <th style="text-align:right;width:110px">Total</th>
        </tr></thead>
        <tbody>
          ${rowsPecas}
          <tr class="subtotal-row"><td colspan="3">Subtotal Peças</td><td>${fmtVal(totalP)}</td></tr>
        </tbody>
      </table>
    </div>` : ''}

    <!-- SERVIÇOS -->
    ${servicos.length > 0 ? `
    <div class="secao">
      <div class="secao-header">
        <div class="secao-icone" style="background:${corS}18">🔧</div>
        <div class="secao-titulo">Serviços Executados</div>
      </div>
      <table>
        <thead><tr>
          <th>Descrição</th>
          <th style="text-align:center;width:70px">Qtd</th>
          <th style="text-align:right;width:110px">Vlr Unit.</th>
          <th style="text-align:right;width:110px">Total</th>
        </tr></thead>
        <tbody>
          ${rowsServicos}
          <tr class="subtotal-row"><td colspan="3">Subtotal Serviços</td><td>${fmtVal(totalS)}</td></tr>
        </tbody>
      </table>
    </div>` : ''}

    <!-- TOTAL GERAL -->
    <div class="total-geral">
      <div class="total-geral-label">💰 Total Geral</div>
      <div class="total-geral-valor">${fmtVal(total)}</div>
    </div>

    <!-- ASSINATURAS -->
    <div class="assinaturas">
      <div><div class="assinatura-linha"><div class="assinatura-label">Assinatura do Técnico / Responsável</div></div></div>
      <div><div class="assinatura-linha"><div class="assinatura-label">Assinatura do Cliente — Ciente do serviço</div></div></div>
    </div>

  </div><!-- /corpo -->

  <!-- RODAPÉ -->
  <div class="rodape">
    <div>${e.rodape_os || 'Obrigado pela preferência!'}</div>
    <div>${osSel?.numero} · ${fmtDate(today())}</div>
  </div>

</div><!-- /page -->
</body>
</html>`

    const win = window.open('', '_blank', 'width=860,height:1000')
    win.document.write(html)
    win.document.close()
    win.onload = () => { win.focus(); win.print() }
  }


  const fo = (k,v) => setFormOs(p => ({...p, [k]:v}))
  const fi = (k,v) => setFormItem(p => ({...p, [k]:v}))
  const statusInfo = (s) => STATUS.find(x => x.id === s) || STATUS[0]


  const filtered = os.filter(o => {
    const q = search.toLowerCase()
    const mS = !filterStatus || o.status === filterStatus
    const mQ = !q || o.numero?.toLowerCase().includes(q) || o.cliente_nome?.toLowerCase().includes(q) || o.equipamento?.toLowerCase().includes(q)
    return mS && mQ
  })

  // Contadores por status
  const counts = {}
  STATUS.forEach(s => { counts[s.id] = os.filter(o => o.status === s.id).length })

  // ── VIEW: Lista ───────────────────────────────────────
  if (view === 'lista') return (
    <div>
      {/* Status pills summary */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
        {STATUS.filter(s => s.id !== 'cancelado').map(s => (
          <button key={s.id} onClick={() => setFilterStatus(filterStatus === s.id ? '' : s.id)}
            className={s.cls} style={{
              cursor:'pointer', border:'none', borderRadius:20, padding:'4px 12px',
              fontSize:11, fontWeight:700, opacity: filterStatus && filterStatus !== s.id ? .4 : 1,
              transition:'opacity .15s', background: filterStatus === s.id ? undefined : undefined
            }}>
            {s.icon} {s.label} {counts[s.id] > 0 && <span style={{ marginLeft:4, background:'rgba(255,255,255,.15)', borderRadius:10, padding:'0 5px' }}>{counts[s.id]}</span>}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <Search size={14} />
          <input className="search-input" placeholder="Buscar nº OS, cliente, equipamento..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={openNewOs}><Plus size={15} /> Nova OS</button>
      </div>

      {loading ? <div className="loading"><div className="spinner" /></div> :
        filtered.length === 0 ? <div className="empty-state"><FileText size={40} /><p>Nenhuma ordem de serviço</p></div> : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {filtered.map(o => {
              const si = statusInfo(o.status)
              return (
                <div key={o.id} className="card" style={{ padding:'14px 18px', cursor:'pointer', borderLeft:`3px solid`, borderLeftColor: o.status==='recebido' ? 'var(--green)' : o.status==='finalizado' ? 'var(--orange)' : o.status==='andamento' ? 'var(--accent)' : o.status==='aguardando' ? 'var(--yellow)' : o.status==='cancelado' ? 'var(--red)' : 'var(--border)' }}
                  onClick={() => { setOsSel(o); setView('detalhe') }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                        <span style={{ fontWeight:800, fontSize:14, color:'var(--accent)' }}>{o.numero}</span>
                        <span className={si.cls} style={{ fontSize:10 }}>{si.icon} {si.label}</span>
                        {o.prazo && new Date(o.prazo) < new Date() && o.status !== 'recebido' && o.status !== 'cancelado' && (
                          <span className="badge badge-red" style={{ fontSize:10 }}>⚠ Prazo vencido</span>
                        )}
                      </div>
                      <div style={{ fontWeight:700, fontSize:14, marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.cliente_nome}</div>
                      <div style={{ color:'var(--text2)', fontSize:12 }}>{o.equipamento}{o.endereco_obra ? ` · ${o.endereco_obra}` : ''}</div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      {o.prazo && <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Prazo: {o.prazo.split('-').reverse().join('/')}</div>}
                      <div style={{ fontSize:11, color:'var(--text3)' }}>{new Date(o.created_at).toLocaleDateString('pt-BR')}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      {modalOs && (
        <Modal title={editingOs ? 'Editar OS' : 'Nova Ordem de Serviço'} onClose={() => setModalOs(false)} onSave={saveOs} size="modal-lg">
          <div className="form-grid form-grid-2">
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Empresa / Prestador</label>
              <select className="form-select" value={formOs.empresa_id} onChange={e => {
                const emp = empresas.find(x => x.id === e.target.value)
                fo('empresa_id', e.target.value)
                fo('empresa_nome', emp?.nome_fantasia || emp?.nome || '')
              }}>
                <option value="">Selecionar empresa...</option>
                {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nome_fantasia || emp.nome}</option>)}
              </select>
              {empresas.length === 0 && <span style={{ fontSize:11, color:'var(--yellow)' }}>⚠ Cadastre em Sistema → Dados da Empresa</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Número</label>
              <input className="form-input" value={formOs.numero} onChange={e => fo('numero', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={formOs.status} onChange={e => fo('status', e.target.value)}>
                {STATUS.map(s => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Cliente *</label>
              <select className="form-select" value={formOs.cliente_id} onChange={e => {
                const c = clientes.find(x => x.id === e.target.value)
                fo('cliente_id', e.target.value)
                fo('cliente_nome', c?.nome || '')
                fo('cliente_telefone', c?.telefone || '')
                fo('cliente_email', c?.email || '')
                fo('cliente_endereco', c?.endereco || '')
              }}>
                <option value="">Selecionar cliente...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            {formOs.cliente_id && <>
              <div className="form-group">
                <label className="form-label">Telefone do cliente</label>
                <input className="form-input" value={formOs.cliente_telefone} onChange={e => fo('cliente_telefone', e.target.value)} placeholder="(00) 00000-0000" />
              </div>
              <div className="form-group">
                <label className="form-label">E-mail do cliente</label>
                <input className="form-input" value={formOs.cliente_email} onChange={e => fo('cliente_email', e.target.value)} />
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Endereço principal do cliente</label>
                <input className="form-input" value={formOs.cliente_endereco} onChange={e => fo('cliente_endereco', e.target.value)} />
              </div>
            </>}
            <div style={{ gridColumn:'1/-1', height:1, background:'var(--border)', margin:'2px 0' }} />
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Equipamento / Serviço *</label>
              <input className="form-input" value={formOs.equipamento} onChange={e => fo('equipamento', e.target.value)} placeholder="Ex: Notebook Dell, Ar condicionado, Portão elétrico..." />
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Local do serviço</label>
              <input className="form-input" value={formOs.local_servico} onChange={e => fo('local_servico', e.target.value)} placeholder="Endereço/obra onde será executado" />
              {formOs.cliente_endereco && !formOs.local_servico && (
                <button type="button" style={{ marginTop:4, fontSize:11, color:'var(--accent)', background:'none', border:'none', cursor:'pointer', padding:0 }}
                  onClick={() => fo('local_servico', formOs.cliente_endereco)}>↳ Usar endereço do cliente</button>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Prazo de entrega</label>
              <input className="form-input" type="date" value={formOs.prazo} onChange={e => fo('prazo', e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Observações / Defeito relatado</label>
              <textarea className="form-textarea" value={formOs.obs} onChange={e => fo('obs', e.target.value)} rows={2} placeholder="Descreva o problema, condições do equipamento, etc..." />
            </div>
          </div>
        </Modal>
      )}
      {deletingOs && <ConfirmDialog message={`Excluir OS "${deletingOs.numero}"? Todos os itens serão removidos.`} onConfirm={destroyOs} onCancel={() => setDeletingOs(null)} />}
    </div>
  )

  // ── VIEW: Detalhe da OS ───────────────────────────────
  const si = statusInfo(osSel?.status)
  const pecas    = itens.filter(i => i.tipo === 'peca')
  const servicos = itens.filter(i => i.tipo === 'servico')
  const podeReceber = osSel?.status === 'finalizado'
  const jaRecebido  = osSel?.status === 'recebido'

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18, flexWrap:'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => { setView('lista'); setOsSel(null) }}>
          <ChevronLeft size={14} /> Voltar
        </button>
        <span style={{ fontWeight:800, fontSize:16, color:'var(--accent)' }}>{osSel?.numero}</span>
        <span className={si.cls}>{si.icon} {si.label}</span>
        {osSel?.prazo && new Date(osSel.prazo) < new Date() && !jaRecebido && (
          <span className="badge badge-red">⚠ Prazo vencido</span>
        )}
        <div style={{ flex:1 }} />
        <button className="btn btn-secondary btn-sm" onClick={printOs}><Printer size={13} /> Imprimir / PDF</button>
        <button className="btn btn-secondary btn-sm" onClick={() => openEditOs(osSel)}><Pencil size={13} /> Editar</button>
        <button className="btn btn-sm btn-danger" onClick={() => setDeletingOs(osSel)}><Trash2 size={13} /></button>
      </div>

      {/* Cabeçalho OS */}
      <div className="card" style={{ marginBottom:14 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px,1fr))', gap:12 }}>
          {osSel?.empresa_nome && <div>
            <div className="stat-label" style={{ marginBottom:3 }}>Empresa</div>
            <div style={{ fontWeight:700, color:'var(--accent)' }}>{osSel.empresa_nome}</div>
          </div>}
          <div>
            <div className="stat-label" style={{ marginBottom:3 }}>Cliente</div>
            <div style={{ fontWeight:700 }}>{osSel?.cliente_nome}</div>
            {osSel?.cliente_telefone && <div style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>📞 {osSel.cliente_telefone}</div>}
            {osSel?.cliente_email && <div style={{ fontSize:12, color:'var(--text2)' }}>✉ {osSel.cliente_email}</div>}
          </div>
          <div>
            <div className="stat-label" style={{ marginBottom:3 }}>Equipamento / Serviço</div>
            <div style={{ fontWeight:600 }}>{osSel?.equipamento}</div>
          </div>
          {osSel?.local_servico && <div>
            <div className="stat-label" style={{ marginBottom:3 }}>Local do Serviço</div>
            <div style={{ color:'var(--text2)' }}>📍 {osSel.local_servico}</div>
          </div>}
          {osSel?.cliente_endereco && osSel?.cliente_endereco !== osSel?.local_servico && <div>
            <div className="stat-label" style={{ marginBottom:3 }}>Endereço do Cliente</div>
            <div style={{ color:'var(--text3)', fontSize:12 }}>{osSel.cliente_endereco}</div>
          </div>}
          {osSel?.prazo && <div>
            <div className="stat-label" style={{ marginBottom:3 }}>Prazo</div>
            <div style={{ fontWeight:600, color: new Date(osSel.prazo) < new Date() && !jaRecebido ? 'var(--red)' : 'var(--text)' }}>
              {osSel.prazo.split('-').reverse().join('/')}
            </div>
          </div>}
          {osSel?.obs && <div style={{ gridColumn:'1/-1' }}>
            <div className="stat-label" style={{ marginBottom:3 }}>Observações</div>
            <div style={{ color:'var(--text2)', fontSize:13 }}>{osSel.obs}</div>
          </div>}
        </div>
      </div>

      {/* Fluxo de status */}
      <div className="card" style={{ marginBottom:14, padding:'12px 16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:4, flexWrap:'wrap' }}>
          <span style={{ fontSize:11, color:'var(--text3)', marginRight:4 }}>ALTERAR STATUS:</span>
          {STATUS.filter(s => s.id !== 'recebido').map(s => (
            <button key={s.id} onClick={() => mudarStatus(osSel.id, s.id)}
              className={`btn btn-sm ${osSel?.status === s.id ? '' : 'btn-secondary'}`}
              style={{ fontSize:11, padding:'4px 10px', background: osSel?.status === s.id ? undefined : undefined,
                ...(osSel?.status === s.id ? { background:'var(--bg4)', fontWeight:800, cursor:'default' } : {}) }}
              disabled={osSel?.status === s.id || jaRecebido}>
              {s.icon} {s.label}
            </button>
          ))}
          {podeReceber && (
            <button className="btn btn-sm btn-success" style={{ marginLeft:'auto' }} onClick={() => setConfirmReceberOs(osSel)}>
              <DollarSign size={13} /> Marcar como Recebido
            </button>
          )}
          {jaRecebido && <span className="badge badge-green" style={{ marginLeft:'auto' }}>💰 Pagamento registrado</span>}
        </div>
      </div>

      {/* Resumo financeiro */}
      <div className="stats-grid" style={{ gridTemplateColumns:'repeat(4,1fr)', marginBottom:14 }}>
        <div className="stat-card blue"><div className="stat-label">Peças</div><div className="stat-value blue text-mono" style={{ fontSize:16 }}>{fmt(totalPecas)}</div></div>
        <div className="stat-card purple"><div className="stat-label">Serviços</div><div className="stat-value purple text-mono" style={{ fontSize:16 }}>{fmt(totalServicos)}</div></div>
        <div className="stat-card green"><div className="stat-label">Total OS</div><div className="stat-value green text-mono" style={{ fontSize:16 }}>{fmt(totalOs)}</div></div>
        <div className="stat-card yellow"><div className="stat-label">Pendente</div><div className="stat-value yellow text-mono" style={{ fontSize:16 }}>{fmt(totalPendente)}</div></div>
      </div>

      {/* Peças */}
      <div className="card" style={{ marginBottom:14 }}>
        <div className="card-header">
          <span className="card-title" style={{ display:'flex', alignItems:'center', gap:8 }}><Package size={15} color="var(--accent)" /> Peças ({pecas.length})</span>
          {!jaRecebido && <button className="btn btn-sm btn-primary" onClick={() => openNewItem('peca')}><Plus size={13} /> Peça</button>}
        </div>
        {pecas.length === 0 ? <div style={{ color:'var(--text3)', fontSize:13, padding:'8px 0' }}>Nenhuma peça lançada</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Descrição</th><th>Qtd</th><th>Vlr Unit.</th><th>Total</th><th>Pago</th><th>Ações</th></tr></thead>
              <tbody>
                {pecas.map(i => (
                  <tr key={i.id}>
                    <td className="font-bold">{i.descricao}</td>
                    <td className="text-mono">{i.quantidade}</td>
                    <td className="text-mono">{fmt(i.valor_unit)}</td>
                    <td className="text-mono font-bold">{fmt(Number(i.quantidade)*Number(i.valor_unit))}</td>
                    <td><button className="icon-btn" onClick={() => togglePagoItem(i)} title={i.pago ? 'Desmarcar' : 'Marcar pago'} style={{ color: i.pago ? 'var(--green)' : 'var(--text3)' }}><CheckCircle size={15} /></button></td>
                    <td><div className="action-btns">
                      {!jaRecebido && <><button className="icon-btn edit" onClick={() => openEditItem(i)}><Pencil size={13} /></button>
                      <button className="icon-btn del" onClick={() => setDeletingItem(i)}><Trash2 size={13} /></button></>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Serviços */}
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display:'flex', alignItems:'center', gap:8 }}><Wrench size={15} color="var(--accent2)" /> Serviços ({servicos.length})</span>
          {!jaRecebido && <button className="btn btn-sm" style={{ background:'var(--accent2)', color:'#fff' }} onClick={() => openNewItem('servico')}><Plus size={13} /> Serviço</button>}
        </div>
        {servicos.length === 0 ? <div style={{ color:'var(--text3)', fontSize:13, padding:'8px 0' }}>Nenhum serviço lançado</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Descrição</th><th>Qtd</th><th>Vlr Unit.</th><th>Total</th><th>Pago</th><th>Ações</th></tr></thead>
              <tbody>
                {servicos.map(i => (
                  <tr key={i.id}>
                    <td className="font-bold">{i.descricao}</td>
                    <td className="text-mono">{i.quantidade}</td>
                    <td className="text-mono">{fmt(i.valor_unit)}</td>
                    <td className="text-mono font-bold">{fmt(Number(i.quantidade)*Number(i.valor_unit))}</td>
                    <td><button className="icon-btn" onClick={() => togglePagoItem(i)} title={i.pago ? 'Desmarcar' : 'Marcar pago'} style={{ color: i.pago ? 'var(--green)' : 'var(--text3)' }}><CheckCircle size={15} /></button></td>
                    <td><div className="action-btns">
                      {!jaRecebido && <><button className="icon-btn edit" onClick={() => openEditItem(i)}><Pencil size={13} /></button>
                      <button className="icon-btn del" onClick={() => setDeletingItem(i)}><Trash2 size={13} /></button></>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal item (peça ou serviço) */}
      {modalItem && (() => {
        // filtra produtos do cadastro pelo tipo do modal
        // 'peca' usa tipo='produto', 'servico' usa tipo='servico'
        const produtosFiltrados = modalItem === 'peca'
          ? produtos.filter(p => p.tipo === 'produto')
          : produtos.filter(p => p.tipo === 'servico')
        return (
          <Modal title={`${editingItem ? 'Editar' : 'Novo'} ${modalItem === 'peca' ? 'Peça / Material' : 'Serviço'}`} onClose={() => setModalItem(null)} onSave={saveItem}>
            <div className="form-grid form-grid-2">

              {/* Seletor do cadastro */}
              {produtosFiltrados.length > 0 && !editingItem && (
                <div className="form-group" style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Selecionar do cadastro</label>
                  <select className="form-select" defaultValue=""
                    onChange={e => {
                      const p = produtos.find(x => x.id === e.target.value)
                      if (p) { fi('descricao', p.nome); fi('valor_unit', p.preco_venda || 0) }
                    }}>
                    <option value="">— Selecionar produto/serviço —</option>
                    {produtosFiltrados.map(p => (
                      <option key={p.id} value={p.id}>{p.nome} — {fmt(p.preco_venda || 0)}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Descrição *</label>
                <input className="form-input" value={formItem.descricao} onChange={e => fi('descricao', e.target.value)}
                  placeholder={modalItem === 'peca' ? 'Nome da peça / material...' : 'Descrição do serviço...'} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Quantidade</label>
                <input className="form-input" type="number" min={0.01} step="0.01" value={formItem.quantidade} onChange={e => fi('quantidade', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Valor Unitário *</label>
                <input className="form-input" type="number" step="0.01" value={formItem.valor_unit} onChange={e => fi('valor_unit', e.target.value)} placeholder="0,00" />
              </div>
              {Number(formItem.quantidade) > 0 && Number(formItem.valor_unit) > 0 && (
                <div style={{ gridColumn:'1/-1', background:'var(--bg3)', borderRadius:8, padding:'10px 14px', display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'var(--text2)', fontSize:13 }}>Total</span>
                  <span style={{ fontWeight:800, color:'var(--green)' }}>{fmt(Number(formItem.quantidade)*Number(formItem.valor_unit))}</span>
                </div>
              )}
              <div className="form-group" style={{ display:'flex', flexDirection:'row', alignItems:'center', gap:10, paddingTop:4 }}>
                <input type="checkbox" id="pago_item" checked={formItem.pago} onChange={e => fi('pago', e.target.checked)} style={{ width:16, height:16 }} />
                <label htmlFor="pago_item" className="form-label" style={{ margin:0, cursor:'pointer' }}>Já pago/recebido</label>
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Observações</label>
                <textarea className="form-textarea" value={formItem.obs} onChange={e => fi('obs', e.target.value)} rows={2} />
              </div>
            </div>
          </Modal>
        )
      })()}

      {deletingItem && <ConfirmDialog message={`Excluir "${deletingItem.descricao}"?`} onConfirm={destroyItem} onCancel={() => setDeletingItem(null)} />}
      {deletingOs && <ConfirmDialog message={`Excluir OS "${deletingOs.numero}"?`} onConfirm={destroyOs} onCancel={() => setDeletingOs(null)} />}
      {confirmReceberOs && (
        <ConfirmDialog
          message={`Confirmar recebimento da OS ${confirmReceberOs.numero}?\n\nTotal: ${fmt(totalOs)}\n\nIsso irá gerar uma entrada em Contas a Receber e no Caixa.`}
          onConfirm={receberOs} onCancel={() => setConfirmReceberOs(null)}
        />
      )}

      {modalOs && (
        <Modal title={editingOs ? 'Editar OS' : 'Nova Ordem de Serviço'} onClose={() => setModalOs(false)} onSave={saveOs} size="modal-lg">
          <div className="form-grid form-grid-2">
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Empresa / Prestador</label>
              <select className="form-select" value={formOs.empresa_id} onChange={e => {
                const emp = empresas.find(x => x.id === e.target.value)
                fo('empresa_id', e.target.value)
                fo('empresa_nome', emp?.nome_fantasia || emp?.nome || '')
              }}>
                <option value="">Selecionar empresa...</option>
                {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nome_fantasia || emp.nome}</option>)}
              </select>
              {empresas.length === 0 && <span style={{ fontSize:11, color:'var(--yellow)' }}>⚠ Cadastre em Sistema → Dados da Empresa</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Número</label>
              <input className="form-input" value={formOs.numero} onChange={e => fo('numero', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={formOs.status} onChange={e => fo('status', e.target.value)}>
                {STATUS.map(s => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Cliente *</label>
              <select className="form-select" value={formOs.cliente_id} onChange={e => {
                const c = clientes.find(x => x.id === e.target.value)
                fo('cliente_id', e.target.value)
                fo('cliente_nome', c?.nome || '')
                fo('cliente_telefone', c?.telefone || '')
                fo('cliente_email', c?.email || '')
                fo('cliente_endereco', c?.endereco || '')
              }}>
                <option value="">Selecionar cliente...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            {formOs.cliente_id && <>
              <div className="form-group">
                <label className="form-label">Telefone do cliente</label>
                <input className="form-input" value={formOs.cliente_telefone} onChange={e => fo('cliente_telefone', e.target.value)} placeholder="(00) 00000-0000" />
              </div>
              <div className="form-group">
                <label className="form-label">E-mail do cliente</label>
                <input className="form-input" value={formOs.cliente_email} onChange={e => fo('cliente_email', e.target.value)} />
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Endereço principal do cliente</label>
                <input className="form-input" value={formOs.cliente_endereco} onChange={e => fo('cliente_endereco', e.target.value)} />
              </div>
            </>}
            <div style={{ gridColumn:'1/-1', height:1, background:'var(--border)', margin:'2px 0' }} />
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Equipamento / Serviço *</label>
              <input className="form-input" value={formOs.equipamento} onChange={e => fo('equipamento', e.target.value)} placeholder="Ex: Notebook Dell, Ar condicionado, Portão elétrico..." />
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Local do serviço</label>
              <input className="form-input" value={formOs.local_servico} onChange={e => fo('local_servico', e.target.value)} placeholder="Endereço/obra onde será executado" />
              {formOs.cliente_endereco && !formOs.local_servico && (
                <button type="button" style={{ marginTop:4, fontSize:11, color:'var(--accent)', background:'none', border:'none', cursor:'pointer', padding:0 }}
                  onClick={() => fo('local_servico', formOs.cliente_endereco)}>↳ Usar endereço do cliente</button>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Prazo de entrega</label>
              <input className="form-input" type="date" value={formOs.prazo} onChange={e => fo('prazo', e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Observações / Defeito relatado</label>
              <textarea className="form-textarea" value={formOs.obs} onChange={e => fo('obs', e.target.value)} rows={2} placeholder="Descreva o problema, condições do equipamento, etc..." />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
