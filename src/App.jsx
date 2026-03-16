import { useState } from 'react'
import { ToastProvider } from './contexts/ToastContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
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
import { LayoutDashboard, Users, Package, TrendingUp, TrendingDown, Wallet, ShoppingCart, Wrench, CreditCard, HandCoins, Menu, X, Landmark, BarChart2, LogOut, User, Shield, ClipboardList, Building2, Repeat2, ListTree, ArrowLeftRight, BarChart, Target, PackagePlus } from 'lucide-react'

const nav = [
  { group: 'Visão Geral', items: [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'relatorios', label: 'Relatórios', icon: BarChart2 },
  ]},
  { group: 'Cadastros', items: [
    { id: 'pessoas', label: 'Clientes / Fornecedores', icon: Users },
    { id: 'produtos', label: 'Produtos / Serviços', icon: Package },
    { id: 'contas', label: 'Contas / Carteiras', icon: Landmark },
    { id: 'plano_contas', label: 'Plano de Contas', icon: ListTree },
    { id: 'centro_custo', label: 'Centros de Custo', icon: Target },
  ]},
  { group: 'Financeiro', items: [
    { id: 'receitas', label: 'Receitas', icon: TrendingUp },
    { id: 'despesas', label: 'Despesas', icon: TrendingDown },
    { id: 'caixa', label: 'Caixa', icon: Wallet },
    { id: 'contas_receber', label: 'A Receber', icon: HandCoins },
    { id: 'contas_pagar', label: 'A Pagar', icon: CreditCard },
    { id: 'recorrencias', label: 'Recorrências', icon: Repeat2 },
    { id: 'movimentacoes', label: 'Movimentações', icon: ArrowLeftRight },
    { id: 'fluxo_caixa', label: 'Fluxo de Caixa', icon: BarChart },
  ]},
  { group: 'Sistema', items: [
    { id: 'empresa', label: 'Dados da Empresa', icon: Building2 },
    { id: 'usuarios', label: 'Usuários', icon: Shield },
  ]},
  { group: 'Operacional', items: [
    { id: 'cartoes', label: 'Cartões', icon: CreditCard },
    { id: 'compras', label: 'Compras', icon: ShoppingCart },
    { id: 'os', label: 'Ordens de Serviço', icon: ClipboardList },
    { id: 'entrada_estoque', label: 'Entrada de Estoque', icon: PackagePlus },
  ]},
]

const titles = {
  dashboard:'Dashboard', relatorios:'Relatórios', pessoas:'Clientes & Fornecedores',
  produtos:'Produtos & Serviços', contas:'Contas & Carteiras',
  receitas:'Receitas', despesas:'Despesas', caixa:'Caixa',
  contas_receber:'Contas a Receber', contas_pagar:'Contas a Pagar', recorrencias:'Recorrências',
  cartoes:'Cartões de Crédito', compras:'Compras', os:'Ordens de Serviço', empresa:'Dados da Empresa', usuarios:'Gerenciar Usuários',
  plano_contas:'Plano de Contas', movimentacoes:'Movimentações', fluxo_caixa:'Fluxo de Caixa', centro_custo:'Centros de Custo',
}

function PageContent({ page, onNavigate }) {
  if (page === 'dashboard') return <Dashboard onNavigate={onNavigate} />
  if (page === 'relatorios') return <Relatorios />
  if (page === 'pessoas') return <Pessoas />
  if (page === 'produtos') return <Produtos />
  if (page === 'contas') return <Contas />
  if (page === 'receitas') return <Financeiro module="receitas" />
  if (page === 'despesas') return <Financeiro module="despesas" />
  if (page === 'caixa') return <Caixa />
  if (page === 'contas_receber') return <FinanceiroContas module="contas_receber" />
  if (page === 'contas_pagar') return <FinanceiroContas module="contas_pagar" />
  if (page === 'cartoes') return <Cartoes />
  if (page === 'compras') return <Compras />
  if (page === 'os') return <OrdemServico />
  if (page === 'recorrencias') return <Recorrencias />
  if (page === 'plano_contas') return <PlanoContas />
  if (page === 'movimentacoes') return <Movimentacoes />
  if (page === 'fluxo_caixa') return <FluxoCaixa />
  if (page === 'centro_custo') return <CentroCusto />
  if (page === 'entrada_estoque') return <EntradaEstoque />
  if (page === 'empresa') return <Empresa />
  if (page === 'usuarios') return <Usuarios />
  return null
}

function AppInner() {
  const { user, loading, signOut } = useAuth()
  const [page, setPage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (loading) return <div className="loading"><div className="spinner" /><span>Carregando...</span></div>
  if (!user) return <Login />

  const nomeUsuario = user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário'
  const inicialUsuario = nomeUsuario.charAt(0).toUpperCase()

  function navigate(id) { setPage(id); setSidebarOpen(false) }

  return (
    <div className="app-layout">
      {sidebarOpen && <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:499 }} onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <h1>💰 GestãoFam</h1>
          <span>Sistema de Gestão Familiar</span>
        </div>
        <nav className="sidebar-nav">
          {nav.map(group => (
            <div key={group.group} className="nav-group">
              <div className="nav-group-label">{group.group}</div>
              {group.items.map(item => {
                const Icon = item.icon
                return (
                  <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}>
                    <Icon size={16} />{item.label}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        {/* User info + logout */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
              {inicialUsuario}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nomeUsuario}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
            </div>
          </div>
          <button onClick={signOut} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 13, transition: 'background .15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <LogOut size={14} /> Sair
          </button>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(o => !o)}>{sidebarOpen ? <X size={20} /> : <Menu size={20} />}</button>
          <h2 className="page-title">{titles[page]}</h2>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
              {inicialUsuario}
            </div>
            <span style={{ fontSize: 13, color: 'var(--text2)', display: 'none' }}>{nomeUsuario}</span>
          </div>
        </header>
        <main className="page-content">
          <PageContent page={page} onNavigate={setPage} />
        </main>
      </div>
    </div>
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
