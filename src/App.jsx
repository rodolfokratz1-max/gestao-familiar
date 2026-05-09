import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { ToastProvider } from './contexts/ToastContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import InboxWhatsApp from './pages/InboxWhatsApp'
import Pessoas from './pages/Pessoas'
import Produtos from './pages/Produtos'
import Financeiro from './pages/Financeiro'
import FinanceiroContas from './pages/FinanceiroContas'
import Caixa from './pages/Caixa'
import Compras from './pages/Compras'
import OrdemServico from './pages/OrdemServico'
import Contas from './pages/Contas'
import Relatorios from './pages/Relatorios'
import Cartoes from './pages/Cartoes'
import Usuarios from './pages/Usuarios'
import Empresa from './pages/Empresa'
import Recorrencias from './pages/Recorrencias'
import PlanoContas from './pages/PlanoContas'
import Movimentacoes from './pages/Movimentacoes'
import FluxoCaixa from './pages/FluxoCaixa'
import CentroCusto from './pages/CentroCusto'
import EntradaEstoque from './pages/EntradaEstoque'
import Obras from './pages/Obras'
import Entidades from './pages/Entidades'
import ObrasFontes from './pages/ObrasFontes'
import { VERSION } from './version'
import { EntidadeProvider, useEntidade } from './contexts/EntidadeContext'
import SeletorEntidade from './components/SeletorEntidade'
import ErrorBoundary from './components/ErrorBoundary'
import {
  LayoutDashboard, Users, Package, TrendingUp, TrendingDown,
  Wallet, ShoppingCart, CreditCard, HandCoins, Menu, X,
  Landmark, BarChart2, LogOut, Shield, ClipboardList,
  Building2, Repeat2, ListTree, ArrowLeftRight, BarChart,
  Target, PackagePlus, MessageCircle, HardHat
} from 'lucide-react'

function getNav() {
  return [
    { group: 'Visão Geral', items: [
      { id: 'dashboard',   label: 'Dashboard',               icon: LayoutDashboard },
      { id: 'relatorios',  label: 'Relatórios',              icon: BarChart2 },
    ]},
    { group: 'Cadastros', items: [
      { id: 'pessoas',      label: 'Clientes / Fornecedores', icon: Users },
      { id: 'produtos',     label: 'Produtos / Serviços',     icon: Package },
      { id: 'contas',       label: 'Contas / Carteiras',      icon: Landmark },
      { id: 'plano_contas', label: 'Plano de Contas',         icon: ListTree },
      { id: 'centro_custo', label: 'Centros de Custo',        icon: Target },
    ]},
    { group: 'Financeiro', items: [
      { id: 'receitas',       label: 'Receitas',         icon: TrendingUp },
      { id: 'despesas',       label: 'Despesas',         icon: TrendingDown },
      { id: 'caixa',          label: 'Caixa',            icon: Wallet },
      { id: 'contas_receber', label: 'A Receber',        icon: HandCoins },
      { id: 'contas_pagar',   label: 'A Pagar',          icon: CreditCard },
      { id: 'recorrencias',   label: 'Recorrências',     icon: Repeat2 },
      { id: 'movimentacoes',  label: 'Movimentações',    icon: ArrowLeftRight },
      { id: 'fluxo_caixa',    label: 'Fluxo de Caixa',  icon: BarChart },
    ]},
    { group: 'Operacional', items: [
      { id: 'cartoes',         label: 'Cartões',             icon: CreditCard },
      { id: 'compras',         label: 'Compras',             icon: ShoppingCart },
      { id: 'os',              label: 'Ordens de Serviço',   icon: ClipboardList },
      { id: 'entrada_estoque', label: 'Entrada de Estoque',  icon: PackagePlus },
      { id: 'inbox_whatsapp',  label: 'Inbox WhatsApp',      icon: MessageCircle },
    ]},
    { group: 'Obras', items: [
      { id: 'obras',        label: 'Obras / Projetos',    icon: HardHat },
      { id: 'obras_fontes', label: 'Fontes de Pagamento', icon: Wallet  },
    ]},
    { group: 'Sistema', items: [
      { id: 'entidades', label: 'Entidades',         icon: Building2 },
      { id: 'empresa',  label: 'Dados da Empresa', icon: Building2 },
      { id: 'usuarios', label: 'Usuários',          icon: Shield },
    ]},
  ]
}

function getTitle(page) {
  const map = {
    dashboard:'Dashboard', relatorios:'Relatórios',
    pessoas:'Clientes & Fornecedores', produtos:'Produtos & Serviços',
    contas:'Contas & Carteiras', plano_contas:'Plano de Contas',
    centro_custo:'Centros de Custo', receitas:'Receitas',
    despesas:'Despesas', caixa:'Caixa',
    contas_receber:'Contas a Receber', contas_pagar:'Contas a Pagar',
    recorrencias:'Recorrências', movimentacoes:'Movimentações',
    fluxo_caixa:'Fluxo de Caixa', cartoes:'Cartões de Crédito',
    compras:'Compras', os:'Ordens de Serviço',
    entrada_estoque:'Entrada de Estoque (NF)', inbox_whatsapp: 'Inbox WhatsApp',
    obras:'Obras & Projetos', obras_fontes:'Fontes de Pagamento',
    entidades:'Entidades', empresa:'Dados da Empresa', usuarios:'Gerenciar Usuários',
  }
  return map[page] || ''
}

