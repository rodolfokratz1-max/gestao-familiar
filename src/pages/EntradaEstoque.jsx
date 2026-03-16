import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  Upload, Plus, Trash2, Search, CheckCircle, AlertCircle,
  Link, PackagePlus, FileText, ChevronDown, ChevronUp, X
} from 'lucide-react'

const fmt = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})
const today = () => new Date().toISOString().split('T')[0]
const FORMAS = ['Boleto','PIX','Cartão Crédito','Cartão Débito','Transferência','Dinheiro','Cheque','Outro']

const ITEM_VAZIO = { descricao:'', codigo_nf:'', qtd:1, valor_unit:0, produto_id:'', produto_nome:'', confirmado:false }

export default function EntradaEstoque() {
  const toast = useToast()
  const fileRef = useRef()

  // Dados da nota
  const [nota, setNota] = useState({
    numero:'', fornecedor_id:'', fornecedor_nome:'', data_emissao: today(),
    chave_nfe:'', obs:''
  })
  const [itens, setItens] = useState([])
  const [produtos, setProdutos] = useState([])
  const [fornecedores, setFornecedores] = useState([])
  const [contas, setContas] = useState([])

  // Painel financeiro
  const [gerarFinanceiro, setGerarFinanceiro] = useState(false)
  const [financeiro, setFinanceiro] = useState({
    gerar: false, forma_pgto:'Boleto', conta_id:'',
    vencimento1: today(), parcelas:1, intervalo_dias:30
  })

  // UI
  const [step, setStep] = useState('itens') // itens | confirmacao
  const [processando, setProcessando] = useState(false)
  const [buscaProduto, setBuscaProduto] = useState({}) // { idx: termo }
  const [expandidoIdx, setExpandidoIdx] = useState(null)
  const [confirmandoEntrada, setConfirmandoEntrada] = useState(false)

  useEffect(() => { loadAuxiliar() }, [])

  async function loadAuxiliar() {
    const [{ data: p }, { data: f }, { data: c }] = await Promise.all([
      supabase.from('produtos').select('id,nome,codigo,preco_custo,estoque,unidade').eq('tipo','produto').eq('ativo',true).order('nome'),
      supabase.from('pessoas').select('id,nome').in('tipo',['fornecedor','ambos']).eq('ativo',true).order('nome'),
      supabase.from('contas').select('id,nome').eq('ativo',true).order('nome'),
    ])
    setProdutos(p || [])
    setFornecedores(f || [])
    setContas(c || [])
  }

  // ── IMPORTAR XML ──────────────────────────────────────
  async function importarXML(e) {
    const file = e.target.files[0]
    if (!file) return
    const text = await file.text()
    try {
      const parser = new DOMParser()
      const xml = parser.parseFromString(text, 'text/xml')

      // Extrai dados da nota
      const chave = xml.querySelector('chNFe')?.textContent || ''
      const nNF   = xml.querySelector('nNF')?.textContent || ''
      const dEmi  = xml.querySelector('dhEmi,dEmi')?.textContent?.substring(0,10) || today()
      const emitNome = xml.querySelector('emit xNome')?.textContent || ''
      const emitCNPJ = xml.querySelector('emit CNPJ')?.textContent || ''

      // Tenta vincular fornecedor pelo CNPJ
      const fornVinculado = fornecedores.find(f => f.cnpj?.replace(/\D/g,'') === emitCNPJ.replace(/\D/g,''))

      setNota({
        numero: nNF,
        fornecedor_id: fornVinculado?.id || '',
        fornecedor_nome: fornVinculado?.nome || emitNome,
        data_emissao: dEmi.substring(0,10),
        chave_nfe: chave,
        obs: `NF-e ${nNF} — ${emitNome}`,
      })

      // Extrai itens
      const dets = xml.querySelectorAll('det')
      const itensXML = Array.from(dets).map(det => {
        const descricao = det.querySelector('xProd')?.textContent || ''
        const codigo    = det.querySelector('cProd')?.textContent || ''
        const qtd       = Number(det.querySelector('qCom')?.textContent || 1)
        const vUnit     = Number(det.querySelector('vUnCom')?.textContent || 0)

        // Tenta auto-vincular por código ou nome
        const prodMatch = produtos.find(p =>
          p.codigo === codigo ||
          p.nome?.toLowerCase() === descricao.toLowerCase()
        )

        return {
          descricao, codigo_nf: codigo, qtd, valor_unit: vUnit,
          produto_id: prodMatch?.id || '',
          produto_nome: prodMatch?.nome || '',
          confirmado: !!prodMatch,
        }
      })

      setItens(itensXML)
      toast(`✅ XML importado! ${itensXML.length} itens encontrados. ${itensXML.filter(i=>i.produto_id).length} vinculados automaticamente.`, 'success')
    } catch (err) {
      toast('Erro ao ler XML. Verifique se é uma NF-e válida.', 'error')
      console.error(err)
    }
    fileRef.current.value = ''
  }

  // ── ITENS MANUAIS ─────────────────────────────────────
  function addItem() {
    setItens(prev => [...prev, { ...ITEM_VAZIO }])
    setExpandidoIdx(itens.length)
  }

  function removeItem(idx) {
    setItens(prev => prev.filter((_,i) => i !== idx))
  }

  function updateItem(idx, campo, valor) {
    setItens(prev => prev.map((it,i) => i===idx ? {...it, [campo]:valor} : it))
  }

  function vincularProduto(idx, produtoId) {
    const prod = produtos.find(p => p.id === produtoId)
    setItens(prev => prev.map((it,i) => i===idx ? {
      ...it,
      produto_id: produtoId,
      produto_nome: prod?.nome || '',
      valor_unit: it.valor_unit || prod?.preco_custo || 0,
      confirmado: !!produtoId,
    } : it))
    setBuscaProduto(prev => ({...prev, [idx]:''}))
  }

  function desvincular(idx) {
    setItens(prev => prev.map((it,i) => i===idx ? {...it, produto_id:'', produto_nome:'', confirmado:false} : it))
  }

  async function criarProdutoDoItem(idx) {
    const item = itens[idx]
    if (!item.descricao?.trim()) return toast('Preencha a descrição do item antes de criar o produto', 'error')
    // Gera código sequencial simples
    const { data: last } = await supabase.from('produtos').select('codigo').order('created_at', { ascending: false }).limit(1).single()
    const lastNum = parseInt((last?.codigo || 'PROD-000').replace(/\D/g,'')) || 0
    const codigo = 'PROD-' + String(lastNum + 1).padStart(3, '0')
    const { data: novo, error } = await supabase.from('produtos').insert({
      codigo,
      nome: item.descricao,
      tipo: 'produto',
      preco_custo: Number(item.valor_unit) || 0,
      estoque: 0, // será atualizado ao confirmar
      estoque_min: 0,
      unidade: 'un',
      ativo: true,
    }).select().single()
    if (error) { toast('Erro ao criar produto: ' + error.message, 'error'); return }
    // Vincula ao item
    setItens(prev => prev.map((it,i) => i===idx ? {
      ...it, produto_id: novo.id, produto_nome: novo.nome, confirmado: true
    } : it))
    // Adiciona à lista local de produtos
    setProdutos(prev => [...prev, novo])
    toast(`✅ Produto "${novo.nome}" criado com código ${codigo}!`, 'success')
  }

  // ── TOTAIS ────────────────────────────────────────────
  const totalNota = itens.reduce((s,i) => s + Number(i.qtd)*Number(i.valor_unit), 0)
  const itensVinculados = itens.filter(i => i.produto_id).length
  const itensSemVinculo = itens.filter(i => !i.produto_id).length

  // ── CONFIRMAR ENTRADA ─────────────────────────────────
  async function confirmarEntrada() {
    if (itens.length === 0) return toast('Adicione pelo menos um item', 'error')
    setConfirmandoEntrada(false)
    setProcessando(true)

    try {
      // 0. Cria produtos automaticamente para itens sem vínculo
      const itensAtualizados = [...itens]
      for (let idx = 0; idx < itensAtualizados.length; idx++) {
        const item = itensAtualizados[idx]
        if (!item.produto_id && item.descricao?.trim()) {
          const { data: last } = await supabase.from('produtos').select('codigo').order('created_at', { ascending: false }).limit(1).single()
          const lastNum = parseInt((last?.codigo || 'PROD-000').replace(/\D/g,'')) || 0
          const codigo = 'PROD-' + String(lastNum + idx + 1).padStart(3, '0')
          const { data: novo } = await supabase.from('produtos').insert({
            codigo, nome: item.descricao, tipo: 'produto',
            preco_custo: Number(item.valor_unit) || 0,
            estoque: 0, estoque_min: 0, unidade: 'un', ativo: true,
          }).select().single()
          if (novo) {
            itensAtualizados[idx] = { ...item, produto_id: novo.id, produto_nome: novo.nome }
          }
        }
      }
      setItens(itensAtualizados)

      // 1. Cria registro da entrada
      const { data: entrada, error: errEntrada } = await supabase
        .from('entradas_estoque').insert({
          numero_nf: nota.numero,
          fornecedor_id: nota.fornecedor_id || null,
          fornecedor_nome: nota.fornecedor_nome,
          data_emissao: nota.data_emissao,
          chave_nfe: nota.chave_nfe,
          total: totalNota,
          obs: nota.obs,
          itens: itens,
        }).select().single()

      if (errEntrada) throw errEntrada

      // 2. Atualiza estoque dos produtos vinculados
      for (const item of itensAtualizados.filter(i => i.produto_id)) {
        const { data: prod } = await supabase.from('produtos').select('estoque').eq('id', item.produto_id).single()
        const novoEstoque = Number(prod?.estoque || 0) + Number(item.qtd)
        await supabase.from('produtos').update({
          estoque: novoEstoque,
          preco_custo: Number(item.valor_unit), // atualiza custo com o da NF
        }).eq('id', item.produto_id)
      }

      // 3. Gera financeiro se escolhido
      if (financeiro.gerar) {
        const parcelas = Number(financeiro.parcelas) || 1
        const valorParcela = (totalNota / parcelas).toFixed(2)

        for (let p = 0; p < parcelas; p++) {
          const venc = new Date(financeiro.vencimento1)
          venc.setDate(venc.getDate() + p * Number(financeiro.intervalo_dias))
          const vencStr = venc.toISOString().split('T')[0]

          await supabase.from('contas_pagar').insert({
            data_emissao: today(),
            descricao: parcelas > 1
              ? `NF ${nota.numero || 's/n'} — ${nota.fornecedor_nome} (${p+1}/${parcelas})`
              : `NF ${nota.numero || 's/n'} — ${nota.fornecedor_nome}`,
            valor: valorParcela,
            vencimento: vencStr,
            pago: false,
            categoria: 'Compra/Fornecedor',
            forma_pgto: financeiro.forma_pgto,
            conta_id: financeiro.conta_id || null,
            origem_id: entrada.id,
            origem_tabela: 'entradas_estoque',
            ativo: true,
          })
        }
      }

      const qtdAtualiz = itensAtualizados.filter(i => i.produto_id).length
      toast(`✅ Entrada confirmada! Estoque de ${qtdAtualiz} produto(s) atualizado.${financeiro.gerar ? ` ${financeiro.parcelas} parcela(s) gerada(s) em Contas a Pagar.` : ''}`, 'success')

      // Reset
      setNota({ numero:'', fornecedor_id:'', fornecedor_nome:'', data_emissao:today(), chave_nfe:'', obs:'' })
      setItens([])
      setFinanceiro({ gerar:false, forma_pgto:'Boleto', conta_id:'', vencimento1:today(), parcelas:1, intervalo_dias:30 })
      setGerarFinanceiro(false)
      setStep('itens')

    } catch (err) {
      toast('Erro ao confirmar entrada: ' + err.message, 'error')
    } finally {
      setProcessando(false)
    }
  }

  const fn = (k,v) => setNota(p => ({...p,[k]:v}))
  const ff = (k,v) => setFinanceiro(p => ({...p,[k]:v}))

  // Produtos filtrados pela busca
  const produtosFiltrados = (idx) => {
    const termo = (buscaProduto[idx]||'').toLowerCase()
    if (!termo) return produtos.slice(0,8)
    return produtos.filter(p => p.nome?.toLowerCase().includes(termo) || p.codigo?.toLowerCase().includes(termo)).slice(0,10)
  }

  return (
    <div style={{ maxWidth:900 }}>

      {/* Cabeçalho da nota */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-header">
          <span className="card-title"><FileText size={14} color="var(--accent)"/> Dados da Nota / Entrada</span>
          <div style={{ display:'flex', gap:8 }}>
            <input ref={fileRef} type="file" accept=".xml" style={{ display:'none' }} onChange={importarXML} />
            <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current.click()}>
              <Upload size={13}/> Importar XML NF-e
            </button>
          </div>
        </div>
        <div className="form-grid form-grid-2" style={{ marginTop:4 }}>
          <div className="form-group">
            <label className="form-label">Número da NF</label>
            <input className="form-input" value={nota.numero} onChange={e=>fn('numero',e.target.value)} placeholder="Ex: 001234" />
          </div>
          <div className="form-group">
            <label className="form-label">Data de Emissão</label>
            <input className="form-input" type="date" value={nota.data_emissao} onChange={e=>fn('data_emissao',e.target.value)} />
          </div>
          <div className="form-group" style={{ gridColumn:'1/-1' }}>
            <label className="form-label">Fornecedor</label>
            <select className="form-select" value={nota.fornecedor_id} onChange={e => {
              const f = fornecedores.find(x=>x.id===e.target.value)
              fn('fornecedor_id', e.target.value)
              fn('fornecedor_nome', f?.nome||'')
            }}>
              <option value="">Selecionar fornecedor...</option>
              {fornecedores.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          {nota.chave_nfe && (
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Chave NF-e</label>
              <input className="form-input" value={nota.chave_nfe} readOnly style={{ fontSize:11, opacity:.7, fontFamily:'var(--mono)' }} />
            </div>
          )}
          <div className="form-group" style={{ gridColumn:'1/-1' }}>
            <label className="form-label">Observações</label>
            <input className="form-input" value={nota.obs} onChange={e=>fn('obs',e.target.value)} placeholder="Opcional" />
          </div>
        </div>
      </div>

      {/* Itens */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-header">
          <span className="card-title"><PackagePlus size={14} color="var(--accent)"/> Itens da Entrada</span>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {itens.length > 0 && (
              <div style={{ fontSize:12, color:'var(--text2)' }}>
                <span style={{ color: itensVinculados > 0 ? 'var(--green)' : 'var(--text3)', fontWeight:700 }}>{itensVinculados} vinculados</span>
                {itensSemVinculo > 0 && <span style={{ color:'var(--yellow)', marginLeft:8, fontWeight:700 }}>⚠ {itensSemVinculo} sem vínculo</span>}
              </div>
            )}
            <button className="btn btn-primary btn-sm" onClick={addItem}><Plus size={13}/> Item</button>
          </div>
        </div>

        {itens.length === 0 ? (
          <div style={{ textAlign:'center', padding:'30px 20px', color:'var(--text3)' }}>
            <PackagePlus size={32} style={{ opacity:.3, marginBottom:10 }} />
            <p style={{ fontSize:13 }}>Importe um XML ou adicione itens manualmente</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {itens.map((item, idx) => {
              const exp = expandidoIdx === idx
              const vinculado = !!item.produto_id
              return (
                <div key={idx} style={{
                  border:`1px solid ${vinculado ? 'rgba(52,211,153,.3)' : 'rgba(251,191,36,.25)'}`,
                  borderRadius:10, overflow:'hidden',
                  background: vinculado ? 'rgba(52,211,153,.04)' : 'rgba(251,191,36,.04)'
                }}>
                  {/* Linha resumo */}
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', cursor:'pointer' }}
                    onClick={() => setExpandidoIdx(exp ? null : idx)}>
                    <span style={{ color: vinculado ? 'var(--green)' : 'var(--yellow)', flexShrink:0 }}>
                      {vinculado ? <CheckCircle size={16}/> : <AlertCircle size={16}/>}
                    </span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {item.descricao || <span style={{ color:'var(--text3)', fontStyle:'italic' }}>Sem descrição</span>}
                      </div>
                      <div style={{ fontSize:11, color:'var(--text2)', marginTop:1 }}>
                        Qtd: {item.qtd} · {fmt(item.valor_unit)}/un · Total: {fmt(Number(item.qtd)*Number(item.valor_unit))}
                        {vinculado && <span style={{ color:'var(--green)', marginLeft:8 }}>→ {item.produto_nome}</span>}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                      {exp ? <ChevronUp size={14} color="var(--text3)"/> : <ChevronDown size={14} color="var(--text3)"/>}
                      <button className="icon-btn del" onClick={e=>{e.stopPropagation();removeItem(idx)}}><Trash2 size={13}/></button>
                    </div>
                  </div>

                  {/* Detalhe expandido */}
                  {exp && (
                    <div style={{ padding:'0 14px 14px', borderTop:'1px solid var(--border)' }}>
                      <div className="form-grid form-grid-2" style={{ marginTop:12 }}>
                        <div className="form-group" style={{ gridColumn:'1/-1' }}>
                          <label className="form-label">Descrição do item</label>
                          <input className="form-input" value={item.descricao} onChange={e=>updateItem(idx,'descricao',e.target.value)} placeholder="Nome do produto na nota" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Cód. na NF</label>
                          <input className="form-input" value={item.codigo_nf} onChange={e=>updateItem(idx,'codigo_nf',e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Quantidade</label>
                          <input className="form-input" type="number" step="0.001" value={item.qtd} onChange={e=>updateItem(idx,'qtd',e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Valor Unitário</label>
                          <input className="form-input" type="number" step="0.01" value={item.valor_unit} onChange={e=>updateItem(idx,'valor_unit',e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Total item</label>
                          <input className="form-input" value={fmt(Number(item.qtd)*Number(item.valor_unit))} readOnly style={{ opacity:.7, fontWeight:700 }} />
                        </div>

                        {/* Vínculo com produto */}
                        <div className="form-group" style={{ gridColumn:'1/-1' }}>
                          <label className="form-label" style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <Link size={11}/> Vincular ao produto do cadastro
                            {vinculado
                              ? <span className="badge badge-green" style={{ fontSize:10 }}>✓ {item.produto_nome}</span>
                              : <span style={{ color:'var(--yellow)', fontSize:10, fontWeight:600 }}>Sem vínculo — será criado automaticamente ao confirmar</span>
                            }
                          </label>
                          {vinculado ? (
                            <button className="btn btn-sm btn-secondary" onClick={() => desvincular(idx)}>
                              <X size={12}/> Desvincular
                            </button>
                          ) : (
                            <div style={{ position:'relative' }}>
                              <div style={{ position:'relative' }}>
                                <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text3)' }}/>
                                <input className="form-input" style={{ paddingLeft:30 }}
                                  value={buscaProduto[idx]||''}
                                  onChange={e => setBuscaProduto(prev=>({...prev,[idx]:e.target.value}))}
                                  placeholder="Buscar produto para vincular..."
                                />
                              </div>
                              {(buscaProduto[idx] !== undefined) && (
                                <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--bg2)', border:'1px solid var(--border2)', borderRadius:8, zIndex:100, maxHeight:200, overflowY:'auto', marginTop:4, boxShadow:'var(--shadow)' }}>
                                  {produtosFiltrados(idx).map(p => (
                                    <div key={p.id} style={{ padding:'8px 12px', cursor:'pointer', fontSize:13, display:'flex', justifyContent:'space-between', borderBottom:'1px solid var(--border)' }}
                                      onClick={() => vincularProduto(idx, p.id)}
                                      onMouseEnter={e=>e.currentTarget.style.background='var(--bg3)'}
                                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                      <span style={{ fontWeight:600 }}>{p.nome}</span>
                                      <span style={{ color:'var(--text3)', fontSize:11 }}>Est: {p.estoque||0} {p.unidade}</span>
                                    </div>
                                  ))}
                                  {produtosFiltrados(idx).length === 0 && (
                                    <div style={{ padding:'10px 12px', color:'var(--text3)', fontSize:12 }}>Nenhum produto encontrado</div>
                                  )}
                                  <div style={{ padding:'8px 12px', cursor:'pointer', fontSize:12, color:'var(--accent)', fontWeight:700, borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:6 }}
                                    onClick={() => { criarProdutoDoItem(idx); setBuscaProduto(prev=>({...prev,[idx]:undefined})) }}
                                    onMouseEnter={e=>e.currentTarget.style.background='var(--bg3)'}
                                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                    <Plus size={12}/> Criar novo produto com este nome
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Resumo + financeiro */}
      {itens.length > 0 && (
        <div className="card" style={{ marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:11, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:.8 }}>Total da Nota</div>
              <div style={{ fontSize:24, fontWeight:900, fontFamily:'var(--mono)', color:'var(--accent)' }}>{fmt(totalNota)}</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span className={`badge ${itensVinculados===itens.length?'badge-green':'badge-yellow'}`}>
                {itensVinculados}/{itens.length} vinculados
              </span>
            </div>
          </div>

          {/* Toggle financeiro */}
          <div style={{ border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
            <div style={{ padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', background:'var(--bg3)' }}
              onClick={() => setGerarFinanceiro(!gerarFinanceiro)}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:20, height:20, borderRadius:5, border:`2px solid ${gerarFinanceiro?'var(--accent)':'var(--border2)'}`, background:gerarFinanceiro?'var(--accent)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .15s' }}>
                  {gerarFinanceiro && <CheckCircle size={12} color="white"/>}
                </div>
                <div>
                  <div style={{ fontWeight:700, fontSize:13 }}>Gerar Conta a Pagar</div>
                  <div style={{ fontSize:11, color:'var(--text2)' }}>Lança o valor em Contas a Pagar ao confirmar a entrada</div>
                </div>
              </div>
              {gerarFinanceiro ? <ChevronUp size={15} color="var(--text3)"/> : <ChevronDown size={15} color="var(--text3)"/>}
            </div>

            {gerarFinanceiro && (
              <div className="form-grid form-grid-2" style={{ padding:'14px 16px' }}>
                <div className="form-group">
                  <label className="form-label">Forma de Pagamento</label>
                  <select className="form-select" value={financeiro.forma_pgto} onChange={e=>ff('forma_pgto',e.target.value)}>
                    {FORMAS.map(f=><option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Conta / Carteira</label>
                  <select className="form-select" value={financeiro.conta_id} onChange={e=>ff('conta_id',e.target.value)}>
                    <option value="">Nenhuma</option>
                    {contas.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">1º Vencimento</label>
                  <input className="form-input" type="date" value={financeiro.vencimento1} onChange={e=>ff('vencimento1',e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Nº de Parcelas</label>
                  <select className="form-select" value={financeiro.parcelas} onChange={e=>ff('parcelas',Number(e.target.value))}>
                    {[1,2,3,4,6,8,10,12].map(n=><option key={n} value={n}>{n}x {n>1?`de ${fmt(totalNota/n)}`:''}</option>)}
                  </select>
                </div>
                {financeiro.parcelas > 1 && (
                  <div className="form-group">
                    <label className="form-label">Intervalo entre parcelas</label>
                    <select className="form-select" value={financeiro.intervalo_dias} onChange={e=>ff('intervalo_dias',Number(e.target.value))}>
                      <option value={30}>30 dias</option>
                      <option value={60}>60 dias</option>
                      <option value={90}>90 dias</option>
                    </select>
                  </div>
                )}
                {financeiro.parcelas > 1 && (
                  <div style={{ gridColumn:'1/-1', background:'var(--bg3)', borderRadius:8, padding:'10px 14px', fontSize:12 }}>
                    <strong>{financeiro.parcelas}x</strong> de <strong style={{ color:'var(--accent)', fontFamily:'var(--mono)' }}>{fmt(totalNota/financeiro.parcelas)}</strong>
                    {' '}com vencimentos a cada <strong>{financeiro.intervalo_dias} dias</strong> a partir de {new Date(financeiro.vencimento1+'T12:00:00').toLocaleDateString('pt-BR')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Botão confirmar */}
      {itens.length > 0 && (
        <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
          <button className="btn btn-secondary" onClick={() => { setItens([]); setNota({numero:'',fornecedor_id:'',fornecedor_nome:'',data_emissao:today(),chave_nfe:'',obs:''}) }}>
            Limpar tudo
          </button>
          <button className="btn btn-primary" onClick={() => setConfirmandoEntrada(true)} disabled={processando}>
            <CheckCircle size={15}/>
            {processando ? 'Processando...' : `Confirmar Entrada${itensVinculados > 0 ? ` (${itensVinculados} produto${itensVinculados>1?'s':''})` : ''}`}
          </button>
        </div>
      )}

      {confirmandoEntrada && (
        <ConfirmDialog
          title="Confirmar Entrada de Estoque"
          confirmLabel="✓ Confirmar Entrada"
          confirmStyle="success"
          message={`Ao confirmar:\n\n${itensVinculados > 0 ? `• ${itensVinculados} produto(s) vinculados terão estoque atualizado\n` : ''}${itensSemVinculo > 0 ? `• ${itensSemVinculo} item(ns) sem vínculo serão criados automaticamente no cadastro\n` : ''}• Total da nota: ${fmt(totalNota)}${gerarFinanceiro ? `\n• ${financeiro.parcelas}x de ${fmt(totalNota/financeiro.parcelas)} gerado em Contas a Pagar` : '\n• Sem lançamento financeiro'}`}
          onConfirm={confirmarEntrada}
          onCancel={() => setConfirmandoEntrada(false)}
        />
      )}
    </div>
  )
}
