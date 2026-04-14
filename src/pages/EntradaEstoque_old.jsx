import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { gerarCodigo } from '../lib/codigos'
import { useToast } from '../contexts/ToastContext'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  Upload, Plus, Trash2, Search, CheckCircle, AlertCircle,
  Link, PackagePlus, FileText, ChevronDown, ChevronUp, X,
  History, Eye
} from 'lucide-react'

const fmt = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})
const today = () => new Date().toISOString().split('T')[0]
const FORMAS = ['Boleto','PIX','Cartão Crédito','Cartão Débito','Transferência','Dinheiro','Cheque','Outro']

export default function EntradaEstoque() {
  const toast = useToast()
  const fileRef = useRef()

  const [aba, setAba] = useState('nova') // nova | historico

  // Dados da nota
  const [nota, setNota] = useState({ numero:'', fornecedor_id:'', fornecedor_nome:'', data_emissao:today(), chave_nfe:'', obs:'' })
  const [itens, setItens] = useState([])
  const [produtos, setProdutos] = useState([])
  const [fornecedores, setFornecedores] = useState([])
  const [contas, setContas] = useState([])

  // Financeiro — estado único
  const [gerarFin, setGerarFin] = useState(false)
  const [fin, setFin] = useState({ forma_pgto:'Boleto', conta_id:'', vencimento1:today(), parcelas:1, intervalo_dias:30 })

  // UI
  const [processando, setProcessando] = useState(false)
  const [buscaProduto, setBuscaProduto] = useState({})
  const [expandidoIdx, setExpandidoIdx] = useState(null)
  const [confirmando, setConfirmando] = useState(false)

  // Histórico
  const [historico, setHistorico] = useState([])
  const [loadingHist, setLoadingHist] = useState(false)
  const [notaDetalhe, setNotaDetalhe] = useState(null)
  const [margemPadrao, setMargemPadrao] = useState(0)
  const [revertendo, setRevertendo] = useState(null)

  useEffect(() => { loadAuxiliar() }, [])
  useEffect(() => { if (aba === 'historico') loadHistorico() }, [aba])

  async function loadAuxiliar() {
    const [{ data: p }, { data: f }, { data: c }, empData] = await Promise.all([
      supabase.from('produtos').select('id,nome,codigo,preco_custo,estoque,unidade').eq('tipo','produto').eq('ativo',true).order('nome'),
      supabase.from('pessoas').select('id,nome,cpf_cnpj,telefone,email,logradouro,numero,bairro,cidade,estado,cep').in('tipo',['fornecedor','ambos']).eq('ativo',true).order('nome'),
      supabase.from('contas').select('id,nome').eq('ativo',true).order('nome'),
      supabase.from('empresa').select('margem_padrao').limit(1).single(),
    ])
    setProdutos(p||[]); setFornecedores(f||[]); setContas(c||[])
    if (empData?.data?.margem_padrao) setMargemPadrao(Number(empData.data.margem_padrao)||0)
  }

  async function loadHistorico() {
    setLoadingHist(true)
    const { data } = await supabase.from('entradas_estoque').select('*').order('created_at',{ascending:false}).limit(50)
    setHistorico(data||[])
    setLoadingHist(false)
  }

  async function reverterNota(entradaId) {
    const entrada = historico.find(h => h.id === entradaId)
    if (!entrada) { toast('Nota não encontrada','error'); return }
    setRevertendo(null)
    setProcessando(true)
    let erros = []
    try {
      // 1. Reverte estoque de cada item
      const itensEntrada = Array.isArray(entrada.itens) ? entrada.itens : []
      for (const item of itensEntrada) {
        if (!item.produto_id) continue
        const { data:prod } = await supabase.from('produtos').select('estoque').eq('id', item.produto_id).single()
        if (prod) {
          const novoEst = Math.max(0, Number(prod.estoque||0) - Number(item.qtd||0))
          const { error:eEst } = await supabase.from('produtos').update({ estoque: novoEst }).eq('id', item.produto_id)
          if (eEst) erros.push('estoque: '+eEst.message)
        }
      }

      // 2. Remove contas a pagar vinculadas
      await supabase.from('contas_pagar').delete().eq('origem_id', entrada.id)
      await supabase.from('contas_pagar').delete().eq('origem_tabela','entradas_estoque').eq('origem_id', entrada.id)

      // 3. Remove compras vinculadas
      await supabase.from('compras').delete().eq('origem_id', entrada.id)

      // 4. Remove pagamentos parciais vinculados às contas deletadas (cleanup)
      // Já são deletados em cascata se houver FK, senão sem problema

      // 5. Remove a entrada do histórico
      const { error: eEntrada } = await supabase.from('entradas_estoque').delete().eq('id', entrada.id)
      if (eEntrada) throw eEntrada

      if (erros.length > 0) {
        toast(`⚠️ Nota revertida com avisos: ${erros.join(', ')}`, 'info')
      } else {
        toast('✅ Nota revertida! Estoque descontado e registros removidos.', 'success')
      }
      await loadHistorico()
    } catch(err) {
      console.error('reverterNota:', err)
      toast('Erro ao reverter: ' + (err?.message || String(err)), 'error')
    } finally {
      setProcessando(false)
    }
  }

  // ── IMPORTAR XML ──────────────────────────────────────
  async function importarXML(e) {
    const file = e.target.files[0]
    if (!file) return
    const text = await file.text()
    try {
      const parser = new DOMParser()
      const xml = parser.parseFromString(text, 'text/xml')
      const chave   = xml.querySelector('chNFe')?.textContent || ''
      const nNF     = xml.querySelector('nNF')?.textContent || ''
      const dEmi    = xml.querySelector('dhEmi,dEmi')?.textContent?.substring(0,10) || today()
      const emitNome = xml.querySelector('emit xNome')?.textContent || ''
      const emitCNPJ = xml.querySelector('emit CNPJ')?.textContent || ''
      // Extrai dados completos do emitente para cadastro automático
      const emitFone    = xml.querySelector('emit fone')?.textContent || ''
      const emitEmail   = xml.querySelector('emit email')?.textContent || ''
      const emitLogr    = xml.querySelector('emit xLgr')?.textContent || ''
      const emitNum     = xml.querySelector('emit nro')?.textContent || ''
      const emitBairro  = xml.querySelector('emit xBairro')?.textContent || ''
      const emitCidade  = xml.querySelector('emit xMun')?.textContent || ''
      const emitUF      = xml.querySelector('emit UF')?.textContent || ''
      const emitCEP     = xml.querySelector('emit CEP')?.textContent || ''
      const emitIE      = xml.querySelector('emit IE')?.textContent || ''

      // Busca fornecedor pelo CNPJ — sem .single() para não gerar erro quando não encontrar
      let fornVinc = null
      if (emitCNPJ) {
        const cnpjLimpo = emitCNPJ.replace(/\D/g,'')
        const { data: found } = await supabase.from('pessoas')
          .select('id,nome,cpf_cnpj')
          .ilike('cpf_cnpj', `%${cnpjLimpo.slice(-8)}%`)
          .in('tipo',['fornecedor','ambos'])
          .limit(1)
        fornVinc = (found && found.length > 0) ? found[0] : null
      }

      // Se não encontrou pelo CNPJ, tenta pelo nome exato
      if (!fornVinc && emitNome) {
        const { data: foundNome } = await supabase.from('pessoas')
          .select('id,nome,cpf_cnpj')
          .ilike('nome', emitNome.trim())
          .in('tipo',['fornecedor','ambos'])
          .limit(1)
        fornVinc = (foundNome && foundNome.length > 0) ? foundNome[0] : null
      }

      // Se não encontrou de nenhuma forma, cria automaticamente com código sequencial
      if (!fornVinc && emitNome) {
        const cnpjFmt = emitCNPJ.length === 14
          ? emitCNPJ.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
          : emitCNPJ
        const codigoForn = await gerarCodigo('pessoas')
        const { data: novoForn, error: errForn } = await supabase.from('pessoas').insert({
          nome: emitNome, tipo: 'fornecedor', ativo: true,
          cpf_cnpj: cnpjFmt || null,
          ie: emitIE || null,
          telefone: emitFone || null,
          email: emitEmail || null,
          logradouro: emitLogr || null,
          numero: emitNum || null,
          bairro: emitBairro || null,
          cidade: emitCidade || null,
          estado: emitUF || null,
          cep: emitCEP || null,
          codigo: codigoForn,
        }).select('id,nome,cpf_cnpj').single()

        if (!errForn && novoForn) {
          // Inseriu com sucesso — fornecedor novo
          fornVinc = { ...novoForn, _novo: true }
          toast(`✅ Fornecedor "${emitNome}" cadastrado! Já selecionado.`, 'success')
        } else if (errForn) {
          // Pode ser race condition (outro usuário cadastrou ao mesmo tempo)
          // Re-busca no banco antes de exibir erro
          const cnpjLimpo2 = emitCNPJ.replace(/\D/g,'')
          const { data: recheck } = await supabase.from('pessoas')
            .select('id,nome,cpf_cnpj')
            .ilike('cpf_cnpj', `%${cnpjLimpo2.slice(-8)}%`)
            .in('tipo',['fornecedor','ambos'])
            .limit(1)
          if (recheck && recheck.length > 0) {
            // Outro usuário cadastrou simultaneamente — usa o que já existe
            fornVinc = recheck[0]
            toast(`ℹ️ Fornecedor "${fornVinc.nome}" já foi cadastrado por outro usuário. Selecionado.`, 'info')
          } else {
            toast(`⚠ Não foi possível cadastrar o fornecedor: ${errForn.message}`, 'error')
          }
        }
      }

      // Recarrega lista completa do banco para garantir que o novo aparece no select
      const { data: fornList } = await supabase.from('pessoas')
        .select('id,nome,cpf_cnpj')
        .in('tipo',['fornecedor','ambos'])
        .eq('ativo',true)
        .order('nome')
      if (fornList) setFornecedores(fornList)

      // Se fornecedor já existia (não foi criado agora), informa ao usuário
      if (fornVinc && !fornVinc._novo) {
        toast(`ℹ️ Fornecedor "${fornVinc.nome}" já cadastrado. Selecionado automaticamente.`, 'info')
      }

      setNota({ numero:nNF, fornecedor_id:fornVinc?.id||'', fornecedor_nome:fornVinc?.nome||emitNome, data_emissao:dEmi.substring(0,10), chave_nfe:chave, obs:`NF-e ${nNF} — ${emitNome}` })
      const dets = xml.querySelectorAll('det')
      const itensXML = Array.from(dets).map(det => {
        const descricao = det.querySelector('xProd')?.textContent || ''
        const codigo    = det.querySelector('cProd')?.textContent || ''
        const qtd       = Number(det.querySelector('qCom')?.textContent || 1)
        const vUnCom    = Number(det.querySelector('vUnCom')?.textContent || 0) // preço de tabela
        const vProd     = Number(det.querySelector('vProd')?.textContent || 0)  // valor total real do item
        const vDesc     = Number(det.querySelector('vDesc')?.textContent || 0)  // desconto do item
        // Usa vProd (já considera descontos por item) dividido pela qtd
        // Se vProd for 0 (raro), cai no vUnCom
        const vUnit = vProd > 0 && qtd > 0 ? (vProd - vDesc) / qtd : vUnCom
        const prodMatch = produtos.find(p => p.codigo === codigo || p.nome?.toLowerCase() === descricao.toLowerCase())
        return { descricao, codigo_nf:codigo, qtd, valor_unit:Number(vUnit.toFixed(4)), produto_id:prodMatch?.id||'', produto_nome:prodMatch?.nome||'' }
      })
      // Calcula desconto global da NF (vDescTotal) e distribui proporcionalmente se houver
      const vNF    = Number(xml.querySelector('vNF')?.textContent || 0)
      const vTotProd = itensXML.reduce((s,i)=>s+i.qtd*i.valor_unit,0)
      const diffTotal = vNF > 0 && Math.abs(vNF - vTotProd) > 0.05
      if (diffTotal && vTotProd > 0) {
        // Aplica fator de ajuste proporcional para bater com o total real da NF
        const fator = vNF / vTotProd
        itensXML.forEach(i => { i.valor_unit = Number((i.valor_unit * fator).toFixed(4)) })
      }
      setItens(itensXML)
      const vinc = itensXML.filter(i=>i.produto_id).length
      const totalCalc = itensXML.reduce((s,i)=>s+i.qtd*i.valor_unit,0)
      toast(`✅ XML importado! ${itensXML.length} itens · Total: R$ ${totalCalc.toLocaleString('pt-BR',{minimumFractionDigits:2})} · ${vinc} vinculados automaticamente.`, 'success')
    } catch(err) {
      toast('Erro ao ler XML. Verifique se é uma NF-e válida.','error')
    }
    fileRef.current.value = ''
  }

  // ── ITENS ─────────────────────────────────────────────
  function addItem() { setItens(prev=>[...prev,{descricao:'',codigo_nf:'',qtd:1,valor_unit:0,produto_id:'',produto_nome:''}]); setExpandidoIdx(itens.length) }
  function removeItem(idx) { setItens(prev=>prev.filter((_,i)=>i!==idx)) }
  function updateItem(idx,k,v) { setItens(prev=>prev.map((it,i)=>i===idx?{...it,[k]:v}:it)) }

  function vincularProduto(idx, produtoId) {
    const prod = produtos.find(p=>p.id===produtoId)
    setItens(prev=>prev.map((it,i)=>i===idx?{...it,produto_id:produtoId,produto_nome:prod?.nome||'',valor_unit:it.valor_unit||prod?.preco_custo||0}:it))
    setBuscaProduto(prev=>({...prev,[idx]:undefined}))
  }
  function desvincular(idx) { setItens(prev=>prev.map((it,i)=>i===idx?{...it,produto_id:'',produto_nome:''}:it)) }

  async function criarProdutoDoItem(idx) {
    const item = itens[idx]
    if (!item.descricao?.trim()) return toast('Preencha a descrição antes de criar','error')
    const { data: allCodes } = await supabase.from('produtos').select('codigo')
    const nums = (allCodes||[]).map(r => parseInt((r.codigo||'').replace(/[^0-9]/g,''))||0)
    const nextNum = Math.max(0, ...nums) + 1
    const codigo = 'PROD-'+String(nextNum).padStart(3,'0')
    const custo = Number(item.valor_unit)||0
    const venda = margemPadrao > 0 ? custo / (1 - margemPadrao/100) : 0
    const { data:novo, error } = await supabase.from('produtos').insert({
      codigo, nome:item.descricao, tipo:'produto',
      preco_custo: custo,
      preco_venda: venda > 0 ? Number(venda.toFixed(2)) : null,
      margem: margemPadrao > 0 ? margemPadrao : null,
      estoque:0, estoque_min:0, unidade:'un', ativo:true
    }).select().single()
    if (error) { toast('Erro: '+error.message,'error'); return }
    setItens(prev=>prev.map((it,i)=>i===idx?{...it,produto_id:novo.id,produto_nome:novo.nome}:it))
    setProdutos(prev=>[...prev,novo])
    toast(`✅ Produto "${novo.nome}" criado (${codigo})!`,'success')
  }

  // ── TOTAIS ────────────────────────────────────────────
  const totalNota       = itens.reduce((s,i)=>s+Number(i.qtd)*Number(i.valor_unit),0)
  const itensVinculados = itens.filter(i=>i.produto_id).length
  const itensSemVinculo = itens.filter(i=>!i.produto_id).length

  // ── CONFIRMAR ENTRADA ─────────────────────────────────
  async function confirmarEntrada() {
    if (itens.length === 0) return toast('Adicione pelo menos um item','error')
    if (!nota.fornecedor_id) return toast('Selecione o fornecedor antes de confirmar','error')
    setConfirmando(false)
    setProcessando(true)
    try {
      // 0a. Verifica se esta NF-e já foi importada (chave de 44 dígitos é única)
      if (nota.chave_nfe && nota.chave_nfe.length >= 44) {
        const { data: nfDup } = await supabase.from('entradas_estoque')
          .select('id,numero_nf,created_at')
          .eq('chave_nfe', nota.chave_nfe)
          .limit(1)
        if (nfDup && nfDup.length > 0) {
          const dataImp = new Date(nfDup[0].created_at).toLocaleDateString('pt-BR')
          toast(`⚠️ Esta NF-e (chave ${nota.chave_nfe.slice(-8)}) já foi importada em ${dataImp}. Operação cancelada.`, 'error')
          setProcessando(false)
          return
        }
      }

    // 0b. Cria produtos automaticamente para itens sem vínculo
      // Usa código único baseado em timestamp+random para evitar colisão em uso simultâneo
      const itensProc = [...itens]
      const itensSemVinc = itensProc.filter(i => !i.produto_id && i.descricao?.trim())
      if (itensSemVinc.length > 0) {
        // Busca o maior número sequencial existente uma só vez
        const { data: allCodes } = await supabase.from('produtos').select('codigo').order('created_at',{ascending:false})
        const nums = (allCodes||[]).map(r => parseInt((r.codigo||'').replace(/[^0-9]/g,''))||0)
        let nextNum = Math.max(0, ...nums)
        for (let idx=0; idx<itensProc.length; idx++) {
          const item = itensProc[idx]
          if (!item.produto_id && item.descricao?.trim()) {
            nextNum++
            const codigo = 'PROD-'+String(nextNum).padStart(3,'0')
            // Tenta inserir com código sequencial
            const custoItem = Number(item.valor_unit)||0
          const vendaCalc = margemPadrao > 0 ? custoItem / (1 - margemPadrao/100) : 0
          const { data:novo, error:errInsert } = await supabase.from('produtos').insert({
              codigo,
              nome:item.descricao, tipo:'produto',
              preco_custo: custoItem,
              preco_venda: vendaCalc > 0 ? Number(vendaCalc.toFixed(2)) : null,
              margem: margemPadrao > 0 ? margemPadrao : null,
              estoque:0, estoque_min:0, unidade:'un', ativo:true
            }).select().single()
            // Se deu erro de duplicata, tenta com sufixo timestamp
            if (errInsert) {
              const { data:novo2 } = await supabase.from('produtos').insert({
                codigo: `PROD-${Date.now()}`,
                nome:item.descricao, tipo:'produto',
                preco_custo:Number(item.valor_unit)||0, estoque:0, estoque_min:0, unidade:'un', ativo:true
              }).select().single()
              if (novo2) itensProc[idx] = {...item, produto_id:novo2.id, produto_nome:novo2.nome}
            } else if (novo) {
              itensProc[idx] = {...item, produto_id:novo.id, produto_nome:novo.nome}
            }
          }
        }
      }

      // 1. Salva entrada no histórico
      const { data:entrada, error:errE } = await supabase.from('entradas_estoque').insert({
        numero_nf:nota.numero, fornecedor_id:nota.fornecedor_id||null,
        fornecedor_nome:nota.fornecedor_nome, data_emissao:nota.data_emissao,
        chave_nfe:nota.chave_nfe, total:totalNota, obs:nota.obs, itens:itensProc,
        gerou_financeiro: gerarFin,
      }).select().single()
      if (errE) throw errE

      // 2. Atualiza estoque de forma atômica via RPC para evitar sobrescrição em uso simultâneo
      for (const item of itensProc.filter(i=>i.produto_id)) {
        // Usa RPC que faz UPDATE estoque = estoque + qtd diretamente no banco (atômico)
        const { error: eRpc } = await supabase.rpc('incrementar_estoque', {
          p_produto_id: item.produto_id,
          p_qtd: Number(item.qtd),
          p_preco_custo: Number(item.valor_unit),
        })
        // Fallback: se a função RPC não existir ainda, usa update convencional
        if (eRpc && eRpc.message?.includes('function')) {
          const { data:prod } = await supabase.from('produtos').select('estoque').eq('id',item.produto_id).single()
          await supabase.from('produtos').update({
            estoque: Number(prod?.estoque||0)+Number(item.qtd),
            preco_custo: Number(item.valor_unit),
          }).eq('id',item.produto_id)
        }
      }

      // 3. Cria registro em Compras
      const { data:compra } = await supabase.from('compras').insert({
        data: nota.data_emissao,
        descricao: `NF ${nota.numero||'s/n'} — ${nota.fornecedor_nome||'Fornecedor'}`,
        fornecedor: nota.fornecedor_nome||'',
        valor_total: totalNota,
        status: gerarFin ? 'pendente' : 'pendente',
        obs: nota.obs||'',
        origem_id: entrada.id,
        origem_tabela: 'entradas_estoque',
        ativo: true,
      }).select().single()

      // 4. Gera financeiro (Conta a Pagar) se solicitado
      if (gerarFin) {
        const nParcelas = Number(fin.parcelas)||1
        // Distribui o valor evitando diferença de centavos:
        // parcelas normais usam Math.floor(centavos), a última absorve o restante
        const totalCentavos = Math.round(totalNota * 100)
        const parcelaCentavos = Math.floor(totalCentavos / nParcelas)
        const restoCentavos = totalCentavos - parcelaCentavos * nParcelas

        for (let p=0; p<nParcelas; p++) {
          const venc = new Date(fin.vencimento1+'T12:00:00')
          venc.setDate(venc.getDate()+p*Number(fin.intervalo_dias))
          const vencStr = venc.toISOString().split('T')[0]
          // A última parcela absorve o centavo restante
          const valorParcela = ((parcelaCentavos + (p === nParcelas - 1 ? restoCentavos : 0)) / 100).toFixed(2)
          await supabase.from('contas_pagar').insert({
            data_emissao: today(),
            descricao: nParcelas>1
              ? `NF ${nota.numero||'s/n'} — ${nota.fornecedor_nome} (${p+1}/${nParcelas})`
              : `NF ${nota.numero||'s/n'} — ${nota.fornecedor_nome}`,
            valor: valorParcela,
            vencimento: vencStr,
            pago: false,
            categoria: 'Compra/Fornecedor',
            forma_pgto: fin.forma_pgto,
            conta_id: fin.conta_id||null,
            pessoa_nome: nota.fornecedor_nome||'',
            pessoa_id: nota.fornecedor_id||null,
            origem_id: entrada.id,
            origem_tabela: 'entradas_estoque',
            ativo: true,
          })
        }
      }

      const qtd = itensProc.filter(i=>i.produto_id).length
      toast(`✅ Entrada confirmada! ${qtd} produto(s) atualizados.${gerarFin?` ${Number(fin.parcelas)||1} parcela(s) em Contas a Pagar.`:''} Registrado em Compras.`,'success')

      // Reset
      setNota({numero:'',fornecedor_id:'',fornecedor_nome:'',data_emissao:today(),chave_nfe:'',obs:''})
      setItens([]); setGerarFin(false); setFin({forma_pgto:'Boleto',conta_id:'',vencimento1:today(),parcelas:1,intervalo_dias:30})
    } catch(err) {
      toast('Erro: '+err.message,'error')
      console.error(err)
    } finally {
      setProcessando(false)
    }
  }

  const fn = (k,v) => setNota(p=>({...p,[k]:v}))
  const ff = (k,v) => setFin(p=>({...p,[k]:v}))
  const prodsFiltrados = (idx) => {
    const t = (buscaProduto[idx]||'').toLowerCase()
    if (!t) return produtos.slice(0,8)
    return produtos.filter(p=>p.nome?.toLowerCase().includes(t)||p.codigo?.toLowerCase().includes(t)).slice(0,10)
  }

  return (
    <div style={{maxWidth:900}}>
      {/* Abas */}
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:'1px solid var(--border)'}}>
        {[{id:'nova',label:'Nova Entrada',icon:<PackagePlus size={13}/>},{id:'historico',label:'Histórico de Notas',icon:<History size={13}/>}].map(a=>(
          <button key={a.id} onClick={()=>setAba(a.id)} style={{
            display:'flex',alignItems:'center',gap:5,background:'none',border:'none',cursor:'pointer',
            padding:'8px 14px 12px',fontSize:12,fontWeight:600,
            color:aba===a.id?'var(--accent)':'var(--text2)',
            borderBottom:aba===a.id?'2px solid var(--accent)':'2px solid transparent',
            marginBottom:-1,transition:'all .15s'
          }}>{a.icon}{a.label}</button>
        ))}
      </div>

      {/* ── ABA HISTÓRICO ── */}
      {aba==='historico' && (
        <div>
          {loadingHist ? <div className="loading"><div className="spinner"/></div> :
            historico.length===0 ? <div className="empty-state"><History size={40}/><p>Nenhuma entrada registrada</p></div> :
            <div className="card" style={{padding:0,overflow:'hidden'}}>
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Data</th><th>NF</th><th>Fornecedor</th><th>Itens</th>
                    <th style={{textAlign:'right'}}>Total</th><th>Financeiro</th><th>Ações</th>
                  </tr></thead>
                  <tbody>
                    {historico.map(h=>(
                      <tr key={h.id}>
                        <td style={{fontSize:12,color:'var(--text2)',whiteSpace:'nowrap'}}>{h.data_emissao?new Date(h.data_emissao+'T12:00:00').toLocaleDateString('pt-BR'):'—'}</td>
                        <td className="font-bold">{h.numero_nf||'s/n'}</td>
                        <td>{h.fornecedor_nome||'—'}</td>
                        <td><span className="badge badge-blue" style={{fontSize:10}}>{(h.itens||[]).length} itens</span></td>
                        <td className="text-mono font-bold" style={{textAlign:'right'}}>{fmt(h.total)}</td>
                        <td>{h.gerou_financeiro?<span className="badge badge-green" style={{fontSize:10}}>✓ Conta a pagar</span>:<span className="badge badge-gray" style={{fontSize:10}}>Só estoque</span>}</td>
                        <td>
                          <div className="action-btns">
                            <button className="icon-btn" title="Ver detalhes" onClick={()=>setNotaDetalhe(h)}><Eye size={14}/></button>
                            <button className="icon-btn del" title="Reverter nota" onClick={()=>setRevertendo(h.id)} disabled={processando}><Trash2 size={14}/></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          }
          {/* Modal detalhe */}
          {notaDetalhe && (
            <div className="modal-overlay">
              <div className="modal modal-lg">
                <div className="modal-header">
                  <span className="modal-title">NF {notaDetalhe.numero_nf||'s/n'} — {notaDetalhe.fornecedor_nome}</span>
                  <button className="icon-btn" onClick={()=>setNotaDetalhe(null)}><X size={16}/></button>
                </div>
                <div className="modal-body">
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16,fontSize:13}}>
                    <div><span style={{color:'var(--text3)'}}>Data: </span><strong>{notaDetalhe.data_emissao?new Date(notaDetalhe.data_emissao+'T12:00:00').toLocaleDateString('pt-BR'):'—'}</strong></div>
                    <div><span style={{color:'var(--text3)'}}>Total: </span><strong style={{color:'var(--green)'}}>{fmt(notaDetalhe.total)}</strong></div>
                    {notaDetalhe.chave_nfe && <div style={{gridColumn:'1/-1',fontSize:11,fontFamily:'var(--mono)',color:'var(--text3)',wordBreak:'break-all'}}>Chave: {notaDetalhe.chave_nfe}</div>}
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Produto</th><th>Cód NF</th><th style={{textAlign:'center'}}>Qtd</th><th style={{textAlign:'right'}}>Vlr Unit.</th><th style={{textAlign:'right'}}>Total</th></tr></thead>
                      <tbody>
                        {(notaDetalhe.itens||[]).map((item,i)=>(
                          <tr key={i}>
                            <td className="font-bold">{item.produto_nome||item.descricao}</td>
                            <td style={{fontSize:11,color:'var(--text3)'}}>{item.codigo_nf||'—'}</td>
                            <td style={{textAlign:'center'}}>{item.qtd}</td>
                            <td className="text-mono" style={{textAlign:'right'}}>{fmt(item.valor_unit)}</td>
                            <td className="text-mono font-bold" style={{textAlign:'right'}}>{fmt(Number(item.qtd)*Number(item.valor_unit))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ABA NOVA ENTRADA ── */}
      {aba==='nova' && (<>

      {/* Cabeçalho nota */}
      <div className="card" style={{marginBottom:16}}>
        <div className="card-header">
          <span className="card-title"><FileText size={14} color="var(--accent)"/> Dados da Nota</span>
          <div style={{display:'flex',gap:8}}>
            <input ref={fileRef} type="file" accept=".xml" style={{display:'none'}} onChange={importarXML}/>
            <button className="btn btn-secondary btn-sm" onClick={()=>fileRef.current.click()}><Upload size={13}/> Importar XML NF-e</button>
          </div>
        </div>
        <div className="form-grid form-grid-2" style={{marginTop:4}}>
          <div className="form-group"><label className="form-label">Número da NF</label><input className="form-input" value={nota.numero} onChange={e=>fn('numero',e.target.value)} placeholder="Ex: 001234"/></div>
          <div className="form-group"><label className="form-label">Data de Emissão</label><input className="form-input" type="date" value={nota.data_emissao} onChange={e=>fn('data_emissao',e.target.value)}/></div>
          <div className="form-group" style={{gridColumn:'1/-1'}}>
            <label className="form-label">Fornecedor *</label>
            <select className="form-select" value={nota.fornecedor_id} onChange={e=>{const f=fornecedores.find(x=>x.id===e.target.value);fn('fornecedor_id',e.target.value);fn('fornecedor_nome',f?.nome||'')}}>
              <option value="">Selecionar...</option>
              {fornecedores.map(f=><option key={f.id} value={f.id}>{f.nome}{f.cpf_cnpj?` — ${f.cpf_cnpj}`:''}</option>)}
            </select>
            {nota.fornecedor_id && nota.fornecedor_nome && !fornecedores.find(f=>f.id===nota.fornecedor_id) && (
              <div style={{fontSize:12,color:'var(--yellow)',marginTop:4}}>
                ⚠ Fornecedor "{nota.fornecedor_nome}" — recarregando lista...
              </div>
            )}
            {nota.fornecedor_id && fornecedores.find(f=>f.id===nota.fornecedor_id) && (
              <div style={{fontSize:11,color:'var(--green)',marginTop:3}}>
                ✓ {fornecedores.find(f=>f.id===nota.fornecedor_id)?.nome}
              </div>
            )}
          </div>
          {nota.chave_nfe&&<div className="form-group" style={{gridColumn:'1/-1'}}><label className="form-label">Chave NF-e</label><input className="form-input" value={nota.chave_nfe} readOnly style={{fontSize:11,opacity:.7,fontFamily:'var(--mono)'}}/></div>}
          <div className="form-group" style={{gridColumn:'1/-1'}}><label className="form-label">Observações</label><input className="form-input" value={nota.obs} onChange={e=>fn('obs',e.target.value)}/></div>
        </div>
      </div>

      {/* Itens */}
      <div className="card" style={{marginBottom:16}}>
        <div className="card-header">
          <span className="card-title"><PackagePlus size={14} color="var(--accent)"/> Itens da Entrada</span>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            {itens.length>0&&<div style={{fontSize:12}}>
              <span style={{color:'var(--green)',fontWeight:700}}>{itensVinculados} vinculados</span>
              {itensSemVinculo>0&&<span style={{color:'var(--yellow)',marginLeft:8,fontWeight:700}}>⚠ {itensSemVinculo} sem vínculo (serão criados)</span>}
            </div>}
            <button className="btn btn-primary btn-sm" onClick={addItem}><Plus size={13}/> Item</button>
          </div>
        </div>
        {itens.length===0
          ? <div style={{textAlign:'center',padding:'30px 20px',color:'var(--text3)'}}><PackagePlus size={32} style={{opacity:.3,marginBottom:10}}/><p style={{fontSize:13}}>Importe um XML ou adicione itens manualmente</p></div>
          : <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {itens.map((item,idx)=>{
                const exp=expandidoIdx===idx
                const vinc=!!item.produto_id
                return (
                  <div key={idx} style={{border:`1px solid ${vinc?'rgba(52,211,153,.3)':'rgba(251,191,36,.25)'}`,borderRadius:10,overflow:'hidden',background:vinc?'rgba(52,211,153,.04)':'rgba(251,191,36,.04)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',cursor:'pointer'}} onClick={()=>setExpandidoIdx(exp?null:idx)}>
                      <span style={{color:vinc?'var(--green)':'var(--yellow)',flexShrink:0}}>{vinc?<CheckCircle size={16}/>:<AlertCircle size={16}/>}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.descricao||<span style={{color:'var(--text3)',fontStyle:'italic'}}>Sem descrição</span>}</div>
                        <div style={{fontSize:11,color:'var(--text2)',marginTop:1}}>Qtd: {item.qtd} · {fmt(item.valor_unit)}/un · Total: {fmt(Number(item.qtd)*Number(item.valor_unit))}{vinc&&<span style={{color:'var(--green)',marginLeft:8}}>→ {item.produto_nome}</span>}</div>
                      </div>
                      <div style={{display:'flex',gap:4,flexShrink:0}}>
                        {exp?<ChevronUp size={14} color="var(--text3)"/>:<ChevronDown size={14} color="var(--text3)"/>}
                        <button className="icon-btn del" onClick={e=>{e.stopPropagation();removeItem(idx)}}><Trash2 size={13}/></button>
                      </div>
                    </div>
                    {exp&&(
                      <div style={{padding:'0 14px 14px',borderTop:'1px solid var(--border)'}}>
                        <div className="form-grid form-grid-2" style={{marginTop:12}}>
                          <div className="form-group" style={{gridColumn:'1/-1'}}><label className="form-label">Descrição</label><input className="form-input" value={item.descricao} onChange={e=>updateItem(idx,'descricao',e.target.value)}/></div>
                          <div className="form-group"><label className="form-label">Cód. NF</label><input className="form-input" value={item.codigo_nf} onChange={e=>updateItem(idx,'codigo_nf',e.target.value)}/></div>
                          <div className="form-group"><label className="form-label">Quantidade</label><input className="form-input" type="number" step="0.001" value={item.qtd} onChange={e=>updateItem(idx,'qtd',e.target.value)}/></div>
                          <div className="form-group"><label className="form-label">Valor Unitário</label><input className="form-input" type="number" step="0.01" value={item.valor_unit} onChange={e=>updateItem(idx,'valor_unit',e.target.value)}/></div>
                          <div className="form-group"><label className="form-label">Total</label><input className="form-input" value={fmt(Number(item.qtd)*Number(item.valor_unit))} readOnly style={{opacity:.7,fontWeight:700}}/></div>
                          <div className="form-group" style={{gridColumn:'1/-1'}}>
                            <label className="form-label" style={{display:'flex',alignItems:'center',gap:6}}>
                              <Link size={11}/> Produto no cadastro
                              {vinc?<span className="badge badge-green" style={{fontSize:10}}>✓ {item.produto_nome}</span>
                                :<span style={{color:'var(--yellow)',fontSize:10,fontWeight:600}}>Será criado automaticamente</span>}
                            </label>
                            {vinc
                              ? <button className="btn btn-sm btn-secondary" onClick={()=>desvincular(idx)}><X size={12}/> Desvincular</button>
                              : <div style={{position:'relative'}}>
                                  <div style={{position:'relative'}}>
                                    <Search size={13} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text3)'}}/>
                                    <input className="form-input" style={{paddingLeft:30}} value={buscaProduto[idx]||''} onChange={e=>setBuscaProduto(p=>({...p,[idx]:e.target.value}))} placeholder="Buscar produto existente..."/>
                                  </div>
                                  <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:8,zIndex:100,maxHeight:200,overflowY:'auto',marginTop:4,boxShadow:'var(--shadow)'}}>
                                    {prodsFiltrados(idx).map(p=>(
                                      <div key={p.id} style={{padding:'8px 12px',cursor:'pointer',fontSize:13,display:'flex',justifyContent:'space-between',borderBottom:'1px solid var(--border)'}}
                                        onClick={()=>vincularProduto(idx,p.id)}
                                        onMouseEnter={e=>e.currentTarget.style.background='var(--bg3)'}
                                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                        <span style={{fontWeight:600}}>{p.nome}</span>
                                        <span style={{color:'var(--text3)',fontSize:11}}>Est: {p.estoque||0} {p.unidade}</span>
                                      </div>
                                    ))}
                                    <div style={{padding:'8px 12px',cursor:'pointer',fontSize:12,color:'var(--accent)',fontWeight:700,borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',gap:6}}
                                      onClick={()=>{criarProdutoDoItem(idx);setBuscaProduto(p=>({...p,[idx]:undefined}))}}
                                      onMouseEnter={e=>e.currentTarget.style.background='var(--bg3)'}
                                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                      <Plus size={12}/> Criar produto com este nome
                                    </div>
                                  </div>
                                </div>
                            }
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
        }
      </div>

      {/* Resumo + financeiro */}
      {itens.length>0&&(
        <div className="card" style={{marginBottom:16}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <div>
              <div style={{fontSize:11,color:'var(--text3)',fontWeight:700,textTransform:'uppercase',letterSpacing:.8}}>Total da Nota</div>
              <div style={{fontSize:24,fontWeight:900,fontFamily:'var(--mono)',color:'var(--accent)'}}>{fmt(totalNota)}</div>
            </div>
            <span className={`badge ${itensVinculados===itens.length?'badge-green':'badge-yellow'}`}>{itensVinculados}/{itens.length} vinculados</span>
          </div>

          {/* Toggle financeiro */}
          <div style={{border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
            <div style={{padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',background:'var(--bg3)'}}
              onClick={()=>setGerarFin(!gerarFin)}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:20,height:20,borderRadius:5,border:`2px solid ${gerarFin?'var(--accent)':'var(--border2)'}`,background:gerarFin?'var(--accent)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all .15s'}}>
                  {gerarFin&&<CheckCircle size={12} color="white"/>}
                </div>
                <div>
                  <div style={{fontWeight:700,fontSize:13}}>Gerar Conta a Pagar</div>
                  <div style={{fontSize:11,color:'var(--text2)'}}>Lança em Contas a Pagar — independente do estoque</div>
                </div>
              </div>
              {gerarFin?<ChevronUp size={15} color="var(--text3)"/>:<ChevronDown size={15} color="var(--text3)"/>}
            </div>
            {gerarFin&&(
              <div className="form-grid form-grid-2" style={{padding:'14px 16px'}}>
                <div className="form-group"><label className="form-label">Forma de Pagamento</label>
                  <select className="form-select" value={fin.forma_pgto} onChange={e=>ff('forma_pgto',e.target.value)}>
                    {FORMAS.map(f=><option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Conta / Carteira</label>
                  <select className="form-select" value={fin.conta_id} onChange={e=>ff('conta_id',e.target.value)}>
                    <option value="">Nenhuma</option>{contas.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">1º Vencimento</label><input className="form-input" type="date" value={fin.vencimento1} onChange={e=>ff('vencimento1',e.target.value)}/></div>
                <div className="form-group"><label className="form-label">Nº de Parcelas</label>
                  <select className="form-select" value={fin.parcelas} onChange={e=>ff('parcelas',Number(e.target.value))}>
                    {[1,2,3,4,6,8,10,12].map(n=><option key={n} value={n}>{n}x {n>1?`de ${fmt(totalNota/n)}`:''}</option>)}
                  </select>
                </div>
                {fin.parcelas>1&&(
                  <div className="form-group"><label className="form-label">Intervalo entre parcelas</label>
                    <select className="form-select" value={fin.intervalo_dias} onChange={e=>ff('intervalo_dias',Number(e.target.value))}>
                      <option value={30}>30 dias</option><option value={60}>60 dias</option><option value={90}>90 dias</option>
                    </select>
                  </div>
                )}
                {fin.parcelas>1&&(
                  <div style={{gridColumn:'1/-1',background:'var(--bg3)',borderRadius:8,padding:'10px 14px',fontSize:12}}>
                    <strong>{fin.parcelas}x</strong> de <strong style={{color:'var(--accent)',fontFamily:'var(--mono)'}}>{fmt(totalNota/fin.parcelas)}</strong>
                    {' '}a cada <strong>{fin.intervalo_dias} dias</strong> a partir de {new Date(fin.vencimento1+'T12:00:00').toLocaleDateString('pt-BR')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {itens.length>0&&(
        <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
          <button className="btn btn-secondary" onClick={()=>{setItens([]);setNota({numero:'',fornecedor_id:'',fornecedor_nome:'',data_emissao:today(),chave_nfe:'',obs:''})}}>Limpar</button>
          <button className="btn btn-primary" onClick={()=>{
            if (!nota.fornecedor_id) { toast('Selecione o fornecedor antes de confirmar','error'); return }
            if (itens.length===0) { toast('Adicione pelo menos um item','error'); return }
            setConfirmando(true)
          }} disabled={processando}>
            <CheckCircle size={15}/> {processando?'Processando...':`Confirmar Entrada (${itens.length} itens)`}
          </button>
        </div>
      )}

      {confirmando&&(
        <ConfirmDialog
          title="Confirmar Entrada de Estoque"
          confirmLabel="✓ Confirmar Entrada"
          confirmStyle="success"
          message={`Ao confirmar:\n\n${itensVinculados>0?`• ${itensVinculados} produto(s) terão estoque atualizado\n`:''}${itensSemVinculo>0?`• ${itensSemVinculo} produto(s) novo(s) serão criados no cadastro\n`:''}• Total: ${fmt(totalNota)}\n• Registrado em Compras${gerarFin?`\n• ${fin.parcelas}x de ${fmt(totalNota/fin.parcelas)} em Contas a Pagar`:'\n• Sem lançamento financeiro (pode gerar depois)'}`}
          onConfirm={confirmarEntrada}
          onCancel={()=>setConfirmando(false)}
        />
      )}
      </>)}
    </div>
  )
}
