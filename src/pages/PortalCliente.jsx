/**
 * PortalCliente.jsx
 * Página pública de acompanhamento de obra — sem login.
 * Acesso via: https://seudominio.com.br?obra=TOKEN
 */

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const fmt  = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const fmtD = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'

const STATUS_LABEL = { pendente:'Pendente', em_andamento:'Em andamento', concluida:'Concluída', cancelada:'Cancelada' }
const STATUS_COLOR = { pendente:'#94a3b8', em_andamento:'#2a6ef5', concluida:'#38a169', cancelada:'#e53e3e' }

export default function PortalCliente({ token }) {
  const [obra, setObra]         = useState(null)
  const [etapas, setEtapas]     = useState([])
  const [lancs, setLancs]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [erro, setErro]         = useState(null)
  const [preview, setPreview]   = useState(null)

  useEffect(() => { if (token) load() }, [token])

  async function load() {
    setLoading(true)

    // Busca obra pelo token (sem autenticação — RLS anon)
    const { data: obraData, error: obraErr } = await supabase
      .from('obras')
      .select('*')
      .eq('token_publico', token)
      .maybeSingle()

    if (obraErr || !obraData) {
      setErro('Link inválido ou expirado.')
      setLoading(false)
      return
    }

    setObra(obraData)

    // Busca etapas e lançamentos em paralelo
    const [{ data: etapasData }, { data: lancsData }] = await Promise.all([
      supabase.from('obra_etapas').select('*').eq('obra_id', obraData.id).order('ordem'),
      supabase.from('obra_lancamentos').select('*').eq('obra_id', obraData.id).order('data_ref', { ascending: false }),
    ])

    setEtapas(etapasData || [])
    setLancs(lancsData || [])
    setLoading(false)
  }

  if (loading) return (
    <div style={s.center}>
      <div style={s.spinner} />
      <p style={{ color: '#666', marginTop: 12, fontSize: 13 }}>Carregando...</p>
    </div>
  )

  if (erro) return (
    <div style={s.center}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
      <p style={{ color: '#e53e3e', fontWeight: 600 }}>{erro}</p>
      <p style={{ color: '#888', fontSize: 12, marginTop: 6 }}>Solicite um novo link ao responsável pela obra.</p>
    </div>
  )

  const totalGasto     = lancs.filter(l => l.tipo === 'despesa').reduce((s, l) => s + Number(l.valor || 0), 0)
  const totalRecebido  = lancs.filter(l => l.tipo === 'receita').reduce((s, l) => s + Number(l.valor || 0), 0)
  const valorContrat   = Number(obra.valor_contratado || 0)
  const percOrcamento  = valorContrat > 0 ? Math.min(100, (totalGasto / valorContrat) * 100) : 0
  const etapasConcl    = etapas.filter(e => e.status === 'concluida').length
  const percEtapas     = etapas.length > 0 ? Math.round((etapasConcl / etapas.length) * 100) : 0
  const fotos          = obra.fotos_progresso || []

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerInner}>
          <div style={s.logo}>
            {obra.empresa_logo
              ? <img src={obra.empresa_logo} style={{ height: 36, objectFit: 'contain' }} alt="Logo" />
              : <div style={s.logoMark}>{(obra.empresa_nome || 'E').charAt(0)}</div>}
            <div>
              <div style={s.empNome}>{obra.empresa_nome || 'GestãoFam'}</div>
              <div style={s.headerBadge}>Portal do Cliente</div>
            </div>
          </div>
          <div style={s.badgeStatus}>
            <span style={{ ...s.dot, background: STATUS_COLOR[obra.status] || '#94a3b8' }} />
            {STATUS_LABEL[obra.status] || obra.status}
          </div>
        </div>
      </div>

      <div style={s.body}>
        {/* Hero */}
        <div style={s.hero}>
          <div style={s.heroTag}>Acompanhamento de obra</div>
          <h1 style={s.heroTitle}>{obra.nome}</h1>
          {obra.cliente_nome && <p style={s.heroSub}>Cliente: {obra.cliente_nome}</p>}
          {obra.data_inicio && <p style={s.heroSub}>Início: {fmtD(obra.data_inicio)}{obra.data_fim ? ` · Previsão: ${fmtD(obra.data_fim)}` : ''}</p>}
        </div>

        {/* Cards */}
        <div style={s.cards}>
          {valorContrat > 0 && (
            <div style={s.card}>
              <div style={s.cardLabel}>Contratado</div>
              <div style={{ ...s.cardVal, color: '#2a6ef5' }}>{fmt(valorContrat)}</div>
            </div>
          )}
          <div style={s.card}>
            <div style={s.cardLabel}>Gasto</div>
            <div style={{ ...s.cardVal, color: '#e53e3e' }}>{fmt(totalGasto)}</div>
          </div>
          <div style={s.card}>
            <div style={s.cardLabel}>Recebido</div>
            <div style={{ ...s.cardVal, color: '#38a169' }}>{fmt(totalRecebido)}</div>
          </div>
          {etapas.length > 0 && (
            <div style={s.card}>
              <div style={s.cardLabel}>Etapas</div>
              <div style={{ ...s.cardVal, color: '#1a2744' }}>{etapasConcl}/{etapas.length}</div>
            </div>
          )}
        </div>

        {/* Progresso */}
        {(valorContrat > 0 || etapas.length > 0) && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Progresso</div>
            {valorContrat > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={s.progressRow}>
                  <span style={s.progressLabel}>Orçamento utilizado</span>
                  <span style={s.progressPct}>{percOrcamento.toFixed(0)}%</span>
                </div>
                <div style={s.barBg}>
                  <div style={{ ...s.barFill, width: percOrcamento + '%', background: percOrcamento > 90 ? '#e53e3e' : '#e8a030' }} />
                </div>
              </div>
            )}
            {etapas.length > 0 && (
              <div>
                <div style={s.progressRow}>
                  <span style={s.progressLabel}>Etapas concluídas</span>
                  <span style={s.progressPct}>{percEtapas}%</span>
                </div>
                <div style={s.barBg}>
                  <div style={{ ...s.barFill, width: percEtapas + '%', background: '#38a169' }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Etapas */}
        {etapas.length > 0 && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Etapas</div>
            {etapas.map(e => {
              const gasto   = Number(e.valor_gasto || 0)
              const orcado  = Number(e.valor_orcado || 0)
              const perc    = orcado > 0 ? Math.min(100, (gasto / orcado) * 100) : 0
              const cor     = STATUS_COLOR[e.status] || '#94a3b8'
              return (
                <div key={e.id} style={s.etapaCard}>
                  <div style={s.etapaHeader}>
                    <div>
                      <div style={s.etapaNome}>{e.nome}</div>
                      {e.descricao && <div style={s.etapaDesc}>{e.descricao}</div>}
                    </div>
                    <span style={{ ...s.badge, background: cor + '22', color: cor }}>
                      {STATUS_LABEL[e.status] || e.status}
                    </span>
                  </div>
                  {orcado > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={s.barBg}>
                        <div style={{ ...s.barFill, width: perc + '%', background: cor }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: '#888' }}>
                        <span>{fmt(gasto)} gasto</span>
                        <span>de {fmt(orcado)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Fotos de progresso */}
        {fotos.length > 0 && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Fotos de Progresso</div>
            <div style={s.fotosGrid}>
              {fotos.map((url, i) => (
                <img key={i} src={url} alt={`Foto ${i+1}`}
                  onClick={() => setPreview(url)}
                  style={s.fotoThumb} />
              ))}
            </div>
          </div>
        )}

        {/* Lançamentos recentes */}
        {lancs.length > 0 && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Movimentações Recentes</div>
            {lancs.slice(0, 20).map(l => (
              <div key={l.id} style={s.lancCard}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.lancDesc}>{l.descricao}</div>
                  <div style={s.lancMeta}>{fmtD(l.data_ref)}{l.etapa_nome ? ` · ${l.etapa_nome}` : ''}</div>
                </div>
                <div style={{ ...s.lancVal, color: l.tipo === 'receita' ? '#38a169' : '#e53e3e' }}>
                  {l.tipo === 'receita' ? '+' : '−'} {fmt(l.valor)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Posição financeira */}
        <div style={s.posicao}>
          <div style={s.posicaoTitle}>Posição Financeira</div>
          {valorContrat > 0 && (
            <div style={s.posicaoRow}>
              <span style={s.posicaoLabel}>Valor contratado</span>
              <span style={s.posicaoVal}>{fmt(valorContrat)}</span>
            </div>
          )}
          <div style={s.posicaoRow}>
            <span style={s.posicaoLabel}>Total recebido</span>
            <span style={{ ...s.posicaoVal, color: '#6ee7b7' }}>{fmt(totalRecebido)}</span>
          </div>
          <div style={s.posicaoRow}>
            <span style={s.posicaoLabel}>Total gasto</span>
            <span style={{ ...s.posicaoVal, color: '#fca5a5' }}>{fmt(totalGasto)}</span>
          </div>
          {valorContrat > 0 && (
            <div style={{ ...s.posicaoRow, ...s.posicaoDestaque }}>
              <span style={{ ...s.posicaoLabel, color: '#fff', fontWeight: 700 }}>A receber</span>
              <span style={{ ...s.posicaoVal, color: '#e8a030', fontSize: 18 }}>{fmt(valorContrat - totalRecebido)}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <p>Powered by <strong>GestãoFam</strong></p>
          <p style={{ marginTop: 4, fontSize: 11 }}>Atualizado em {new Date().toLocaleDateString('pt-BR')}</p>
        </div>
      </div>

      {/* Lightbox */}
      {preview && (
        <div onClick={() => setPreview(null)} style={s.lightbox}>
          <img src={preview} alt="Preview" style={s.lightboxImg} onClick={e => e.stopPropagation()} />
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}

const s = {
  page:     { minHeight: '100vh', background: '#f5f4f0', fontFamily: "'DM Sans', sans-serif" },
  center:   { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24 },
  spinner:  { width: 32, height: 32, border: '3px solid #e0e0e0', borderTop: '3px solid #1a2744', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  header:   { background: '#1a2744', padding: '0 20px' },
  headerInner: { maxWidth: 480, margin: '0 auto', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo:     { display: 'flex', alignItems: 'center', gap: 10 },
  logoMark: { width: 36, height: 36, background: '#e8a030', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, color: '#1a2744' },
  empNome:  { fontSize: 13, fontWeight: 700, color: '#fff' },
  headerBadge: { fontSize: 9, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.5px' },
  badgeStatus: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(255,255,255,.8)', background: 'rgba(255,255,255,.1)', padding: '4px 10px', borderRadius: 20 },
  dot:      { width: 7, height: 7, borderRadius: '50%' },
  body:     { maxWidth: 480, margin: '0 auto', padding: '0 0 32px' },
  hero:     { background: '#1a2744', padding: '20px 20px 28px' },
  heroTag:  { fontSize: 10, color: '#e8a030', textTransform: 'uppercase', letterSpacing: '.8px', fontWeight: 700, marginBottom: 6 },
  heroTitle: { fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-.3px', marginBottom: 4 },
  heroSub:  { fontSize: 12, color: 'rgba(255,255,255,.55)', marginTop: 2 },
  cards:    { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, padding: '16px 16px 0', marginTop: -12 },
  card:     { background: '#fff', borderRadius: 10, padding: '12px 14px', boxShadow: '0 2px 8px rgba(0,0,0,.08)' },
  cardLabel: { fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 },
  cardVal:  { fontSize: 16, fontWeight: 700, fontFamily: 'monospace' },
  section:  { margin: '16px 16px 0', background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.06)' },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#1a2744', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f0f0f0' },
  progressRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 5 },
  progressLabel: { fontSize: 12, color: '#555' },
  progressPct: { fontSize: 12, fontWeight: 700, color: '#1a2744' },
  barBg:    { height: 6, background: '#f0ede6', borderRadius: 3, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 3, transition: 'width .4s' },
  etapaCard: { padding: '10px 0', borderBottom: '1px solid #f5f4f0' },
  etapaHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  etapaNome: { fontSize: 13, fontWeight: 600, color: '#1a2744' },
  etapaDesc: { fontSize: 11, color: '#888', marginTop: 2 },
  badge:    { fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 },
  fotosGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  fotoThumb: { width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, cursor: 'pointer' },
  lancCard: { display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid #f5f4f0' },
  lancDesc: { fontSize: 13, fontWeight: 500, color: '#1a2744' },
  lancMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  lancVal:  { fontSize: 13, fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' },
  posicao:  { margin: '16px 16px 0', background: '#1a2744', borderRadius: 12, padding: 16 },
  posicaoTitle: { fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 12 },
  posicaoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.08)' },
  posicaoLabel: { fontSize: 12, color: 'rgba(255,255,255,.7)' },
  posicaoVal: { fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#fff' },
  posicaoDestaque: { borderBottom: 'none', marginTop: 6, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.15)' },
  footer:   { textAlign: 'center', padding: '24px 16px 0', fontSize: 12, color: '#aaa' },
  lightbox: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  lightboxImg: { maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' },
}
