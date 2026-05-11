/**
 * Empresa.jsx
 * Agora edita os dados da ENTIDADE ATIVA em vez da tabela empresa.
 * Inclui campos fiscais completos para futura emissão de NF-e.
 */
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useEntidade } from '../contexts/EntidadeContext'
import { Building2, Save, Upload, X, AlertCircle, Info } from 'lucide-react'

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
             'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

const REGIMES = [
  { value: 'simples',   label: 'Simples Nacional' },
  { value: 'mei',       label: 'MEI' },
  { value: 'presumido', label: 'Lucro Presumido' },
  { value: 'real',      label: 'Lucro Real' },
  { value: 'isento',    label: 'Isento / Pessoa Física' },
]

export default function Empresa() {
  const toast = useToast()
  const { entidadeAtiva, recarregar } = useEntidade()
  const [form, setForm]     = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [abaAtiva, setAbaAtiva] = useState('geral') // 'geral' | 'fiscal' | 'avancado'
  const fileRef = useRef()

  useEffect(() => {
    if (!entidadeAtiva?.id) { setLoading(false); return }
    load()
  }, [entidadeAtiva?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('entidades').select('*').eq('id', entidadeAtiva.id).single()
    setForm(data || {})
    setLoading(false)
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  function handleLogo(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 600000) return toast('Logo muito grande! Use menor que 600KB', 'error')
    const reader = new FileReader()
    reader.onload = ev => f('logo_base64', ev.target.result)
    reader.readAsDataURL(file)
  }

  async function save() {
    if (!form.nome?.trim()) return toast('Nome obrigatório', 'error')
    setSaving(true)
    // Nunca envia certificado/senha pelo frontend se estiverem em branco
    const payload = { ...form }
    if (!payload.certificado_a1) delete payload.certificado_a1
    if (!payload.senha_certificado) delete payload.senha_certificado

    const { error } = await supabase.from('entidades').update(payload).eq('id', entidadeAtiva.id)
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Dados salvos!', 'success')
    recarregar()
  }

  const Tab = ({ id, label }) => (
    <button onClick={() => setAbaAtiva(id)} style={{
      padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
      fontSize: 13, fontWeight: 500, transition: 'all .15s',
      background: abaAtiva === id ? 'var(--accent)' : 'transparent',
      color: abaAtiva === id ? '#fff' : 'var(--text2)',
    }}>{label}</button>
  )

  if (loading) return <div className="loading"><div className="spinner" /></div>

  if (!entidadeAtiva) return (
    <div className="empty-state">
      <Building2 size={40} />
      <p>Nenhuma entidade selecionada</p>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>{entidadeAtiva.nome_fantasia || entidadeAtiva.nome}</h2>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            Editando dados da entidade ativa — troque no seletor do topo para editar outra
          </div>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Save size={15} /> {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--bg3)', borderRadius: 10, padding: 4, marginBottom: 20, width: 'fit-content' }}>
        <Tab id="geral"    label="Dados Gerais" />
        <Tab id="fiscal"   label="Fiscal / NF-e" />
        <Tab id="avancado" label="Avançado" />
      </div>

      {/* ── Dados Gerais ─────────────────────────────────────────────────── */}
      {abaAtiva === 'geral' && (
        <div className="card">
          <div className="form-grid form-grid-2">
            {/* Logo */}
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Logo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {form.logo_base64
                  ? <img src={form.logo_base64} alt="Logo" style={{ height: 60, maxWidth: 200, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)' }} />
                  : <div style={{ width: 80, height: 60, borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Building2 size={24} color="var(--text3)" />
                    </div>
                }
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={() => fileRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <Upload size={13} /> Alterar logo
                  </button>
                  {form.logo_base64 && (
                    <button className="btn" onClick={() => f('logo_base64', '')} style={{ fontSize: 12, color: 'var(--red)' }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleLogo} style={{ display: 'none' }} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select className="form-select" value={form.tipo || 'pj'} onChange={e => f('tipo', e.target.value)}>
                <option value="pj">🏢 Empresa (PJ)</option>
                <option value="pf">👤 Pessoa Física (PF)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Cor do seletor</label>
              <input type="color" value={form.cor_tema || '#2563eb'} onChange={e => f('cor_tema', e.target.value)}
                style={{ width: 48, height: 36, padding: 2, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--bg3)' }} />
            </div>

            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">{form.tipo === 'pf' ? 'Nome completo' : 'Razão Social'} *</label>
              <input className="form-input" value={form.nome || ''} onChange={e => f('nome', e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Nome Fantasia / Apelido</label>
              <input className="form-input" value={form.nome_fantasia || ''} onChange={e => f('nome_fantasia', e.target.value)}
                placeholder="Como aparece no seletor e nos relatórios" />
            </div>

            <div className="form-group">
              <label className="form-label">{form.tipo === 'pf' ? 'CPF' : 'CNPJ'}</label>
              <input className="form-input" value={form.cnpj_cpf || ''} onChange={e => f('cnpj_cpf', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">IE {form.tipo === 'pf' ? '(RG)' : '(Inscrição Estadual)'}</label>
              <input className="form-input" value={form.ie || ''} onChange={e => f('ie', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">IM (Inscrição Municipal)</label>
              <input className="form-input" value={form.im || ''} onChange={e => f('im', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Telefone</label>
              <input className="form-input" value={form.telefone || ''} onChange={e => f('telefone', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">WhatsApp</label>
              <input className="form-input" value={form.whatsapp || ''} onChange={e => f('whatsapp', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">E-mail</label>
              <input className="form-input" type="email" value={form.email || ''} onChange={e => f('email', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Site</label>
              <input className="form-input" value={form.site || ''} onChange={e => f('site', e.target.value)} />
            </div>

            {/* Endereço */}
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Endereço</label>
              <input className="form-input" value={form.endereco || ''} onChange={e => f('endereco', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Número</label>
              <input className="form-input" value={form.numero || ''} onChange={e => f('numero', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Complemento</label>
              <input className="form-input" value={form.complemento || ''} onChange={e => f('complemento', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Bairro</label>
              <input className="form-input" value={form.bairro || ''} onChange={e => f('bairro', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">CEP</label>
              <input className="form-input" value={form.cep || ''} onChange={e => f('cep', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Cidade</label>
              <input className="form-input" value={form.cidade || ''} onChange={e => f('cidade', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <select className="form-select" value={form.estado || ''} onChange={e => f('estado', e.target.value)}>
                <option value="">Selecione...</option>
                {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Rodapé Ordens de Serviço</label>
              <textarea className="form-textarea" value={form.rodape_os || ''} onChange={e => f('rodape_os', e.target.value)} rows={2} />
            </div>
          </div>
        </div>
      )}

      {/* ── Fiscal / NF-e ──────────────────────────────────────────────────── */}
      {abaAtiva === 'fiscal' && (
        <div className="card">
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(79,142,247,.07)', border: '1px solid rgba(79,142,247,.2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', display: 'flex', gap: 8 }}>
            <Info size={14} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
            Campos necessários para emissão de NF-e, NFS-e e NFC-e via API fiscal (Focus NFe / Nuvem Fiscal).
            Preencha apenas quando for implantar o módulo fiscal.
          </div>

          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Regime Tributário</label>
              <select className="form-select" value={form.regime_tributario || 'simples'} onChange={e => f('regime_tributario', e.target.value)}>
                {REGIMES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">CRT</label>
              <select className="form-select" value={form.crt || 1} onChange={e => f('crt', Number(e.target.value))}>
                <option value={1}>1 — Simples Nacional</option>
                <option value={2}>2 — Simples Nacional — Excesso</option>
                <option value={3}>3 — Regime Normal</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">CNAE (atividade principal)</label>
              <input className="form-input" value={form.cnae || ''} onChange={e => f('cnae', e.target.value)}
                placeholder="Ex: 4520001" />
            </div>
            <div className="form-group">
              <label className="form-label">Ambiente NF-e</label>
              <select className="form-select" value={form.ambiente_nfe || 'homologacao'} onChange={e => f('ambiente_nfe', e.target.value)}>
                <option value="homologacao">Homologação (testes)</option>
                <option value="producao">Produção (notas reais)</option>
              </select>
              {form.ambiente_nfe === 'producao' && (
                <div style={{ marginTop: 5, fontSize: 11, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertCircle size={11} /> Notas emitidas em produção têm validade fiscal real
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Código IBGE da Cidade</label>
              <input className="form-input" value={form.ibge_cidade || ''} onChange={e => f('ibge_cidade', e.target.value)}
                placeholder="Ex: 4202404 (Camboriú/SC)" />
            </div>
            <div className="form-group">
              <label className="form-label">Código IBGE do Estado</label>
              <input className="form-input" value={form.ibge_estado || ''} onChange={e => f('ibge_estado', e.target.value)}
                placeholder="Ex: 42 (SC)" />
            </div>
            <div className="form-group">
              <label className="form-label">Série NF-e</label>
              <input className="form-input" type="number" value={form.serie_nfe || 1} onChange={e => f('serie_nfe', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Próxima NF-e nº</label>
              <input className="form-input" type="number" value={form.proxima_nfe || 1} onChange={e => f('proxima_nfe', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Série NFC-e</label>
              <input className="form-input" type="number" value={form.serie_nfce || 1} onChange={e => f('serie_nfce', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Próxima NFC-e nº</label>
              <input className="form-input" type="number" value={form.proxima_nfce || 1} onChange={e => f('proxima_nfce', Number(e.target.value))} />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Token CSC (NFC-e)</label>
              <input className="form-input" type="password" value={form.token_csc || ''} onChange={e => f('token_csc', e.target.value)}
                placeholder="Token do Código de Segurança do Contribuinte" />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Token API Fiscal</label>
              <input className="form-input" type="password" value={form.api_fiscal_token || ''} onChange={e => f('api_fiscal_token', e.target.value)}
                placeholder="Token Focus NFe ou Nuvem Fiscal" />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">URL API Fiscal</label>
              <input className="form-input" value={form.api_fiscal_url || ''} onChange={e => f('api_fiscal_url', e.target.value)}
                placeholder="https://api.focusnfe.com.br ou https://api.nuvemfiscal.com.br" />
            </div>
          </div>
        </div>
      )}

      {/* ── Avançado ───────────────────────────────────────────────────────── */}
      {abaAtiva === 'avancado' && (
        <div className="card">
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(248,113,113,.07)', border: '1px solid rgba(248,113,113,.2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)', display: 'flex', gap: 8 }}>
            <AlertCircle size={14} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />
            O certificado digital A1 é sensível. Ele é armazenado no banco e nunca exposto no frontend.
            Use apenas quando o módulo fiscal estiver implantado.
          </div>

          <div className="form-grid form-grid-1">
            <div className="form-group">
              <label className="form-label">Certificado A1 (base64)</label>
              <textarea className="form-textarea" rows={4}
                value={form.certificado_a1 ? '••••••••' : ''}
                placeholder="Cole o certificado .pfx em base64"
                onChange={e => {
                  if (e.target.value !== '••••••••') f('certificado_a1', e.target.value)
                }} />
              {form.certificado_a1 && (
                <div style={{ marginTop: 5, fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  ✓ Certificado configurado
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Senha do Certificado</label>
              <input className="form-input" type="password" placeholder="Senha do arquivo .pfx"
                onChange={e => f('senha_certificado', e.target.value)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
