/**
 * PortalCliente.jsx
 * Portal público de acompanhamento de obra — sem login.
 * Acesso via: https://seudominio.com.br?obra=TOKEN
 * Layout inspirado no relatório de impressão, responsivo para celular e desktop.
 */

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const fmt  = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const fmtD = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'

const STATUS_LABEL = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada' }
const STATUS_COLOR = { pendente: '#94a3b8', em_andamento: '#2a6ef5', concluida: '#38a169', cancelada: '#e53e3e' }

export default function PortalCliente({ token, clienteToken }) {
  const [obra, setObra]       = useState(null)
  const [etapas, setEtapas]   = useState([])
  const [lancs, setLancs]     = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro]       = useState(null)
  const [preview, setPreview] = useState(null)
  // Modo cliente: lista de obras do cliente (via token do cliente)
  const [listaObras, setListaObras]   = useState(null)  // null = modo obra única
  const [clienteNome, setClienteNome] = useState('')

  useEffect(() => {
    if (clienteToken) loadCliente()
    else if (token) load()
  }, [token, clienteToken])

  // ── Modo cliente: lista todas as obras via RPC segura ──
  async function loadCliente() {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_portal_cliente', { p_token: clienteToken })
    if (error || !data || data.length === 0) {
      setErro('Link inválido ou expirado.'); setLoading(false); return
    }
    setClienteNome(data[0].cliente_nome || '')
    setListaObras(data)
    setLoading(false)
  }

  // ── Modo cliente: abre uma obra específica via RPC ──
  async function abrirObra(obraId) {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_portal_obra', { p_token: clienteToken, p_obra_id: obraId })
    if (error || !data) { setErro('Não foi possível abrir esta obra.'); setLoading(false); return }
    setObra(data.obra)
    setEtapas(data.etapas || [])
    setLancs(data.lancamentos || [])
    setLoading(false)
  }

  function voltarLista() {
    setObra(null); setEtapas([]); setLancs([])
  }

  // ── Modo obra única (link antigo ?obra=) ──
  async function load() {
    setLoading(true)
    const { data: obraData, error } = await supabase
      .from('obras').select('*').eq('token_publico', token).maybeSingle()

    if (error || !obraData) { setErro('Link inválido ou expirado.'); setLoading(false); return }
    setObra(obraData)

    const [{ data: et }, { data: la }] = await Promise.all([
      supabase.from('obra_etapas').select('*').eq('obra_id', obraData.id).order('ordem'),
      supabase.from('obra_lancamentos').select('*').eq('obra_id', obraData.id).order('data_ref', { ascending: false }),
    ])
    setEtapas(et || [])
    setLancs(la || [])
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", background:'#f5f4f0' }}>
      <div style={{ width:36, height:36, border:'3px solid #e0e0e0', borderTop:'3px solid #1a2744', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <p style={{ color:'#888', marginTop:12, fontSize:13 }}>Carregando...</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (erro) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", background:'#f5f4f0', padding:24 }}>
      <div style={{ fontSize:48, marginBottom:12 }}>🔒</div>
      <p style={{ color:'#e53e3e', fontWeight:700, fontSize:16 }}>{erro}</p>
      <p style={{ color:'#888', fontSize:12, marginTop:6 }}>Solicite um novo link ao responsável pela obra.</p>
    </div>
  )

  // ── Tela: lista de obras do cliente ──
  if (listaObras && !obra) {
    const fmtC = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    return (
      <div style={{ fontFamily:"'DM Sans',sans-serif", background:'#f0efe9', minHeight:'100vh' }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <style>{`*{box-sizing:border-box;margin:0;padding:0}`}</style>
        <div style={{ maxWidth:680, margin:'0 auto', padding:'0 0 40px' }}>
          <div style={{ background:'#1a2744', padding:'20px 20px 26px' }}>
            <div style={{ fontSize:9, color:'#e8a030', textTransform:'uppercase', letterSpacing:'.8px', fontWeight:700, marginBottom:6 }}>Portal do Cliente</div>
            <h1 style={{ fontSize:22, fontWeight:700, color:'#fff', letterSpacing:'-.3px' }}>{clienteNome}</h1>
            <p style={{ fontSize:12, color:'rgba(255,255,255,.55)', marginTop:4 }}>
              {listaObras.length === 1 ? '1 obra' : listaObras.length + ' obras'} — toque para acompanhar
            </p>
          </div>
          <div style={{ padding:'14px 16px 0', display:'flex', flexDirection:'column', gap:10 }}>
            {listaObras.map(ob => {
              const st = { planejamento:'#94a3b8', em_andamento:'#2a6ef5', concluida:'#38a169', pausada:'#e8a030', cancelada:'#e53e3e' }[ob.status] || '#94a3b8'
              const stLabel = { planejamento:'Planejamento', em_andamento:'Em andamento', concluida:'Concluída', pausada:'Pausada', cancelada:'Cancelada' }[ob.status] || ob.status
              return (
                <div key={ob.obra_id} onClick={() => abrirObra(ob.obra_id)}
                  style={{ background:'#fff', borderRadius:12, padding:'14px 16px', boxShadow:'0 2px 8px rgba(0,0,0,.07)', cursor:'pointer', borderLeft:'3px solid ' + st }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
                    <div style={{ fontSize:15, fontWeight:700, color:'#1a2744' }}>{ob.obra_nome}</div>
                    <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:20, background:st+'22', color:st, whiteSpace:'nowrap', flexShrink:0 }}>{stLabel}</span>
                  </div>
                  <div style={{ display:'flex', gap:16, marginTop:8, fontSize:11, color:'#888' }}>
                    {Number(ob.valor_contratado) > 0 && <span>Contratado: <strong style={{ fontFamily:'monospace', color:'#2a6ef5' }}>{fmtC(ob.valor_contratado)}</strong></span>}
                    <span>Gasto: <strong style={{ fontFamily:'monospace', color:'#e53e3e' }}>{fmtC(ob.total_gasto)}</strong></span>
                    <span>Recebido: <strong style={{ fontFamily:'monospace', color:'#38a169' }}>{fmtC(ob.total_recebido)}</strong></span>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ textAlign:'center', padding:'24px 16px 0', fontSize:11, color:'#aaa' }}>
            <p>Powered by <strong style={{ color:'#888' }}>GestãoFam</strong></p>
          </div>
        </div>
      </div>
    )
  }

  const totalGasto    = lancs.filter(l => l.tipo === 'despesa').reduce((s, l) => s + Number(l.valor || 0), 0)
  const totalRecebido = lancs.filter(l => l.tipo === 'receita').reduce((s, l) => s + Number(l.valor || 0), 0)
  const valorContrat  = Number(obra.valor_contratado || 0)
  const saldo         = totalRecebido - totalGasto
  const percOrc       = valorContrat > 0 ? Math.min(100, (totalGasto / valorContrat) * 100) : 0
  const etapasConcl   = etapas.filter(e => e.status === 'concluida').length
  const corStatus     = STATUS_COLOR[obra.status] || '#94a3b8'

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:'#f0efe9', minHeight:'100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box;margin:0;padding:0}
        .portal-wrap{max-width:680px;margin:0 auto;padding:0 0 40px}
        .sec{background:#fff;border-radius:12px;overflow:hidden;margin:12px 16px 0;box-shadow:0 2px 12px rgba(0,0,0,.06)}
        .sec-title{font-size:10px;font-weight:700;color:#1a2744;text-transform:uppercase;letter-spacing:.8px;padding:14px 16px 10px;border-bottom:1px solid #f0ede6;display:flex;align-items:center;gap:6px}
        .sec-title::before{content:'';width:3px;height:14px;background:#1a2744;border-radius:2px;flex-shrink:0}
        .bar-bg{height:6px;background:#f0ede6;border-radius:3px;overflow:hidden}
        .bar-fill{height:100%;border-radius:3px;transition:width .4s}
        @media(min-width:600px){.portal-wrap{padding:20px 0 60px}.sec{margin:16px 0 0}.cards-grid{grid-template-columns:repeat(4,1fr)!important}}
        .btn-print-portal{position:fixed;top:14px;right:14px;z-index:999;background:#1a2744;color:#fff;border:none;border-radius:24px;padding:10px 18px;font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2);display:flex;align-items:center;gap:6px}
        @media print{
          .btn-print-portal{display:none}
          .btn-voltar-obras{display:none}
          body{background:#fff}
          .sec{box-shadow:none;border:1px solid #eee}
        }
      `}</style>

      <button className="btn-print-portal" onClick={() => window.print()}>
        🖨️ Salvar PDF
      </button>

      <div className="portal-wrap">

        {/* ── Header ─────────────────────────────────────────── */}
        <div style={{ background:'#1a2744', padding:'16px 20px 20px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
            {/* Logo / empresa */}
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              {obra.empresa_logo
                ? <img src={obra.empresa_logo} style={{ height:40, maxWidth:100, objectFit:'contain' }} alt="Logo" />
                : <div style={{ width:40, height:40, background:'#e8a030', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:18, color:'#1a2744', flexShrink:0 }}>
                    {(obra.empresa_nome || 'G').charAt(0)}
                  </div>
              }
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{obra.empresa_nome || 'GestãoFam'}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,.5)', textTransform:'uppercase', letterSpacing:'.5px' }}>Portal do Cliente</div>
              </div>
            </div>
            {/* Status badge */}
            <div style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(255,255,255,.1)', padding:'4px 10px', borderRadius:20, fontSize:11, color:'#fff' }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:corStatus, display:'inline-block' }} />
              {STATUS_LABEL[obra.status] || obra.status}
            </div>
          </div>

          {/* Título da obra */}
          {listaObras && (
            <button onClick={voltarLista} className="btn-voltar-obras"
              style={{ background:'rgba(255,255,255,.12)', border:'none', color:'#fff', fontSize:12, padding:'6px 14px', borderRadius:20, cursor:'pointer', marginBottom:12 }}>
              ← Minhas obras
            </button>
          )}
          <div style={{ fontSize:9, color:'#e8a030', textTransform:'uppercase', letterSpacing:'.8px', fontWeight:700, marginBottom:6 }}>Acompanhamento de obra</div>
          <h1 style={{ fontSize:22, fontWeight:700, color:'#fff', letterSpacing:'-.3px', lineHeight:1.2, marginBottom:6 }}>{obra.nome}</h1>
          {obra.cliente_nome && <p style={{ fontSize:12, color:'rgba(255,255,255,.6)' }}>Cliente: {obra.cliente_nome}</p>}
          {obra.data_inicio && (
            <p style={{ fontSize:12, color:'rgba(255,255,255,.5)', marginTop:2 }}>
              Início: {fmtD(obra.data_inicio)}{obra.data_fim ? ` · Previsão de conclusão: ${fmtD(obra.data_fim)}` : ''}
            </p>
          )}
        </div>

        {/* ── Cards resumo ────────────────────────────────────── */}
        <div className="cards-grid" style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, padding:'12px 16px 0', marginTop:-10 }}>
          {valorContrat > 0 && (
            <div style={{ background:'#fff', borderRadius:10, padding:'12px 14px', boxShadow:'0 2px 8px rgba(0,0,0,.08)', borderLeft:'3px solid #2a6ef5' }}>
              <div style={{ fontSize:9, color:'#999', textTransform:'uppercase', letterSpacing:'.4px', marginBottom:4 }}>Contratado</div>
              <div style={{ fontSize:15, fontWeight:700, fontFamily:'monospace', color:'#2a6ef5' }}>{fmt(valorContrat)}</div>
            </div>
          )}
          <div style={{ background:'#fff', borderRadius:10, padding:'12px 14px', boxShadow:'0 2px 8px rgba(0,0,0,.08)', borderLeft:'3px solid #e53e3e' }}>
            <div style={{ fontSize:9, color:'#999', textTransform:'uppercase', letterSpacing:'.4px', marginBottom:4 }}>Total gasto</div>
            <div style={{ fontSize:15, fontWeight:700, fontFamily:'monospace', color:'#e53e3e' }}>{fmt(totalGasto)}</div>
          </div>
          <div style={{ background:'#fff', borderRadius:10, padding:'12px 14px', boxShadow:'0 2px 8px rgba(0,0,0,.08)', borderLeft:'3px solid #38a169' }}>
            <div style={{ fontSize:9, color:'#999', textTransform:'uppercase', letterSpacing:'.4px', marginBottom:4 }}>Total recebido</div>
            <div style={{ fontSize:15, fontWeight:700, fontFamily:'monospace', color:'#38a169' }}>{fmt(totalRecebido)}</div>
          </div>
          <div style={{ background:'#fff', borderRadius:10, padding:'12px 14px', boxShadow:'0 2px 8px rgba(0,0,0,.08)', borderLeft:`3px solid ${saldo >= 0 ? '#38a169' : '#e53e3e'}` }}>
            <div style={{ fontSize:9, color:'#999', textTransform:'uppercase', letterSpacing:'.4px', marginBottom:4 }}>Saldo</div>
            <div style={{ fontSize:15, fontWeight:700, fontFamily:'monospace', color: saldo >= 0 ? '#38a169' : '#e53e3e' }}>{fmt(Math.abs(saldo))}</div>
          </div>
        </div>

        {/* ── Progresso ───────────────────────────────────────── */}
        {(valorContrat > 0 || etapas.length > 0) && (
          <div className="sec">
            <div className="sec-title">Progresso</div>
            <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:12 }}>
              {valorContrat > 0 && (
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ fontSize:12, color:'#555' }}>Orçamento utilizado</span>
                    <span style={{ fontSize:12, fontWeight:700, color:'#1a2744' }}>{percOrc.toFixed(0)}%</span>
                  </div>
                  <div className="bar-bg">
                    <div className="bar-fill" style={{ width: percOrc + '%', background: percOrc > 90 ? '#e53e3e' : '#e8a030' }} />
                  </div>
                </div>
              )}
              {etapas.length > 0 && (
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ fontSize:12, color:'#555' }}>Etapas concluídas</span>
                    <span style={{ fontSize:12, fontWeight:700, color:'#1a2744' }}>{etapasConcl} de {etapas.length}</span>
                  </div>
                  <div className="bar-bg">
                    <div className="bar-fill" style={{ width: (etapasConcl / etapas.length * 100) + '%', background:'#38a169' }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Etapas ──────────────────────────────────────────── */}
        {etapas.length > 0 && (
          <div className="sec">
            <div className="sec-title">Etapas</div>
            <div style={{ padding:'0 16px' }}>
              {etapas.map((e, i) => {
                const gasto  = Number(e.valor_gasto || 0)
                const orcado = Number(e.valor_orcado || 0)
                const perc   = orcado > 0 ? Math.min(100, (gasto / orcado) * 100) : 0
                const cor    = STATUS_COLOR[e.status] || '#94a3b8'
                return (
                  <div key={e.id} style={{ padding:'12px 0', borderBottom: i < etapas.length - 1 ? '1px solid #f5f4f0' : 'none' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom: orcado > 0 ? 8 : 0 }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:'#1a2744' }}>{e.nome}</div>
                        {e.descricao && <div style={{ fontSize:11, color:'#888', marginTop:2 }}>{e.descricao}</div>}
                      </div>
                      <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:20, background: cor + '22', color: cor, whiteSpace:'nowrap', flexShrink:0 }}>
                        {STATUS_LABEL[e.status] || e.status}
                      </span>
                    </div>
                    {orcado > 0 && (
                      <>
                        <div className="bar-bg">
                          <div className="bar-fill" style={{ width: perc + '%', background: cor }} />
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', marginTop:4, fontSize:11, color:'#888' }}>
                          <span>{fmt(gasto)} gasto</span>
                          <span>de {fmt(orcado)}</span>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Movimentações ───────────────────────────────────── */}
        {lancs.length > 0 && (
          <div className="sec">
            <div className="sec-title">Movimentações</div>
            <div style={{ padding:'0 16px' }}>
              {lancs.slice(0, 30).map((l, i) => {
                const fotos = Array.isArray(l.imagens_url) ? l.imagens_url : (l.imagens_url ? [l.imagens_url] : [])
                return (
                  <div key={l.id} style={{ padding:'10px 0', borderBottom: i < Math.min(lancs.length, 30) - 1 ? '1px solid #f5f4f0' : 'none' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:500, color:'#1a2744' }}>{l.descricao}</div>
                        <div style={{ fontSize:11, color:'#888', marginTop:2, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                          <span>{fmtD(l.data_ref)}{l.fonte_nome ? ` · ${l.fonte_nome}` : ''}</span>
                          {l.status_prazo === 'pendente' && (
                            <span style={{ fontSize:9, fontWeight:700, padding:'1px 7px', borderRadius:20, background:'#fef3c7', color:'#b45309' }}>Pendente</span>
                          )}
                          {l.status_prazo === 'pago' && (
                            <span style={{ fontSize:9, fontWeight:700, padding:'1px 7px', borderRadius:20, background:'#dcfce7', color:'#15803d' }}>Pago</span>
                          )}
                        </div>
                        {l.obs && (
                          <div style={{ fontSize:12, color:'#555', marginTop:5, padding:'6px 10px', background:'#f8f7f4', borderRadius:6, borderLeft:'2px solid #e8e8e8', lineHeight:1.5 }}>
                            {l.obs}
                          </div>
                        )}
                        {/* Itens detalhados (materiais) */}
                        {Array.isArray(l.itens) && l.itens.length > 0 && (
                          <ul style={{ margin:'6px 0 0', paddingLeft:16, fontSize:11, color:'#666' }}>
                            {l.itens.map((it, ii) => (
                              <li key={ii} style={{ marginBottom:2 }}>
                                {it.quantidade}x {it.descricao} — {fmt(it.valor_unitario)}/un = {fmt(it.valor_total)}
                              </li>
                            ))}
                          </ul>
                        )}
                        {/* Fotos do lançamento */}
                        {fotos.length > 0 && (
                          <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
                            {fotos.map((url, fi) => (
                              <img key={fi} src={url} alt={`Foto ${fi+1}`}
                                onClick={() => setPreview(url)}
                                style={{ width:60, height:60, objectFit:'cover', borderRadius:6, cursor:'pointer', border:'1px solid #e8e8e8' }} />
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, fontFamily:'monospace', color: l.tipo === 'receita' ? '#38a169' : '#e53e3e', whiteSpace:'nowrap', flexShrink:0 }}>
                        {l.tipo === 'receita' ? '+' : '−'} {fmt(l.valor)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Posição financeira ──────────────────────────────── */}
        <div style={{ background:'#1a2744', borderRadius:12, margin:'12px 16px 0', padding:16 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,.5)', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:12 }}>Posição Financeira</div>
          {valorContrat > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,.08)' }}>
              <span style={{ fontSize:12, color:'rgba(255,255,255,.7)' }}>Valor contratado</span>
              <span style={{ fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#fff' }}>{fmt(valorContrat)}</span>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,.08)' }}>
            <span style={{ fontSize:12, color:'rgba(255,255,255,.7)' }}>Total recebido</span>
            <span style={{ fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#6ee7b7' }}>{fmt(totalRecebido)}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,.08)' }}>
            <span style={{ fontSize:12, color:'rgba(255,255,255,.7)' }}>Total gasto</span>
            <span style={{ fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#fca5a5' }}>{fmt(totalGasto)}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0 0', borderTop:'1px solid rgba(255,255,255,.15)', marginTop:6 }}>
            <div>
              <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>
                {saldo === 0 ? 'Quitado' : saldo < 0 ? 'A receber do cliente' : 'Saldo'}
              </span>
              {saldo < 0 && (
                <div style={{ fontSize:10, color:'rgba(255,255,255,.4)', marginTop:2 }}>Valor pendente de pagamento</div>
              )}
            </div>
            <span style={{ fontFamily:'monospace', fontSize:18, fontWeight:700, color: saldo === 0 ? '#94a3b8' : saldo < 0 ? '#fca5a5' : '#e8a030' }}>
              {saldo === 0 ? '—' : fmt(Math.abs(saldo))}
            </span>
          </div>
        </div>

        {/* ── Rodapé ──────────────────────────────────────────── */}
        <div style={{ textAlign:'center', padding:'24px 16px 0', fontSize:11, color:'#aaa' }}>
          <p>Powered by <strong style={{ color:'#888' }}>GestãoFam</strong></p>
          <p style={{ marginTop:4 }}>Atualizado em {new Date().toLocaleDateString('pt-BR')}</p>
        </div>

      </div>

      {/* ── Lightbox ────────────────────────────────────────── */}
      {preview && (
        <div onClick={() => setPreview(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.92)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <img src={preview} alt="Preview"
            style={{ maxWidth:'90vw', maxHeight:'90vh', borderRadius:8, objectFit:'contain' }}
            onClick={e => e.stopPropagation()} />
          <button onClick={() => setPreview(null)}
            style={{ position:'absolute', top:16, right:16, background:'rgba(255,255,255,.15)', border:'none', color:'#fff', width:36, height:36, borderRadius:'50%', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
