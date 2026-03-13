import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    setError('')
    if (!email || !password) return setError('Preencha e-mail e senha')
    setLoading(true)
    const err = await signIn(email, password)
    if (err) setError('E-mail ou senha incorretos')
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:16 }}>
      <div style={{ background:'var(--bg2)', borderRadius:16, padding:'40px 36px', width:'100%', maxWidth:380, border:'1px solid var(--border)', boxShadow:'0 20px 60px rgba(0,0,0,.4)' }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:44, marginBottom:8 }}>💰</div>
          <h1 style={{ fontSize:22, fontWeight:800, margin:0 }}>GestãoFam</h1>
          <p style={{ color:'var(--text2)', fontSize:13, marginTop:4 }}>Sistema de Gestão Familiar</p>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={{ fontSize:12, color:'var(--text2)', display:'block', marginBottom:5 }}>E-mail</label>
            <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com" onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>
          <div>
            <label style={{ fontSize:12, color:'var(--text2)', display:'block', marginBottom:5 }}>Senha</label>
            <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>
          {error && (
            <div style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.3)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'var(--red)' }}>
              {error}
            </div>
          )}
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}
            style={{ padding:'12px 0', fontSize:14, marginTop:4 }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </div>
        <p style={{ textAlign:'center', fontSize:11, color:'var(--text2)', marginTop:24, margin:'24px 0 0' }}>
          Acesso restrito — solicite ao administrador
        </p>
      </div>
    </div>
  )
}
