import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useEntidade } from '../contexts/EntidadeContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  Plus, Search, Pencil, Trash2, Power, HardHat, Share2,
  CheckCircle, ChevronDown, ChevronUp, Wallet,
  AlertCircle, Camera, X, TrendingUp, TrendingDown, Layers, GripVertical
} from 'lucide-react'
import { today, fmtDate } from '../lib/utils.js'
import UploadComprovante from '../components/UploadComprovante'
import { imprimirRelatorioObra } from '../lib/relatorioObra'

const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const STATUS_OBRA  = ['planejamento', 'em_andamento', 'concluida', 'cancelada']
const STATUS_LABEL = { planejamento: 'Planejamento', em_andamento: 'Em Andamento', concluida: 'Concluída', cancelada: 'Cancelada' }
const STATUS_COLOR = { planejamento: 'badge-blue', em_andamento: 'badge-yellow', concluida: 'badge-green', cancelada: 'badge-red' }

// Fontes que movimentam o caixa real (saída de dinheiro da empresa/pessoa)
const FONTES_MOVEM_CAIXA = ['empresa', 'proprio', 'dinheiro_cliente']
// Cartão do cliente NÃO entra no caixa
const FONTE_NAO_CAIXA = 'cartao_cliente'

const STATUS_ETAPA  = ['pendente','em_andamento','concluida','cancelada']
const LETAPA_LABEL  = { pendente: 'Pendente', em_andamento: 'Em Andamento', concluida: 'Concluída', cancelada: 'Cancelada' }
const LETAPA_COLOR  = { pendente: 'badge-gray', em_andamento: 'badge-yellow', concluida: 'badge-green', cancelada: 'badge-red' }

const EMPTY_ETAPA = { nome: '', descricao: '', ordem: 0, valor_orcado: '', status: 'pendente', data_inicio: '', data_fim: '' }

const EMPTY_OBRA = {
  nome: '', cliente_id: '', cliente_nome: '', status: 'planejamento',
  valor_contratado: '', data_inicio: today(), data_fim: '', obs: ''
}
const EMPTY_LANC = {
  tipo: 'despesa', descricao: '', valor: '', fonte_id: '', pago_por: '',
  conta_id: '', etapa_id: '', reembolsavel: false, data_ref: today(), obs: '', imagens_url: []
}

