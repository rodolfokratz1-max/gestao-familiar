import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Hook que carrega grupos e subcategorias do plano de contas
export function usePlanoContas() {
  const [grupos, setGrupos] = useState([])
  const [subs, setSubs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: g }, { data: s }] = await Promise.all([
        supabase.from('plano_contas_grupos').select('*').order('tipo').order('nome'),
        supabase.from('plano_contas_subs').select('*').order('nome'),
      ])
      setGrupos(g || [])
      setSubs(s || [])
      setLoading(false)
    }
    load()
  }, [])

  return { grupos, subs, loading }
}

// Componente select hierárquico de categoria
export function SelectCategoria({ value, onChange, tipo = '', placeholder = 'Selecionar categoria...', style = {} }) {
  const { grupos, subs, loading } = usePlanoContas()
  const gruposFiltrados = tipo ? grupos.filter(g => g.tipo === tipo) : grupos

  if (loading) return <select className="form-select" style={style} disabled><option>Carregando...</option></select>

  // Se não tem plano de contas configurado, mostra input livre
  if (grupos.length === 0) {
    return (
      <input className="form-input" value={value} onChange={e => onChange(e.target.value)}
        placeholder="Categoria (texto livre)" style={style} />
    )
  }

  return (
    <select className="form-select" value={value} onChange={e => onChange(e.target.value)} style={style}>
      <option value="">{placeholder}</option>
      {gruposFiltrados.map(g => {
        const subsDoGrupo = subs.filter(s => s.grupo_id === g.id)
        return (
          <optgroup key={g.id} label={`── ${g.nome}`}>
            {subsDoGrupo.length === 0
              ? <option value={g.nome}>{g.nome} (geral)</option>
              : subsDoGrupo.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)
            }
          </optgroup>
        )
      })}
    </select>
  )
}

// ── Centro de Custo ────────────────────────────────────────
import { supabase as _supabase } from './supabase'

export function SelectCentroCusto({ value, onChange, style = {} }) {
  const [centros, setCentros] = useState([])
  useEffect(() => {
    _supabase.from('centros_custo').select('id,nome').eq('ativo',true).order('nome').then(({data}) => setCentros(data||[]))
  }, [])
  return (
    <select className="form-select" value={value||''} onChange={e => onChange(e.target.value)} style={style}>
      <option value="">Sem centro de custo</option>
      {centros.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
    </select>
  )
}
