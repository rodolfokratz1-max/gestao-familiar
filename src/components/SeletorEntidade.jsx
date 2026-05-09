/**
 * SeletorEntidade
 * Dropdown no header para trocar de entidade com 1 clique.
 * Fica sempre visível — impossível lançar sem saber onde está.
 */

import { useState, useRef, useEffect } from 'react'
import { useEntidade } from '../contexts/EntidadeContext'
import { ChevronDown, Building2, User, Check, Loader } from 'lucide-react'

const NIVEL_LABEL = { 1: 'Leitura', 2: 'Operador', 3: 'Gestor', 4: 'Admin' }
const NIVEL_COLOR = { 1: '#94a3b8', 2: '#60a5fa', 3: '#34d399', 4: '#f59e0b' }

export default function SeletorEntidade() {
  const { entidadeAtiva, entidades, nivel, setEntidade, carregando } = useEntidade()
  const [aberto, setAberto] = useState(false)
  const ref = useRef()

  // Fecha ao clicar fora
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (carregando) return (
    <div style={styles.btn}>
      <Loader size={13} style={{ animation: 'spin 1s linear infinite', color: '#94a3b8' }} />
      <span style={{ fontSize: 12, color: '#94a3b8' }}>Carregando...</span>
    </div>
  )

  if (!entidadeAtiva) return null

  const cor  = entidadeAtiva.cor_tema || '#2563eb'
  const nome = entidadeAtiva.nome_fantasia || entidadeAtiva.nome

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Botão principal */}
      <button
        onClick={() => setAberto(a => !a)}
        style={{
          ...styles.btn,
          border: `1px solid ${cor}44`,
          background: `${cor}12`,
        }}>
        {/* Ponto colorido da entidade */}
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: cor, flexShrink: 0,
          boxShadow: `0 0 0 2px ${cor}33`
        }} />

        {/* Ícone tipo */}
        {entidadeAtiva.tipo === 'pj'
          ? <Building2 size={13} color={cor} />
          : <User      size={13} color={cor} />}

        {/* Nome */}
        <span style={{ fontSize: 13, fontWeight: 600, color: cor, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {nome}
        </span>

        {/* Nível badge */}
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '1px 5px',
          borderRadius: 4, background: `${NIVEL_COLOR[nivel]}22`,
          color: NIVEL_COLOR[nivel], textTransform: 'uppercase', letterSpacing: '.3px'
        }}>
          {NIVEL_LABEL[nivel]}
        </span>

        <ChevronDown size={12} color={cor} style={{ transition: 'transform .2s', transform: aberto ? 'rotate(180deg)' : 'none' }} />
      </button>

      {/* Dropdown */}
      {aberto && (
        <div style={styles.dropdown}>
          <div style={styles.dropHeader}>Trocar entidade</div>

          {entidades.map(ent => {
            const ativa  = ent.id === entidadeAtiva.id
            const nomeEnt = ent.nome_fantasia || ent.nome
            const corEnt  = ent.cor_tema || '#2563eb'
            return (
              <button
                key={ent.id}
                onClick={() => { setEntidade(ent); setAberto(false) }}
                style={{
                  ...styles.dropItem,
                  background: ativa ? `${corEnt}10` : 'transparent',
                  borderLeft: ativa ? `3px solid ${corEnt}` : '3px solid transparent',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  {/* Ponto */}
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: corEnt, flexShrink: 0 }} />
                  {/* Ícone tipo */}
                  {ent.tipo === 'pj'
                    ? <Building2 size={12} color={corEnt} />
                    : <User      size={12} color={corEnt} />}
                  {/* Nome e cidade */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: ativa ? 700 : 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {nomeEnt}
                    </div>
                    {ent.cidade && (
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{ent.cidade}{ent.estado ? ` — ${ent.estado}` : ''}</div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                    background: `${NIVEL_COLOR[ent.nivel]}22`, color: NIVEL_COLOR[ent.nivel],
                    textTransform: 'uppercase'
                  }}>
                    {NIVEL_LABEL[ent.nivel]}
                  </span>
                  {ativa && <Check size={13} color={corEnt} />}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

const styles = {
  btn: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '6px 12px', borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--bg2)',
    cursor: 'pointer', transition: 'all .15s',
    userSelect: 'none',
  },
  dropdown: {
    position: 'absolute', top: 'calc(100% + 8px)', left: 0,
    minWidth: 260, maxWidth: 320,
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,.15)',
    zIndex: 200,
    overflow: 'hidden',
  },
  dropHeader: {
    fontSize: 10, fontWeight: 700, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: '.5px',
    padding: '10px 14px 6px',
    borderBottom: '1px solid var(--border)',
  },
  dropItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', padding: '10px 14px',
    border: 'none', cursor: 'pointer',
    textAlign: 'left', transition: 'background .1s',
  },
}