export default function Obras() {
  const toast = useToast()
  const { entidadeAtiva, pode } = useEntidade()
  const [rows, setRows]                     = useState([])
  const [lancamentosMap, setLancamentosMap] = useState({})
  const [clientes, setClientes]             = useState([])
  const [fontes, setFontes]                 = useState([])
  const [produtos, setProdutos]             = useState([])
  const [contas, setContas]                 = useState([])
  const [empresa, setEmpresa]               = useState(null)
  const [etapasMap, setEtapasMap]           = useState({})  // { obra_id: [etapas] }

  // Modal etapa
  const [modalEtapa, setModalEtapa]         = useState(false)
  const [formEtapa, setFormEtapa]           = useState(EMPTY_ETAPA)
  const [editingEtapa, setEditingEtapa]     = useState(null)
  const [deletingEtapa, setDeletingEtapa]   = useState(null)
  const [etapaExpanded, setEtapaExpanded]   = useState(null)
  const [loading, setLoading]               = useState(true)
  const [search, setSearch]                 = useState('')
  const [filterStatus, setFilterStatus]     = useState('')
  const [showArquivados, setShowArquivados] = useState(false)

  // Modal obra
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(EMPTY_OBRA)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  // Detalhe da obra
  const [obraSel, setObraSel]       = useState(null)
  const [tabDetalhe, setTabDetalhe] = useState('lancamentos') // 'lancamentos' | 'etapas' | 'relatorio'

  // Modal lançamento
  const [modalLanc, setModalLanc]     = useState(false)
  const [formLanc, setFormLanc]       = useState(EMPTY_LANC)
  const [editingLanc, setEditingLanc] = useState(null)
  const [deletingLanc, setDeletingLanc] = useState(null)
  const [savingLanc, setSavingLanc]   = useState(false)
  const [usarItens, setUsarItens]     = useState(false)
  const [formItens, setFormItens]     = useState([]) // [{id, produto_id, descricao, quantidade, valor_unitario, desconta_estoque}]
  const [fotoModal, setFotoModal]     = useState(null)  // string | string[]
  const [fotoIdx, setFotoIdx]           = useState(0)


  // Sanitiza payload — converte strings vazias para null (evita erro uuid inválido)
  const sanitize = (obj) => Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v === '' ? null : v])
  )

  useEffect(() => {
    if (!entidadeAtiva?.id) return
    load()
    supabase.from('pessoas').select('id,nome').in('tipo', ['cliente', 'ambos']).eq('ativo', true).eq('entidade_id', entidadeAtiva?.id).order('nome')
      .then(({ data }) => setClientes(data || []))
    supabase.from('obras_fontes_pagamento').select('id,nome,tipo,direcao,conta_id').eq('ativo', true).order('nome')
      .then(({ data }) => setFontes(data || []))
    supabase.from('contas').select('id,nome,saldo_atual').eq('ativo', true).eq('entidade_id', entidadeAtiva?.id).order('nome')
      .then(({ data }) => setContas(data || []))
    supabase.from('produtos').select('id,nome,unidade,preco_custo,estoque').eq('ativo', true).eq('tipo', 'produto').eq('entidade_id', entidadeAtiva?.id).order('nome')
      .then(({ data }) => setProdutos(data || []))
    supabase.from('entidades').select('*').eq('id', entidadeAtiva?.id).single()
      .then(({ data }) => setEmpresa(data || null))
  }, [entidadeAtiva?.id])

  async function load() {
    if (!entidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const { data: obras, error } = await supabase.from('obras').select('*').eq('entidade_id', entidadeAtiva?.id).order('data_inicio', { ascending: false })
    if (error) { toast(error.message, 'error'); setLoading(false); return }
    setRows(obras || [])
    if ((obras || []).length > 0) {
      const ids = obras.map(o => o.id)

      // Fonte 1: anotações informativas (Cartão do Cliente / Outro — nunca tiveram dinheiro real)
      const { data: lancs } = await supabase
        .from('obra_lancamentos')
        .select('*')
        .in('obra_id', ids)
        .eq('migrado', false)
        .order('data_ref', { ascending: false })

      // Fonte 2: dinheiro real — lançamentos de Caixa vinculados à obra (modelo unificado)
      const { data: caixaLancs } = await supabase
        .from('caixa')
        .select('*')
        .in('obra_id', ids)
        .order('data', { ascending: false })

      const mapa = {}
      for (const l of (lancs || [])) {
        const norm = { ...l, _origem: 'obra_lancamentos' }
        if (!mapa[l.obra_id]) mapa[l.obra_id] = []
        mapa[l.obra_id].push(norm)
      }
      for (const cx of (caixaLancs || [])) {
        const norm = {
          id: cx.id,
          _origem: 'caixa',
          obra_id: cx.obra_id,
          etapa_id: cx.obra_etapa_id || null,
          tipo: cx.tipo === 'entrada' ? 'receita' : 'despesa',
          descricao: cx.descricao,
          valor: cx.valor,
          data_ref: cx.data,
          obs: cx.obs,
          pago_por: cx.forma_pgto || '',
          fonte_id: cx.fonte_id || null,
          conta_id: cx.conta_id || null,
          reembolsavel: !!cx.reembolsavel,
          imagens_url: Array.isArray(cx.imagens_url) ? cx.imagens_url : [],
          caixa_id: cx.id, // compatibilidade com checks que esperam esse campo
        }
        if (!mapa[cx.obra_id]) mapa[cx.obra_id] = []
        mapa[cx.obra_id].push(norm)
      }
      for (const k of Object.keys(mapa)) {
        mapa[k].sort((a, b) => (b.data_ref || '').localeCompare(a.data_ref || ''))
      }
      setLancamentosMap(mapa)

      // Carrega etapas das obras
      const { data: etapas } = await supabase
        .from('obra_etapas')
        .select('*')
        .in('obra_id', ids)
        .order('ordem')
      const mapaEtapas = {}
      for (const e of (etapas || [])) {
        if (!mapaEtapas[e.obra_id]) mapaEtapas[e.obra_id] = []
        mapaEtapas[e.obra_id].push(e)
      }
      setEtapasMap(mapaEtapas)
    } else {
      setLancamentosMap({})
      setEtapasMap({})
    }
    setLoading(false)
  }

  const lancsDaObra   = id => lancamentosMap[id] || []
  const etapasDaObra  = id => etapasMap[id] || []
  const gastoObra    = id => lancsDaObra(id).filter(l => l.tipo === 'despesa').reduce((s, l) => s + Number(l.valor || 0), 0)
  const recebidoObra = id => lancsDaObra(id).filter(l => l.tipo === 'receita').reduce((s, l) => s + Number(l.valor || 0), 0)
  // Percentual gasto em relação ao contratado (para alerta)
  const pctGasto = (contratado, gasto) => contratado > 0 ? (gasto / contratado) * 100 : 0

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const matchQ    = !q || r.nome?.toLowerCase().includes(q) || r.cliente_nome?.toLowerCase().includes(q)
    const matchS    = !filterStatus || r.status === filterStatus
    const matchAtivo = showArquivados ? true : r.ativo !== false
    return matchQ && matchS && matchAtivo
  })

  const totalContratado = filtered.reduce((s, r) => s + Number(r.valor_contratado || 0), 0)
  const totalGasto      = filtered.reduce((s, r) => s + gastoObra(r.id), 0)
  const totalRecebido   = filtered.reduce((s, r) => s + recebidoObra(r.id), 0)
  const totalMargem     = totalRecebido - totalGasto

  function openNew()   { setForm(EMPTY_OBRA); setEditing(null); setModal(true) }
  async function compartilharObra(r) {
    let token = r.token_publico
    // Gera token se não existir
    if (!token) {
      token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join('')
      const { error } = await supabase.from('obras').update({ token_publico: token }).eq('id', r.id)
      if (error) { toast('Erro ao gerar link', 'error'); return }
      load()
    }
    const link = `${window.location.origin}${window.location.pathname}?obra=${token}`
    try {
      await navigator.clipboard.writeText(link)
      toast('Link copiado! Mande para o cliente pelo WhatsApp.', 'success')
    } catch {
      prompt('Copie o link abaixo:', link)
    }
  }

  function openEdit(r) { setForm({ ...r }); setEditing(r.id); setModal(true) }

  async function save() {
    if (!entidadeAtiva?.id) return toast('Selecione uma entidade antes de salvar', 'error')
    if (!form.nome?.trim()) return toast('Nome obrigatório', 'error')
    const payload = {
      ...form,
      cliente_id:       form.cliente_id       || null,
      valor_contratado: form.valor_contratado  || null,
      data_inicio:      form.data_inicio       || null,
      data_fim:         form.data_fim          || null,
    }
    if (form.cliente_id) {
      const c = clientes.find(x => x.id === form.cliente_id)
      if (c) payload.cliente_nome = c.nome
    }
    let error
    if (editing) ({ error } = await supabase.from('obras').update(payload).eq('id', editing))
    else         ({ error } = await supabase.from('obras').insert(sanitize({...payload, entidade_id: entidadeAtiva?.id || null})))
    if (error) { toast(error.message, 'error'); return }
    toast('Salvo!', 'success'); setModal(false); load()
  }

  async function toggleAtivo(r) {
    await supabase.from('obras').update({ ativo: !r.ativo }).eq('id', r.id)
    load()
  }

  async function destroy() {
    await supabase.from('obra_lancamentos').delete().eq('obra_id', deleting.id)
    await supabase.from('obras').delete().eq('id', deleting.id)
    if (obraSel?.id === deleting.id) setObraSel(null)
    toast('Excluído', 'success'); setDeleting(null); load()
  }

  // ── ETAPAS ──────────────────────────────────────────────────────────────────

  function openNewEtapa(obraId) {
    setFormEtapa({ ...EMPTY_ETAPA, obra_id: obraId, ordem: (etapasDaObra(obraId).length) })
    setEditingEtapa(null)
    setModalEtapa(true)
  }
  function openEditEtapa(e) { setFormEtapa({ ...e }); setEditingEtapa(e.id); setModalEtapa(true) }

  async function saveEtapa() {
    if (!entidadeAtiva?.id) return toast('Selecione uma entidade', 'error')
    if (!formEtapa.nome?.trim()) return toast('Nome da etapa obrigatório', 'error')
    const payload = {
      ...formEtapa,
      obra_id:      formEtapa.obra_id,
      valor_orcado: formEtapa.valor_orcado || null,
      data_inicio:  formEtapa.data_inicio  || null,
      data_fim:     formEtapa.data_fim     || null,
      entidade_id:  entidadeAtiva.id,
    }
    let error
    if (editingEtapa) ({ error } = await supabase.from('obra_etapas').update(payload).eq('id', editingEtapa))
    else              ({ error } = await supabase.from('obra_etapas').insert(sanitize(payload)))
    if (error) { toast(error.message, 'error'); return }
    toast('Etapa salva!', 'success'); setModalEtapa(false); load()
  }

  async function destroyEtapa() {
    await supabase.from('obra_lancamentos').update({ etapa_id: null }).eq('etapa_id', deletingEtapa.id)
    await supabase.from('obra_etapas').delete().eq('id', deletingEtapa.id)
    toast('Etapa excluída', 'success'); setDeletingEtapa(null); load()
  }

  const fe = (k, v) => setFormEtapa(p => ({ ...p, [k]: v }))

  function selectObra(r) {
    if (obraSel?.id === r.id) { setObraSel(null) }
    else { setObraSel(r); setTabDetalhe('lancamentos') }
  }

  // ── LANÇAMENTOS ─────────────────────────────────────────────────────────────

  function openNewLanc()   { setFormLanc({ ...EMPTY_LANC }); setEditingLanc(null); setUsarItens(false); setFormItens([]); setModalLanc(true) }
  // Quando fonte muda no formulário, pré-preenche conta sugerida
  function onFonteChange(fonteId) {
    const fonte = fontes.find(f => f.id === fonteId)
    setFormLanc(prev => ({
      ...prev,
      fonte_id: fonteId,
      conta_id: fonte?.conta_id || '',
    }))
  }

  // Fontes filtradas conforme o tipo do lançamento (despesa ou receita)
  const fontesDisponiveis = fontes.filter(f => {
    if (!f.direcao || f.direcao === 'ambos') return true
    if (formLanc.tipo === 'despesa') return f.direcao === 'saida'
    if (formLanc.tipo === 'receita') return f.direcao === 'entrada'
    return true
  })

  // Quando muda o tipo do lançamento, limpa a fonte se ela não é compatível
  function onTipoChange(tipo) {
    setFormLanc(prev => {
      const fonteOk = fontes.find(f => f.id === prev.fonte_id)
      const compativel = !fonteOk || !fonteOk.direcao || fonteOk.direcao === 'ambos'
        || (tipo === 'despesa' && fonteOk.direcao === 'saida')
        || (tipo === 'receita' && fonteOk.direcao === 'entrada')
      return {
        ...prev,
        tipo,
        fonte_id: compativel ? prev.fonte_id : '',
        conta_id: compativel ? prev.conta_id : '',
      }
    })
  }
  async function openEditLanc(l) {
    setFormLanc({ ...l, imagens_url: Array.isArray(l.imagens_url) ? l.imagens_url : (l.imagens_url ? [l.imagens_url] : []) })
    setEditingLanc(l.id)
    setModalLanc(true)
    // Carrega itens estruturados já existentes deste lançamento (se houver)
    const { data: itens } = await supabase
      .from('obra_lancamento_itens')
      .select('*')
      .eq('origem_tabela', l._origem || 'obra_lancamentos')
      .eq('origem_id', l.id)
    if (itens && itens.length > 0) {
      setUsarItens(true)
      setFormItens(itens.map(it => ({
        id: it.id, produto_id: it.produto_id || '', descricao: it.descricao,
        quantidade: it.quantidade, valor_unitario: it.valor_unitario, desconta_estoque: it.desconta_estoque,
      })))
    } else {
      setUsarItens(false)
      setFormItens([])
    }
  }

  // ── Itens estruturados do lançamento (materiais) ────────────────────────────
  function addItem() {
    setFormItens(prev => [...prev, {
      id: null, produto_id: '', descricao: '', quantidade: 1, valor_unitario: 0, desconta_estoque: false,
    }])
  }
  function removeItem(idx) {
    setFormItens(prev => prev.filter((_, i) => i !== idx))
  }
  function updateItem(idx, patch) {
    setFormItens(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }
  function onProdutoItemChange(idx, produtoId) {
    const p = produtos.find(x => x.id === produtoId)
    updateItem(idx, {
      produto_id: produtoId,
      descricao: p ? p.nome : '',
      valor_unitario: p ? Number(p.preco_custo || 0) : 0,
    })
  }
  const totalItens = formItens.reduce((s, it) => s + (Number(it.quantidade || 0) * Number(it.valor_unitario || 0)), 0)

  // Retorna a fonte selecionada no formulário
  const fonteAtual = fontes.find(f => f.id === formLanc.fonte_id)

  async function saveLanc() {
    if (!entidadeAtiva?.id) return toast('Selecione uma entidade antes de salvar', 'error')
    if (!formLanc.descricao?.trim()) return toast('Descrição obrigatória', 'error')
    if (usarItens) {
      if (formItens.length === 0) return toast('Adicione pelo menos um item', 'error')
      for (const it of formItens) {
        if (it.desconta_estoque && !it.produto_id) return toast('Selecione o produto de cada item com desconto de estoque', 'error')
        if (!it.desconta_estoque && !it.descricao?.trim()) return toast('Descreva cada item que não desconta do estoque', 'error')
        if (!Number(it.quantidade) || Number(it.quantidade) <= 0) return toast('Quantidade inválida em algum item', 'error')
      }
    } else {
      if (!formLanc.valor || Number(formLanc.valor) <= 0) return toast('Valor deve ser maior que zero', 'error')
    }

    setSavingLanc(true)
    try {
      const valor = usarItens ? Number(totalItens.toFixed(2)) : Number(String(formLanc.valor).replace(',', '.'))
      const fonte = fontes.find(f => f.id === formLanc.fonte_id)

      // Fecha o buraco antigo: fonte que movimenta caixa exige conta selecionada,
      // senão o lançamento sumia silenciosamente sem ir para lugar nenhum
      if (fonte && FONTES_MOVEM_CAIXA.includes(fonte.tipo) && !formLanc.conta_id) {
        setSavingLanc(false)
        return toast('Selecione a conta para este lançamento (ou escolha uma fonte que não movimenta o caixa, como Cartão do Cliente/Outro).', 'error')
      }

      const moveCaixa = !!(fonte && FONTES_MOVEM_CAIXA.includes(fonte.tipo) && formLanc.conta_id)
      const tipoCaixa = formLanc.tipo === 'despesa' ? 'saida' : 'entrada'

      // Payload comum para a anotação informativa (Cartão do Cliente / Outro)
      const payloadInformativo = {
        obra_id:      obraSel.id,
        tipo:         formLanc.tipo,
        descricao:    formLanc.descricao,
        valor,
        pago_por:     fonte ? fonte.nome : (formLanc.pago_por || ''),
        fonte_id:     formLanc.fonte_id || null,
        conta_id:     null,
        reembolsavel: formLanc.reembolsavel,
        data_ref:     formLanc.data_ref || today(),
        obs:          formLanc.obs || null,
        etapa_id:     formLanc.etapa_id || null,
        imagens_url:  formLanc.imagens_url || [],
      }

      // Payload comum para a linha real de Caixa (modelo unificado)
      const payloadCaixa = {
        entidade_id:   entidadeAtiva?.id || null,
        data:          formLanc.data_ref || today(),
        tipo:          tipoCaixa,
        descricao:     `[Obra: ${obraSel.nome}] ${formLanc.descricao}`,
        valor,
        categoria:     'Obras',
        conta_id:      formLanc.conta_id,
        forma_pgto:    fonte?.nome || 'Outro',
        obs:           formLanc.obs || null,
        obra_id:       obraSel.id,
        obra_etapa_id: formLanc.etapa_id || null,
        fonte_id:      formLanc.fonte_id || null,
        reembolsavel:  !!formLanc.reembolsavel,
        imagens_url:   formLanc.imagens_url || [],
      }

      async function ajustaSaldo(contaId, delta) {
        if (!contaId) return
        const { data: ct } = await supabase.from('contas').select('saldo_atual').eq('id', contaId).single()
        if (ct) {
          const novoSaldo = Number(ct.saldo_atual || 0) + delta
          await supabase.from('contas').update({ saldo_atual: novoSaldo }).eq('id', contaId)
          setContas(prev => prev.map(c => c.id === contaId ? { ...c, saldo_atual: novoSaldo } : c))
        }
      }

      async function ajustaEstoque(produtoId, delta) {
        if (!produtoId) return
        const { data: p } = await supabase.from('produtos').select('estoque').eq('id', produtoId).single()
        if (p) await supabase.from('produtos').update({ estoque: Number(p.estoque || 0) + delta }).eq('id', produtoId)
      }

      // Remove os itens antigos deste lançamento (se houver) e devolve o estoque descontado
      async function limpaItensAntigos(origemTabela, origemId) {
        const { data: antigos } = await supabase.from('obra_lancamento_itens').select('*')
          .eq('origem_tabela', origemTabela).eq('origem_id', origemId)
        for (const it of (antigos || [])) {
          if (it.desconta_estoque && it.produto_id) await ajustaEstoque(it.produto_id, Number(it.quantidade))
        }
        await supabase.from('obra_lancamento_itens').delete().eq('origem_tabela', origemTabela).eq('origem_id', origemId)
      }

      // Grava os itens novos (se usarItens) e desconta o estoque
      async function gravaItensNovos(origemTabela, origemId) {
        if (!usarItens || !origemId) return
        for (const it of formItens) {
          const qtde = Number(it.quantidade || 0)
          const unit = Number(it.valor_unitario || 0)
          await supabase.from('obra_lancamento_itens').insert({
            origem_tabela: origemTabela, origem_id: origemId,
            produto_id: it.desconta_estoque ? (it.produto_id || null) : null,
            descricao: it.descricao || (produtos.find(p => p.id === it.produto_id)?.nome) || '',
            quantidade: qtde, valor_unitario: unit, valor_total: qtde * unit,
            desconta_estoque: !!it.desconta_estoque, entidade_id: entidadeAtiva?.id || null,
          })
          if (it.desconta_estoque && it.produto_id) await ajustaEstoque(it.produto_id, -qtde)
        }
      }

      let novoOrigemTabela = null, novoOrigemId = null

      if (editingLanc) {
        const anterior = Object.values(lancamentosMap).flat().find(l => l.id === editingLanc)
        // Sempre limpa os itens antigos primeiro — devolve estoque e evita duplicar
        await limpaItensAntigos(anterior?._origem || 'obra_lancamentos', editingLanc)

        if (anterior?._origem === 'caixa') {
          // ── Editando uma linha real de Caixa ──────────────────────────────
          if (moveCaixa) {
            // Continua movimentando caixa: atualiza e reconcilia o saldo
            const { error } = await supabase.from('caixa').update(payloadCaixa).eq('id', editingLanc)
            if (error) { toast(error.message, 'error'); setSavingLanc(false); return }

            const deltaReverso = anterior.tipo === 'receita' ? -Number(anterior.valor) : Number(anterior.valor)
            await ajustaSaldo(anterior.conta_id, deltaReverso)
            const deltaNovo = tipoCaixa === 'entrada' ? valor : -valor
            await ajustaSaldo(formLanc.conta_id, deltaNovo)
            novoOrigemTabela = 'caixa'; novoOrigemId = editingLanc
          } else {
            // Mudou para fonte informativa: sai do Caixa e vira anotação
            const deltaReverso = anterior.tipo === 'receita' ? -Number(anterior.valor) : Number(anterior.valor)
            await ajustaSaldo(anterior.conta_id, deltaReverso)
            await supabase.from('caixa').delete().eq('id', editingLanc)
            const { data: novaAnotacao, error } = await supabase.from('obra_lancamentos').insert(sanitize({ ...payloadInformativo, entidade_id: entidadeAtiva?.id || null })).select().single()
            if (error) { toast(error.message, 'error'); setSavingLanc(false); return }
            novoOrigemTabela = 'obra_lancamentos'; novoOrigemId = novaAnotacao?.id
          }
        } else {
          // ── Editando uma anotação informativa (ou registro histórico) ─────
          if (moveCaixa) {
            // Virou fonte que movimenta caixa: sai da anotação e nasce como Caixa real
            await supabase.from('obra_lancamentos').delete().eq('id', editingLanc)
            const { data: caixaRow, error } = await supabase.from('caixa').insert(payloadCaixa).select().single()
            if (error) { toast(error.message, 'error'); setSavingLanc(false); return }
            if (caixaRow) await ajustaSaldo(formLanc.conta_id, tipoCaixa === 'entrada' ? valor : -valor)
            novoOrigemTabela = 'caixa'; novoOrigemId = caixaRow?.id
          } else {
            // Continua informativa: update simples
            const { error } = await supabase.from('obra_lancamentos').update(payloadInformativo).eq('id', editingLanc)
            if (error) { toast(error.message, 'error'); setSavingLanc(false); return }
            novoOrigemTabela = 'obra_lancamentos'; novoOrigemId = editingLanc
          }
        }

      } else {
        // ── Novo lançamento ──────────────────────────────────────────────────
        if (moveCaixa) {
          const { data: caixaRow, error } = await supabase.from('caixa').insert(payloadCaixa).select().single()
          if (error) { toast(error.message, 'error'); setSavingLanc(false); return }
          if (caixaRow) await ajustaSaldo(formLanc.conta_id, tipoCaixa === 'entrada' ? valor : -valor)
          novoOrigemTabela = 'caixa'; novoOrigemId = caixaRow?.id
        } else {
          const { data: novaAnotacao, error } = await supabase.from('obra_lancamentos').insert(sanitize({ ...payloadInformativo, entidade_id: entidadeAtiva?.id || null })).select().single()
          if (error) { toast(error.message, 'error'); setSavingLanc(false); return }
          novoOrigemTabela = 'obra_lancamentos'; novoOrigemId = novaAnotacao?.id
        }
      }

      // Sincroniza os itens estruturados (materiais) no lançamento recém salvo
      await gravaItensNovos(novoOrigemTabela, novoOrigemId)

      toast('Lançamento salvo!', 'success')
      setModalLanc(false)
      load()
    } catch (e) {
      toast('Erro inesperado: ' + e.message, 'error')
    } finally {
      setSavingLanc(false)
    }
  }

  async function destroyLanc() {
    const lanc = deletingLanc

    // Remove os itens estruturados vinculados e devolve o estoque descontado
    const origemTabelaItens = lanc._origem || 'obra_lancamentos'
    const { data: itensLigados } = await supabase.from('obra_lancamento_itens').select('*')
      .eq('origem_tabela', origemTabelaItens).eq('origem_id', lanc.id)
    for (const it of (itensLigados || [])) {
      if (it.desconta_estoque && it.produto_id) {
        const { data: p } = await supabase.from('produtos').select('estoque').eq('id', it.produto_id).single()
        if (p) await supabase.from('produtos').update({ estoque: Number(p.estoque || 0) + Number(it.quantidade) }).eq('id', it.produto_id)
      }
    }
    await supabase.from('obra_lancamento_itens').delete().eq('origem_tabela', origemTabelaItens).eq('origem_id', lanc.id)

    if (lanc._origem === 'caixa') {
      // ── É uma linha real de Caixa — reverte o saldo antes de excluir ──────
      if (lanc.conta_id) {
        const { data: ct } = await supabase.from('contas').select('saldo_atual').eq('id', lanc.conta_id).single()
        if (ct) {
          const delta = lanc.tipo === 'receita' ? -Number(lanc.valor) : Number(lanc.valor)
          const novoSaldo = Number(ct.saldo_atual || 0) + delta
          await supabase.from('contas').update({ saldo_atual: novoSaldo }).eq('id', lanc.conta_id)
          setContas(prev => prev.map(c => c.id === lanc.conta_id ? { ...c, saldo_atual: novoSaldo } : c))
        }
      }
      await supabase.from('caixa').delete().eq('id', lanc.id)
    } else {
      // ── Anotação informativa (ou registro histórico ainda não migrado) ────
      // Mantém o fallback antigo por segurança — cobre casos legados com caixa_id
      if (lanc.caixa_id) {
        const { data: caixaRow } = await supabase.from('caixa').select('valor,tipo,conta_id').eq('id', lanc.caixa_id).single()
        if (caixaRow) {
          await supabase.from('caixa').delete().eq('id', lanc.caixa_id)
          const conta = contas.find(c => c.id === caixaRow.conta_id)
          if (conta) {
            const delta = caixaRow.tipo === 'saida' ? Number(caixaRow.valor) : -Number(caixaRow.valor)
            const novoSaldo = Number(conta.saldo_atual || 0) + delta
            await supabase.from('contas').update({ saldo_atual: novoSaldo }).eq('id', caixaRow.conta_id)
            setContas(prev => prev.map(c => c.id === caixaRow.conta_id ? { ...c, saldo_atual: novoSaldo } : c))
          }
        }
      }
      await supabase.from('obra_lancamentos').delete().eq('id', lanc.id)
    }

    toast('Excluído — saldo ajustado', 'success'); setDeletingLanc(null); load()
  }

  const f  = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const fl = (k, v) => setFormLanc(p => ({ ...p, [k]: v }))

  // Exposição do modal de foto para PainelDetalhe (filho sem prop drilling)
  React.useEffect(() => {
    window.__obrasFotoModal = (fotos) => { setFotoIdx(0); setFotoModal(fotos) }
    return () => { delete window.__obrasFotoModal }
  }, [])

  return (
    <div>
      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 16 }}>
        <div className="stat-card blue">
          <div className="stat-label">Total Contratos</div>
          <div className="stat-value blue text-mono">{fmt(totalContratado)}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Total Recebido</div>
          <div className="stat-value green text-mono">{fmt(totalRecebido)}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Total Gastos</div>
          <div className="stat-value red text-mono">{fmt(totalGasto)}</div>
        </div>
        <div className={`stat-card ${totalMargem >= 0 ? 'green' : 'red'}`}>
          <div className="stat-label">Margem (rec. − gastos)</div>
          <div className={`stat-value ${totalMargem >= 0 ? 'green' : 'red'} text-mono`}>{fmt(totalMargem)}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-wrap">
          <Search size={14} />
          <input className="search-input" placeholder="Buscar obra, cliente..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUS_OBRA.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showArquivados} onChange={e => setShowArquivados(e.target.checked)} style={{ width: 14, height: 14 }} />
          Mostrar arquivados
        </label>
        {pode('lancar') && <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Nova Obra</button>}
      </div>

      {/* Tabela de obras */}
      <div className="card">
        {loading
          ? <div className="loading"><div className="spinner" /></div>
          : filtered.length === 0
            ? <div className="empty-state"><HardHat size={40} /><p>Nenhuma obra registrada</p></div>
            : <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th><th>Cliente</th><th>Status</th>
                      <th>Contratado</th><th>Recebido</th><th>Gasto</th><th>Margem</th>
                      <th>Início</th><th>Fim</th><th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => {
                      const gasto     = gastoObra(r.id)
                      const recebido  = recebidoObra(r.id)
                      const contrat   = Number(r.valor_contratado || 0)
                      const margem    = recebido - gasto
                      const pct       = pctGasto(contrat, gasto)
                      const alerta    = contrat > 0 && pct >= 80
                      const estourou  = contrat > 0 && gasto > contrat
                      const isOpen    = obraSel?.id === r.id
                      return (
                        <React.Fragment key={r.id}>
                          <tr
                            style={{ opacity: r.ativo ? 1 : .5, background: isOpen ? 'var(--bg3)' : undefined, cursor: 'pointer' }}
                            onClick={() => selectObra(r)}
                          >
                            <td className="font-bold">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {isOpen ? <ChevronUp size={13} color="var(--accent)" /> : <ChevronDown size={13} color="var(--text3)" />}
                                {r.nome}
                              </div>
                            </td>
                            <td className="text-muted">{r.cliente_nome || '—'}</td>
                            <td><span className={`badge ${STATUS_COLOR[r.status] || 'badge-gray'}`}>{STATUS_LABEL[r.status] || r.status}</span></td>
                            <td className="text-mono font-bold">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {r.valor_contratado ? fmt(r.valor_contratado) : '—'}
                                {estourou && <span title="Orçamento estourado!" style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--red)', borderRadius: 4, padding: '1px 5px' }}>!</span>}
                                {alerta && !estourou && <span title={`${Math.round(pct)}% do orçamento usado`} style={{ fontSize: 10, fontWeight: 700, color: 'var(--yellow)', border: '1px solid var(--yellow)', borderRadius: 4, padding: '1px 5px' }}>{Math.round(pct)}%</span>}
                              </div>
                            </td>
                            <td className="text-mono" style={{ color: recebido > 0 ? 'var(--green)' : 'var(--text3)', fontSize: 12 }}>{recebido > 0 ? fmt(recebido) : '—'}</td>
                            <td className="text-mono" style={{ color: gasto > 0 ? 'var(--red)' : 'var(--text3)', fontSize: 12 }}>{fmt(gasto)}</td>
                            <td className="text-mono" style={{ color: margem >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 12, fontWeight: 700 }}>
                              {recebido > 0 || gasto > 0 ? fmt(margem) : '—'}
                            </td>
                            <td className="text-muted" style={{ fontSize: 12 }}>{fmtDate(r.data_inicio)}</td>
                            <td className="text-muted" style={{ fontSize: 12 }}>{fmtDate(r.data_fim)}</td>
                            <td onClick={e => e.stopPropagation()}>
                              <div className="action-btns">
                                <button className="icon-btn edit"   onClick={() => openEdit(r)} title="Editar"><Pencil size={14} /></button>
                                <button className="icon-btn" onClick={() => compartilharObra(r)} title="Compartilhar com cliente" style={{ color: r.token_publico ? 'var(--green)' : 'var(--text3)' }}><Share2 size={14} /></button>
                                <button className="icon-btn toggle" onClick={() => toggleAtivo(r)}><Power size={14} /></button>
                                <button className="icon-btn del"    onClick={() => setDeleting(r)}><Trash2 size={14} /></button>
                              </div>
                            </td>
                          </tr>

                          {/* Painel de detalhe — expande inline */}
                          {isOpen && (
                            <tr>
                              <td colSpan={10} style={{ padding: 0, background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
                                <PainelDetalhe
                                  obra={r}
                                  lancs={lancsDaObra(r.id)}
                                  etapas={etapasDaObra(r.id)}
                                  fontes={fontes}
                                  empresa={empresa}
                                  tab={tabDetalhe}
                                  onTab={setTabDetalhe}
                                  onNewLanc={openNewLanc}
                                  onEditLanc={openEditLanc}
                                  onDeleteLanc={setDeletingLanc}
                                  onNewEtapa={() => openNewEtapa(r.id)}
                                  onEditEtapa={openEditEtapa}
                                  onDeleteEtapa={setDeletingEtapa}
                                  etapaExpanded={etapaExpanded}
                                  onEtapaExpand={setEtapaExpanded}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
        }
      </div>

      {/* Modal Obra */}
      {modal && (
        <Modal title={editing ? 'Editar Obra' : 'Nova Obra'} onClose={() => setModal(false)} onSave={save} size="modal-lg">
          <div className="form-grid form-grid-2">
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Nome da Obra *</label>
              <input className="form-input" value={form.nome} onChange={e => f('nome', e.target.value)}
                placeholder="Ex: Reforma Cozinha, Construção Quarto..." autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Cliente</label>
              <select className="form-select" value={form.cliente_id} onChange={e => f('cliente_id', e.target.value)}>
                <option value="">Selecionar...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e => f('status', e.target.value)}>
                {STATUS_OBRA.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Valor Contratado</label>
              <input className="form-input" type="number" step="0.01" value={form.valor_contratado}
                onChange={e => f('valor_contratado', e.target.value)} placeholder="0,00" />
            </div>
            <div className="form-group">
              <label className="form-label">Data de Início</label>
              <input className="form-input" type="date" value={form.data_inicio} onChange={e => f('data_inicio', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Data de Conclusão</label>
              <input className="form-input" type="date" value={form.data_fim} onChange={e => f('data_fim', e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Observações</label>
              <textarea className="form-textarea" value={form.obs || ''} onChange={e => f('obs', e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Lançamento */}
      {modalLanc && (
        <Modal
          title={editingLanc ? 'Editar Lançamento' : 'Novo Lançamento'}
          onClose={() => setModalLanc(false)}
          onSave={saveLanc}
        >
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Tipo *</label>
              <select className="form-select" value={formLanc.tipo} onChange={e => onTipoChange(e.target.value)}>
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Valor (R$) *</label>
              <input className="form-input" type="number" step="0.01"
                value={usarItens ? totalItens.toFixed(2) : formLanc.valor}
                readOnly={usarItens}
                onChange={e => fl('valor', e.target.value)} placeholder="0,00"
                style={usarItens ? { background: 'var(--bg3)', color: 'var(--text2)' } : {}} />
              {usarItens && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text3)' }}>Soma automática dos itens abaixo</div>}
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Descrição *</label>
              <input className="form-input" value={formLanc.descricao} onChange={e => fl('descricao', e.target.value)}
                placeholder="Ex: Material elétrico, Mão de obra..." autoFocus />
            </div>

            {formLanc.tipo === 'despesa' && (
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={usarItens}
                    onChange={e => { setUsarItens(e.target.checked); if (e.target.checked && formItens.length === 0) addItem() }}
                    style={{ width: 15, height: 15 }} />
                  Detalhar itens (materiais comprados)
                </label>
              </div>
            )}

            {usarItens && (
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  {formItens.map((it, idx) => (
                    <div key={idx} style={{ padding: 10, borderBottom: idx < formItens.length - 1 ? '1px solid var(--border)' : 'none', background: 'var(--bg2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, flex: 1 }}>
                          <input type="checkbox" checked={it.desconta_estoque}
                            onChange={e => updateItem(idx, { desconta_estoque: e.target.checked, produto_id: e.target.checked ? it.produto_id : '', descricao: e.target.checked ? it.descricao : '' })}
                            style={{ width: 14, height: 14 }} />
                          Descontar do estoque
                        </label>
                        <button type="button" className="icon-btn del" onClick={() => removeItem(idx)}><Trash2 size={13} /></button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: it.desconta_estoque ? '2fr 1fr 1fr 1fr' : '2fr 1fr 1fr 1fr', gap: 8 }}>
                        {it.desconta_estoque ? (
                          <select className="form-select" style={{ fontSize: 12 }} value={it.produto_id}
                            onChange={e => onProdutoItemChange(idx, e.target.value)}>
                            <option value="">Selecionar produto...</option>
                            {produtos.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.estoque || 0} {p.unidade})</option>)}
                          </select>
                        ) : (
                          <input className="form-input" style={{ fontSize: 12 }} value={it.descricao}
                            onChange={e => updateItem(idx, { descricao: e.target.value })}
                            placeholder="Descrição (compra avulsa)" />
                        )}
                        <input className="form-input" style={{ fontSize: 12 }} type="number" step="0.01" min="0" value={it.quantidade}
                          onChange={e => updateItem(idx, { quantidade: e.target.value })} placeholder="Qtde" />
                        <input className="form-input" style={{ fontSize: 12 }} type="number" step="0.01" min="0" value={it.valor_unitario}
                          onChange={e => updateItem(idx, { valor_unitario: e.target.value })} placeholder="Unit." />
                        <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>
                          {fmt(Number(it.quantidade || 0) * Number(it.valor_unitario || 0))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={addItem}>
                  <Plus size={13} /> Adicionar item
                </button>
                <div style={{ marginTop: 8, textAlign: 'right', fontSize: 13, fontWeight: 700 }}>
                  Total: <span style={{ fontFamily: 'monospace' }}>{fmt(totalItens)}</span>
                </div>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Fonte de Pagamento</label>
              <select className="form-select" value={formLanc.fonte_id} onChange={e => onFonteChange(e.target.value)}>
                <option value="">Selecionar...</option>
                {fontesDisponiveis.map(fp => (
                  <option key={fp.id} value={fp.id}>{fp.nome}</option>
                ))}
              </select>
              {!formLanc.fonte_id && fontes.length !== fontesDisponiveis.length && (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--yellow)' }}>
                  <AlertCircle size={12} /> Fonte anterior incompatível com {formLanc.tipo === 'despesa' ? 'despesa' : 'receita'} — selecione outra
                </div>
              )}
              {fonteAtual && fonteAtual.tipo === FONTE_NAO_CAIXA && (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--yellow)' }}>
                  <AlertCircle size={12} /> Cartão do cliente — não gera lançamento no caixa
                </div>
              )}
            </div>
            {/* Conta — só aparece quando a fonte movimenta caixa */}
            {fonteAtual && FONTES_MOVEM_CAIXA.includes(fonteAtual.tipo) && (
              <div className="form-group">
                <label className="form-label">Conta *</label>
                <select className="form-select" value={formLanc.conta_id} onChange={e => fl('conta_id', e.target.value)}>
                  <option value="">Selecionar conta...</option>
                  {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                {formLanc.conta_id
                  ? <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--green)' }}>
                      <CheckCircle size={12} /> Vai gerar lançamento no caixa automaticamente
                    </div>
                  : <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--yellow)' }}>
                      <AlertCircle size={12} /> Selecione a conta para registrar no caixa
                    </div>
                }
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Data</label>
              <input className="form-input" type="date" value={formLanc.data_ref} onChange={e => fl('data_ref', e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={formLanc.reembolsavel} onChange={e => fl('reembolsavel', e.target.checked)} style={{ width: 15, height: 15 }} />
                Reembolsável (cliente deve ressarcir)
              </label>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <UploadComprovante
                value={formLanc.imagens_url || []}
                onChange={urls => fl('imagens_url', urls)}
                pasta="obras"
                maxFotos={5}
              />
            </div>
            {/* Etapa — só aparece se a obra tem etapas */}
            {obraSel && etapasDaObra(obraSel.id).length > 0 && (
              <div className="form-group">
                <label className="form-label">Etapa (opcional)</label>
                <select className="form-select" value={formLanc.etapa_id || ''} onChange={e => fl('etapa_id', e.target.value)}>
                  <option value="">Sem etapa específica</option>
                  {etapasDaObra(obraSel.id).map(et => (
                    <option key={et.id} value={et.id}>{et.nome}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Observações</label>
              <textarea className="form-textarea" value={formLanc.obs || ''} onChange={e => fl('obs', e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Etapa */}
      {modalEtapa && (
        <Modal title={editingEtapa ? 'Editar Etapa' : 'Nova Etapa'} onClose={() => setModalEtapa(false)} onSave={saveEtapa}>
          <div className="form-grid form-grid-2">
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Nome da Etapa *</label>
              <input className="form-input" value={formEtapa.nome} onChange={e => fe('nome', e.target.value)}
                placeholder="Ex: Demolição, Elétrica, Revestimento..." autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Valor Orçado</label>
              <input className="form-input" type="number" step="0.01" value={formEtapa.valor_orcado || ''}
                onChange={e => fe('valor_orcado', e.target.value)} placeholder="0,00" />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={formEtapa.status} onChange={e => fe('status', e.target.value)}>
                {STATUS_ETAPA.map(s => <option key={s} value={s}>{LETAPA_LABEL[s]}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Data Início</label>
              <input className="form-input" type="date" value={formEtapa.data_inicio || ''} onChange={e => fe('data_inicio', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Data Fim Previsto</label>
              <input className="form-input" type="date" value={formEtapa.data_fim || ''} onChange={e => fe('data_fim', e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Descrição</label>
              <textarea className="form-textarea" value={formEtapa.descricao || ''} onChange={e => fe('descricao', e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          message={`Excluir a obra "${deleting.nome}"? Todos os lançamentos vinculados também serão removidos.`}
          onConfirm={destroy} onCancel={() => setDeleting(null)} />
      )}
      {deletingEtapa && (
        <ConfirmDialog
          message={`Excluir a etapa "${deletingEtapa.nome}"? Os lançamentos vinculados a ela perderão a referência de etapa.`}
          onConfirm={destroyEtapa} onCancel={() => setDeletingEtapa(null)} />
      )}

      {deletingLanc && (
        <ConfirmDialog
          message={`Excluir o lançamento "${deletingLanc.descricao}"?${deletingLanc.caixa_id ? '\n\nAtenção: o lançamento correspondente no Caixa também será removido e o saldo da conta será revertido.' : ''}`}
          onConfirm={destroyLanc} onCancel={() => setDeletingLanc(null)} />
      )}

      {/* Modal lightbox foto/comprovante — suporta galeria de até 5 fotos */}
      {fotoModal && (() => {
        const fotos = Array.isArray(fotoModal) ? fotoModal : [fotoModal]
        const idx   = Math.min(fotoIdx, fotos.length - 1)
        return (
          <div onClick={() => { setFotoModal(null); setFotoIdx(0) }}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={e => e.stopPropagation()} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              {/* Fechar */}
              <button onClick={() => { setFotoModal(null); setFotoIdx(0) }}
                style={{ position: 'absolute', top: -14, right: -14, zIndex: 1, width: 32, height: 32, borderRadius: '50%', background: 'var(--bg2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={15} />
              </button>
              {/* Imagem */}
              <img src={fotos[idx]} alt={`Comprovante ${idx + 1}`}
                style={{ maxWidth: '82vw', maxHeight: '78vh', borderRadius: 12, objectFit: 'contain' }} />
              {/* Navegação — só aparece se houver mais de 1 foto */}
              {fotos.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={() => setFotoIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
                    style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: idx === 0 ? 'var(--text3)' : 'var(--text)', cursor: idx === 0 ? 'default' : 'pointer', fontSize: 13 }}>
                    ‹ Ant.
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>{idx + 1} / {fotos.length}</span>
                  <button onClick={() => setFotoIdx(i => Math.min(fotos.length - 1, i + 1))} disabled={idx === fotos.length - 1}
                    style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: idx === fotos.length - 1 ? 'var(--text3)' : 'var(--text)', cursor: idx === fotos.length - 1 ? 'default' : 'pointer', fontSize: 13 }}>
                    Próx. ›
                  </button>
                </div>
              )}
              {/* Thumbnails */}
              {fotos.length > 1 && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {fotos.map((f, i) => (
                    <img key={i} src={f} alt={`Foto ${i+1}`} onClick={() => setFotoIdx(i)}
                      style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6, cursor: 'pointer',
                        border: i === idx ? '2px solid var(--accent)' : '2px solid transparent', opacity: i === idx ? 1 : 0.6 }} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Painel de detalhe da obra (lançamentos + relatório) ──────────────────────

function PainelDetalhe({ obra, lancs, etapas, fontes, empresa, tab, onTab, onNewLanc, onEditLanc, onDeleteLanc, onNewEtapa, onEditEtapa, onDeleteEtapa, etapaExpanded, onEtapaExpand }) {
  const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

  // Agrupa lançamentos por fonte de pagamento para o relatório
  const relatorio = useMemo(() => {
    const grupos = {}
    for (const l of lancs) {
      const chave = l.pago_por || 'Sem fonte'
      if (!grupos[chave]) grupos[chave] = { nome: chave, despesas: 0, receitas: 0, reembolsavel: 0, lancamentos: [] }
      if (l.tipo === 'despesa') grupos[chave].despesas += Number(l.valor || 0)
      else                      grupos[chave].receitas  += Number(l.valor || 0)
      if (l.reembolsavel)       grupos[chave].reembolsavel += Number(l.valor || 0)
      grupos[chave].lancamentos.push(l)
    }
    return Object.values(grupos)
  }, [lancs])

  const totalDespesas    = lancs.filter(l => l.tipo === 'despesa').reduce((s, l) => s + Number(l.valor || 0), 0)
  const totalReceitas    = lancs.filter(l => l.tipo === 'receita').reduce((s, l) => s + Number(l.valor || 0), 0)
  const totalReembolsavel = lancs.filter(l => l.reembolsavel).reduce((s, l) => s + Number(l.valor || 0), 0)
  const valorContratado  = Number(obra.valor_contratado || 0)
  const saldoObra        = valorContratado - totalDespesas

  return (
    <div style={{ padding: '14px 20px' }}>
      {/* Header do painel */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)' }}>
          {obra.nome}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg3)', borderRadius: 8, padding: 3 }}>
            {[
              { id: 'lancamentos', label: 'Lançamentos' },
              { id: 'etapas',      label: `Etapas${etapas.length > 0 ? ` (${etapas.length})` : ''}` },
              { id: 'relatorio',   label: 'Relatório Final' },
            ].map(t => (
              <button key={t.id} onClick={() => onTab(t.id)}
                style={{
                  padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, transition: 'all .15s',
                  background: tab === t.id ? 'var(--accent)' : 'transparent',
                  color: tab === t.id ? '#fff' : 'var(--text2)',
                }}>
                {t.label}
              </button>
            ))}
          </div>
          {tab !== 'etapas' && (
            <button className="btn btn-primary btn-sm" onClick={onNewLanc}>
              <Plus size={13} /> Novo Lançamento
            </button>
          )}
          {tab === 'etapas' && (
            <button className="btn btn-primary btn-sm" onClick={onNewEtapa}>
              <Plus size={13} /> Nova Etapa
            </button>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={async () => {
              const ids = lancs.map(l => l.id)
              const { data: itens } = ids.length > 0
                ? await supabase.from('obra_lancamento_itens').select('*').in('origem_id', ids)
                : { data: [] }
              const itensPorLancamento = {}
              for (const it of (itens || [])) {
                if (!itensPorLancamento[it.origem_id]) itensPorLancamento[it.origem_id] = []
                itensPorLancamento[it.origem_id].push(it)
              }
              imprimirRelatorioObra({ obra, lancamentos: lancs, etapas, empresa, itensPorLancamento })
            }}
            title="Imprimir / Salvar PDF"
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            🖨️ Imprimir
          </button>
        </div>
      </div>

      {tab === 'lancamentos' && (
        <>
          {lancs.length === 0
            ? <div style={{ color: 'var(--text3)', fontSize: 13, padding: '4px 0' }}>Nenhum lançamento registrado.</div>
            : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg3)' }}>
                    {['Tipo', 'Descrição', 'Valor', 'Fonte / Pago por', 'Reemb.', 'Foto', 'Caixa', 'Data', ''].map((h, i) => (
                      <th key={i} style={{
                        padding: '7px 10px', fontSize: 10, textAlign: i === 2 ? 'right' : i === 4 || i === 5 || i === 6 ? 'center' : 'left',
                        color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase'
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lancs.map(l => (
                    <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '7px 10px' }}>
                        <span className={`badge ${l.tipo === 'despesa' ? 'badge-red' : 'badge-green'}`} style={{ fontSize: 10 }}>
                          {l.tipo === 'despesa' ? 'Despesa' : 'Receita'}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px', fontSize: 13, fontWeight: 600 }}>{l.descricao}</td>
                      <td style={{ padding: '7px 10px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: l.tipo === 'despesa' ? 'var(--red)' : 'var(--green)' }}>
                        {fmt(l.valor)}
                      </td>
                      <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text2)' }}>{l.pago_por || '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                        {l.reembolsavel
                          ? <CheckCircle size={13} color="var(--green)" />
                          : <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                        {(() => {
                          const fotos = Array.isArray(l.imagens_url) ? l.imagens_url : (l.imagens_url ? [l.imagens_url] : [])
                          return fotos.length > 0
                            ? <button onClick={() => window.__obrasFotoModal?.(fotos)}
                                style={{ background: 'rgba(79,142,247,.1)', border: 'none', borderRadius: 6, padding: '3px 7px', cursor: 'pointer', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
                                <Camera size={11} /> {fotos.length}
                              </button>
                            : <span style={{ color: 'var(--text3)', fontSize: 10 }}>—</span>
                        })()}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                        {l.caixa_id
                          ? <span title="Lançado no caixa" style={{ color: 'var(--green)', fontSize: 10, fontWeight: 700 }}>✓ Caixa</span>
                          : <span style={{ color: 'var(--text3)', fontSize: 10 }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text2)' }}>{fmtDate(l.data_ref)}</td>
                      <td style={{ padding: '4px 10px' }}>
                        <div className="action-btns">
                          <button className="icon-btn edit" onClick={() => onEditLanc(l)}><Pencil size={13} /></button>
                          <button className="icon-btn del"  onClick={() => onDeleteLanc(l)}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </>
      )}

      {tab === 'etapas' && (
        <PainelEtapas
          obra={obra}
          etapas={etapas}
          lancs={lancs}
          expanded={etapaExpanded}
          onExpand={onEtapaExpand}
          onEdit={onEditEtapa}
          onDelete={onDeleteEtapa}
          onNewLanc={onNewLanc}
        />
      )}

      {tab === 'relatorio' && (
        <div>
          {/* Sumário geral */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
            <RelatCard label="Contratado" value={valorContratado} color="var(--accent)" />
            <RelatCard label="Total despesas" value={totalDespesas} color="var(--red)" />
            <RelatCard label="Total receitas" value={totalReceitas} color="var(--green)" />
            <RelatCard label="Saldo da obra" value={saldoObra} color={saldoObra >= 0 ? 'var(--green)' : 'var(--red)'} />
          </div>

          {totalReembolsavel > 0 && (
            <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.25)', borderRadius: 8, fontSize: 13 }}>
              <strong style={{ color: 'var(--yellow)' }}>Reembolsável pelo cliente:</strong>{' '}
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmt(totalReembolsavel)}</span>
            </div>
          )}

          {/* Por fonte de pagamento */}
          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
            Por Fonte de Pagamento
          </div>

          {relatorio.length === 0
            ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>Nenhum lançamento registrado.</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {relatorio.map((g, i) => (
                  <div key={i} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Wallet size={13} color="var(--accent)" />
                        {g.nome}
                      </div>
                      <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
                        {g.despesas > 0 && (
                          <span style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                            − {fmt(g.despesas)}
                          </span>
                        )}
                        {g.receitas > 0 && (
                          <span style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                            + {fmt(g.receitas)}
                          </span>
                        )}
                        {g.reembolsavel > 0 && (
                          <span style={{ color: 'var(--yellow)', fontSize: 11 }}>
                            reemb.: {fmt(g.reembolsavel)}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Mini-lista de lançamentos do grupo */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {g.lancamentos.map(l => (
                        <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)', paddingLeft: 6 }}>
                          <span>{fmtDate(l.data_ref)} — {l.descricao}{l.reembolsavel ? ' ♻' : ''}</span>
                          <span style={{ fontFamily: 'var(--mono)', color: l.tipo === 'despesa' ? 'var(--red)' : 'var(--green)' }}>
                            {l.tipo === 'despesa' ? '−' : '+'} {fmt(l.valor)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
          }

          {/* Acerto final */}
          {valorContratado > 0 && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: saldoObra >= 0 ? 'rgba(52,211,153,.07)' : 'rgba(248,113,113,.07)', border: `1px solid ${saldoObra >= 0 ? 'rgba(52,211,153,.25)' : 'rgba(248,113,113,.25)'}`, borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Acerto final</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                  Contratado {fmt(valorContratado)} − Gastos {fmt(totalDespesas)}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 16, color: saldoObra >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {saldoObra >= 0 ? '+' : ''}{fmt(saldoObra)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Painel de Etapas ─────────────────────────────────────────────────────────

function PainelEtapas({ obra, etapas, lancs, expanded, onExpand, onEdit, onDelete, onNewLanc }) {
  const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

  // Estatísticas gerais
  const totalOrcado    = etapas.reduce((s, e) => s + Number(e.valor_orcado || 0), 0)
  const totalRealizado = lancs.filter(l => l.tipo === 'despesa').reduce((s, l) => s + Number(l.valor || 0), 0)
  const totalSaldo     = totalOrcado - totalRealizado
  const concluidas     = etapas.filter(e => e.status === 'concluida').length
  const progresso      = etapas.length > 0 ? Math.round((concluidas / etapas.length) * 100) : 0

  // Lançamentos por etapa
  const lancsPorEtapa = (etapaId) => lancs.filter(l => l.etapa_id === etapaId)
  const gastoPorEtapa = (etapaId) => lancsPorEtapa(etapaId)
    .filter(l => l.tipo === 'despesa').reduce((s, l) => s + Number(l.valor || 0), 0)

  if (etapas.length === 0) return (
    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
      Nenhuma etapa cadastrada. Clique em "Nova Etapa" para começar.
    </div>
  )

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Orçado total',  value: totalOrcado,    color: 'var(--accent)' },
          { label: 'Realizado',     value: totalRealizado, color: 'var(--red)'    },
          { label: 'Saldo',         value: totalSaldo,     color: totalSaldo >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Progresso',     value: null,           color: 'var(--accent)' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{s.label}</div>
            {s.value !== null
              ? <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, color: s.color }}>{fmt(s.value)}</div>
              : <div>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, color: s.color }}>{progresso}%</div>
                  <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progresso}%`, background: 'var(--accent)', borderRadius: 2 }} />
                  </div>
                </div>
            }
          </div>
        ))}
      </div>

      {/* Lista de etapas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {etapas.map(etapa => {
          const isOpen  = expanded === etapa.id
          const gasto   = gastoPorEtapa(etapa.id)
          const orcado  = Number(etapa.valor_orcado || 0)
          const saldo   = orcado - gasto
          const lancEtapa = lancsPorEtapa(etapa.id)
          const pct     = orcado > 0 ? Math.min(100, Math.round((gasto / orcado) * 100)) : 0
          const alerta  = orcado > 0 && pct >= 80 && pct < 100
          const estourou = orcado > 0 && gasto > orcado

          return (
            <div key={etapa.id} style={{ background: 'var(--bg2)', border: `1px solid ${isOpen ? 'var(--border2)' : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden' }}>
              {/* Linha da etapa */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
                onClick={() => onExpand(isOpen ? null : etapa.id)}>
                {isOpen ? <ChevronUp size={13} color="var(--accent)" /> : <ChevronDown size={13} color="var(--text3)" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{etapa.nome}</span>
                    <span className={`badge ${LETAPA_COLOR[etapa.status]}`} style={{ fontSize: 10 }}>{LETAPA_LABEL[etapa.status]}</span>
                    {estourou && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--red)', borderRadius: 4, padding: '1px 5px' }}>!</span>}
                    {alerta && !estourou && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--yellow)', border: '1px solid var(--yellow)', borderRadius: 4, padding: '1px 5px' }}>{pct}%</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    {lancEtapa.length} lançamento{lancEtapa.length !== 1 ? 's' : ''}
                    {etapa.data_inicio && ` · iniciada ${fmtDate(etapa.data_inicio)}`}
                  </div>
                </div>
                {/* Valores */}
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                  {orcado > 0 && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>Orçado</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>{fmt(orcado)}</div>
                    </div>
                  )}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>Realizado</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: gasto > 0 ? 'var(--red)' : 'var(--text3)' }}>{fmt(gasto)}</div>
                  </div>
                  {orcado > 0 && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>Saldo</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: saldo >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(saldo)}</div>
                    </div>
                  )}
                </div>
                {/* Ações */}
                <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4 }}>
                  <button className="icon-btn edit" onClick={() => onEdit(etapa)}><Pencil size={13} /></button>
                  <button className="icon-btn del"  onClick={() => onDelete(etapa)}><Trash2 size={13} /></button>
                </div>
              </div>

              {/* Barra de progresso */}
              {orcado > 0 && (
                <div style={{ height: 3, background: 'var(--bg3)', margin: '0 14px 8px' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: estourou ? 'var(--red)' : alerta ? 'var(--yellow)' : 'var(--accent)', transition: 'width .3s' }} />
                </div>
              )}

              {/* Lançamentos da etapa */}
              {isOpen && (
                <div style={{ background: 'var(--bg3)', borderTop: '1px solid var(--border)', padding: '12px 14px' }}>
                  {lancEtapa.length === 0
                    ? <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>Nenhum lançamento nesta etapa.</div>
                    : <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                        {lancEtapa.map(l => (
                          <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                            <div>
                              <span style={{ fontWeight: 500 }}>{l.descricao}</span>
                              <span style={{ color: 'var(--text3)', marginLeft: 8 }}>{fmtDate(l.data_ref)}</span>
                              {l.pago_por && <span style={{ color: 'var(--text3)', marginLeft: 6, fontSize: 11 }}>· {l.pago_por}</span>}
                            </div>
                            <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: l.tipo === 'despesa' ? 'var(--red)' : 'var(--green)', flexShrink: 0 }}>
                              {l.tipo === 'despesa' ? '−' : '+'} {fmt(l.valor)}
                            </span>
                          </div>
                        ))}
                      </div>
                  }
                  <button className="btn btn-primary btn-sm" onClick={onNewLanc} style={{ fontSize: 11 }}>
                    <Plus size={12} /> Lançamento nesta etapa
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}


function RelatCard({ label, value, color }) {
  const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, color }}>{fmt(value)}</div>
    </div>
  )
}
