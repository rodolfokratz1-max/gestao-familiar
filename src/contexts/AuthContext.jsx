import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let done = false

    // Timeout de segurança: se demorar mais de 3s, libera a tela
    const timeout = setTimeout(() => {
      if (!done) {
        done = true
        setLoading(false)
      }
    }, 3000)

    // Tenta pegar sessão existente (cache local primeiro, depois servidor)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!done) {
        done = true
        clearTimeout(timeout)
        setUser(session?.user ?? null)
        setLoading(false)
      }
    }).catch(() => {
      if (!done) {
        done = true
        clearTimeout(timeout)
        setLoading(false)
      }
    })

    // Listener para mudanças de auth (login, logout, refresh de token)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      // Se ainda estava no loading, libera agora
      if (!done) {
        done = true
        clearTimeout(timeout)
        setLoading(false)
      }
    })

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error
  }

  async function signUp(email, password) {
    const { error } = await supabase.auth.signUp({ email, password })
    return error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
