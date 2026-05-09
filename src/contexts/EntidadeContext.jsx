/**
 * EntidadeContext
 * Contexto global de multi-entidade do GestãoFam.
 *
 * Expõe:
 *   entidadeAtiva   — objeto entidade atual { id, nome, cor_tema, ... }
 *   entidades       — lista de todas que o usuário tem acesso
 *   nivel           — nível do usuário na entidade ativa (1-4)
 *   setEntidade(id) — troca a entidade ativa
 *   pode(acao)      — verifica permissão: 'ler'|'lancar'|'aprovar'|'admin'
 *   carregando      — true enquanto carrega do banco
 *
 * Níveis:
 *   1 = Leitura   — só visualiza
 *   2 = Operador  — lança receitas/despesas
 *   3 = Gestor    — lança + aprova inbox + relatórios completos
 *   4 = Admin     — tudo + configura entidade + gerencia usuários
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const EntidadeContext = createContext(null)

const STORAGE_KEY = 'gestao_entidade_id'

const NIVEL_MINIMO = {
  ler:     1,
  lancar:  2,
  aprovar: 3,
  admin:   4,
}

export function EntidadeProvider({ children, usuarioId }) {
  const [entidades, setEntidades]       = useState([])
  const [entidadeAtiva, setEntidadeAtiva] = useState(null)
  const [nivel, setNivel]               = useState(0)
  const [carregando, setCarregando]     = useState(true)

  // Carrega entidades do usuário
  useEffect(() => {
    if (!usuarioId) { setCarregando(false); return }
    carregarEntidades(usuarioId)
  }, [usuarioId])

  async function carregarEntidades(uid) {
    setCarregando(true)
    try {
      const { data, error } = await supabase
        .from('usuario_entidades')
        .select(`
          nivel,
          entidade:entidades (
            id, nome, nome_fantasia, tipo,
            cnpj_cpf, cor_tema, logo_base64,
            telefone, email, cidade, estado, ativo
          )
        `)
        .eq('usuario_id', uid)
        .eq('ativo', true)
        .order('nivel', { ascending: false })

      if (error || !data?.length) {
        setEntidades([])
        setEntidadeAtiva(null)
        setCarregando(false)
        return
      }

      // Filtra entidades ativas
      const lista = data
        .filter(d => d.entidade?.ativo)
        .map(d => ({ ...d.entidade, nivel: d.nivel }))

      setEntidades(lista)

      // Restaura última entidade usada (localStorage)
      const salvo = localStorage.getItem(STORAGE_KEY)
      const encontrada = lista.find(e => e.id === salvo)
      const inicial = encontrada || lista[0]

      if (inicial) {
        setEntidadeAtiva(inicial)
        setNivel(inicial.nivel)
        localStorage.setItem(STORAGE_KEY, inicial.id)
      }
    } finally {
      setCarregando(false)
    }
  }

  // Troca entidade ativa
  const setEntidade = useCallback((idOuObj) => {
    const ent = typeof idOuObj === 'string'
      ? entidades.find(e => e.id === idOuObj)
      : idOuObj
    if (!ent) return
    setEntidadeAtiva(ent)
    setNivel(ent.nivel)
    localStorage.setItem(STORAGE_KEY, ent.id)
  }, [entidades])

  // Verifica permissão
  const pode = useCallback((acao) => {
    const minimo = NIVEL_MINIMO[acao] ?? 99
    return nivel >= minimo
  }, [nivel])

  // Recarrega após criar/editar entidades
  const recarregar = useCallback(() => {
    if (usuarioId) carregarEntidades(usuarioId)
  }, [usuarioId])

  return (
    <EntidadeContext.Provider value={{
      entidadeAtiva,
      entidades,
      nivel,
      carregando,
      setEntidade,
      pode,
      recarregar,
    }}>
      {children}
    </EntidadeContext.Provider>
  )
}

export const useEntidade = () => {
  const ctx = useContext(EntidadeContext)
  if (!ctx) throw new Error('useEntidade deve ser usado dentro de EntidadeProvider')
  return ctx
}