function PageContent({ page, onNavigate }) {
  if (page === 'dashboard')       return <Dashboard onNavigate={onNavigate} />
  if (page === 'relatorios')      return <Relatorios />
  if (page === 'pessoas')         return <Pessoas />
  if (page === 'produtos')        return <Produtos />
  if (page === 'contas')          return <Contas />
  if (page === 'receitas')        return <Financeiro module="receitas" />
  if (page === 'despesas')        return <Financeiro module="despesas" />
  if (page === 'caixa')           return <Caixa />
  if (page === 'contas_receber')  return <FinanceiroContas module="contas_receber" />
  if (page === 'contas_pagar')    return <FinanceiroContas module="contas_pagar" />
  if (page === 'cartoes')         return <Cartoes />
  if (page === 'compras')         return <Compras />
  if (page === 'os')              return <OrdemServico />
  if (page === 'recorrencias')    return <Recorrencias />
  if (page === 'plano_contas')    return <PlanoContas />
  if (page === 'movimentacoes')   return <Movimentacoes />
  if (page === 'fluxo_caixa')     return <FluxoCaixa />
  if (page === 'centro_custo')    return <CentroCusto />
  if (page === 'entrada_estoque') return <EntradaEstoque />
  if (page === 'inbox_whatsapp') return <InboxWhatsApp />
  if (page === 'obras')          return <Obras />
  if (page === 'obras_fontes')   return <ObrasFontes />
  if (page === 'entidades')       return <Entidades />
  if (page === 'empresa')         return <Empresa />
  if (page === 'usuarios')        return <Usuarios />
  return null
}

function AppInner() {
  const { user, loading, signOut } = useAuth()
  const [page, setPage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [usuarioAppId, setUsuarioAppId] = useState(null)

  // Busca o id interno (usuarios_app) do usuário logado
  useEffect(() => {
    if (!user) return
    supabase.from('usuarios_app').select('id').eq('auth_id', user.id).single()
      .then(({ data }) => { if (data) setUsuarioAppId(data.id) })
  }, [user])

  if (loading) return <div className="loading"><div className="spinner" /><span>Carregando...</span></div>
  if (!user) return <Login />
  if (!usuarioAppId) return <div className="loading"><div className="spinner" /><span>Iniciando...</span></div>

  const nav = getNav()
  const nomeUsuario = user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário'
  const inicialUsuario = nomeUsuario.charAt(0).toUpperCase()

  function navigate(id) { setPage(id); setSidebarOpen(false) }

  return (
    <EntidadeProvider usuarioId={usuarioAppId}>
    <div className="app-layout">
      {sidebarOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:499 }}
          onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <h1>💰 GestãoFam</h1>
          <span>Sistema de Gestão</span>
        </div>
        <nav className="sidebar-nav">
          {nav.map(group => (
            <div key={group.group} className="nav-group">
              <div className="nav-group-label">{group.group}</div>
              {group.items.map(item => {
                const Icon = item.icon
                return (
                  <button key={item.id}
                    className={`nav-item ${page === item.id ? 'active' : ''}`}
                    onClick={() => navigate(item.id)}>
                    <Icon size={16} />{item.label}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', marginTop:'auto' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:14, flexShrink:0 }}>
              {inicialUsuario}
            </div>
            <div style={{ overflow:'hidden' }}>
              <div style={{ fontWeight:600, fontSize:13, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{nomeUsuario}</div>
              <div style={{ fontSize:11, color:'var(--text2)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{user.email}</div>
            </div>
          </div>
          <button onClick={signOut}
            style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:8, border:'none', background:'transparent', color:'var(--text2)', cursor:'pointer', fontSize:13, transition:'background .15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <LogOut size={14} /> Sair
          </button>
        </div>
      </aside>

      <div className="main-wrap">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(o => !o)}>
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <h2 className="page-title">{getTitle(page)}</h2>
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
            <SeletorEntidade />
            <span style={{ fontSize:10, fontWeight:700, color:'var(--text3)', fontFamily:'var(--mono)', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:6, padding:'2px 7px', letterSpacing:'.3px' }}>
              {VERSION}
            </span>
            <div style={{ width:30, height:30, borderRadius:'50%', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13 }}>
              {inicialUsuario}
            </div>
          </div>
        </header>
        <main className="page-content">
          <ErrorBoundary key={page}>
            <PageContent page={page} onNavigate={setPage} />
          </ErrorBoundary>
        </main>
      </div>
    </div>
    </EntidadeProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppInner />
      </ToastProvider>
    </AuthProvider>
  )
}
