import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: 'var(--red)' }}>
            Erro ao carregar esta tela
          </div>
          <div style={{ fontSize: 13, marginBottom: 16, color: 'var(--text3)', fontFamily: 'var(--mono)', background: 'var(--bg3)', padding: '8px 16px', borderRadius: 8, display: 'inline-block' }}>
            {this.state.error?.message || String(this.state.error)}
          </div>
          <br/>
          <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>
            Tentar novamente
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
