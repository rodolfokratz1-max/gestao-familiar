import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useEntidade } from '../contexts/EntidadeContext'
import Modal from '../components/Modal'
import { Plus, Pencil, Power, Wallet, AlertCircle, CheckCircle, Landmark } from 'lucide-react'

const TIPOS_FONTE = [
  { value: 'empresa',          label: 'Empresa',             desc: 'Gera saída no caixa — conta escolhida no lançamento' },
  { value: 'proprio',          label: 'Próprio',             desc: 'Gera saída no caixa — conta escolhida no lançamento' },
  { value: 'dinheiro_cliente', label: 'Dinheiro do Cliente', desc: 'Gera entrada/saída no caixa — conta escolhida no lançamento' },
  { value: 'cartao_cliente',   label: 'Cartão do Cliente',   desc: 'NÃO movimenta o caixa' },
  { value: 'outro',            label: 'Outro',               desc: 'Sem integração com caixa' },
]

const TIPOS_MOVEM_CAIXA = ['empresa', 'proprio', 'dinheiro_cliente']

const EMPTY = { nome: '', tipo: 'empresa', direcao: 'saida', conta_id: '', ativo: true }

export default function ObrasFontes() {
  const toast = useToast()
  const { entidadeAtiva } = useEntidade()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(EMPTY)

  const [contas, setContas] = useState([])

  useEffect(() => {
    load()
    supabase.from('contas').select('id,nome').eq('ativo', true).eq('entidade_id', entidadeAtiva?.id).order('nome')
      .then(({ data }) => setContas(data || []))
  }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('obras_fontes_pagamento').select('*').order('nome')
    setRows(data || [])
    setLoading(false)
  }

  function openNew()   { setForm(EMPTY); setEditing(null); setModal(true) }
  function openEdit(r) { setForm({ ...r, conta_id: r.conta_id || '', direcao: r.direcao || 'ambos' }); setEditing(r.id); setModal(true) }

  async function save() {
    if (!form.nome?.trim()) return toast('Nome obrigatório', 'error')
    const payload = {
      nome:     form.nome,
      tipo:     form.tipo || 'outro',
      direcao:  form.direcao || 'ambos',
      conta_id: TIPOS_MOVEM_CAIXA.includes(form.tipo) ? (form.conta_id || null) : null,
      ativo:    form.ativo !== false,
    }
    let error
    if (editing) ({ error } = await supabase.from('obras_fontes_pagamento').update(payload).eq('id', editing))
    else         ({ error } = await supabase.from('obras_fontes_pagamento').insert(payload))
    if (error) { toast(error.message, 'error'); return }
    toast('Salvo!', 'success'); setModal(false); load()
  }

  async function toggleAtivo(r) {
    await supabase.from('obras_fontes_pagamento').update({ ativo: !r.ativo }).eq('id', r.id)
    load()
  }

  const tipoLabel = t => TIPOS_FONTE.find(x => x.value === t)?.label || t
  const moveCaixa = t => TIPOS_MOVEM_CAIXA.includes(t)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const tipoAtual = TIPOS_FONTE.find(t => t.value === form.tipo)

  if (loading) return <div className="loading"><div className="spinner" /></div>

  return (
    <div>
      <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(79,142,247,.07)', border: '1px solid rgba(79,142,247,.2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)' }}>
        <strong style={{ color: 'var(--accent)' }}>Como funciona:</strong>{' '}
        A fonte define <em>quem paga</em> (Empresa, Cliente, Próprio).
        A conta bancária é escolhida em cada lançamento — assim um PIX do cliente pode cair em qualquer conta, sem precisar cadastrar uma fonte por conta.
      </div>

      <div className="toolbar">
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Nova Fonte</button>
      </div>

      <div className="card">
        {rows.length === 0
          ? <div className="empty-state"><Wallet size={40} /><p>Nenhuma fonte de pagamento cadastrada</p></div>
          : <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>Direção</th>
                    <th>Conta sugerida</th>
                    <th style={{ textAlign: 'center' }}>Movimenta Caixa</th>
                    <th style={{ textAlign: 'center' }}>Situação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} style={{ opacity: r.ativo ? 1 : .5 }}>
                      <td className="font-bold">{r.nome}</td>
                      <td>
                        <span className={`badge ${moveCaixa(r.tipo) ? 'badge-blue' : 'badge-gray'}`} style={{ fontSize: 10 }}>
                          {tipoLabel(r.tipo)}
                        </span>
                      </td>
                      <td>
                        {r.direcao === 'saida'
                          ? <span className="badge badge-red"   style={{ fontSize: 10 }}>Saída</span>
                          : r.direcao === 'entrada'
                          ? <span className="badge badge-green" style={{ fontSize: 10 }}>Entrada</span>
                          : <span className="badge badge-gray"  style={{ fontSize: 10 }}>Ambos</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                        {moveCaixa(r.tipo)
                          ? (r.conta_id
                              ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Landmark size={11} />{contas.find(c => c.id === r.conta_id)?.nome || '—'}</span>
                              : <span style={{ color: 'var(--text3)', fontStyle: 'italic', fontSize: 11 }}>Sem sugestão</span>)
                          : <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {moveCaixa(r.tipo)
                          ? <CheckCircle size={14} color="var(--green)" />
                          : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${r.ativo ? 'badge-green' : 'badge-gray'}`}>
                          {r.ativo ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td>
                        <div className="action-btns">
                          <button className="icon-btn edit"   onClick={() => openEdit(r)}><Pencil size={14} /></button>
                          <button className="icon-btn toggle" onClick={() => toggleAtivo(r)}><Power size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </div>

      {modal && (
        <Modal title={editing ? 'Editar Fonte' : 'Nova Fonte de Pagamento'} onClose={() => setModal(false)} onSave={save}>
          <div className="form-grid form-grid-1">
            <div className="form-group">
              <label className="form-label">Nome *</label>
              <input className="form-input" value={form.nome} onChange={e => f('nome', e.target.value)}
                placeholder="Ex: Empresa, Pessoal, João..." autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select className="form-select" value={form.tipo} onChange={e => { f('tipo', e.target.value); if (!TIPOS_MOVEM_CAIXA.includes(e.target.value)) f('conta_id', '') }}>
                {TIPOS_FONTE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {tipoAtual && (
                <div style={{ marginTop: 6, fontSize: 11, color: moveCaixa(form.tipo) ? 'var(--green)' : 'var(--text3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {moveCaixa(form.tipo) ? <CheckCircle size={11} /> : <AlertCircle size={11} />}
                  {tipoAtual.desc}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Direção</label>
              <select className="form-select" value={form.direcao || 'ambos'} onChange={e => f('direcao', e.target.value)}>
                <option value="saida">Saída — aparece só em despesas</option>
                <option value="entrada">Entrada — aparece só em receitas</option>
                <option value="ambos">Ambos — aparece em qualquer tipo</option>
              </select>
              <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text3)' }}>
                Filtra a fonte conforme o tipo do lançamento (despesa ou receita).
              </div>
            </div>
            {TIPOS_MOVEM_CAIXA.includes(form.tipo) && (
              <div className="form-group">
                <label className="form-label">Conta sugerida (padrão no lançamento)</label>
                <select className="form-select" value={form.conta_id} onChange={e => f('conta_id', e.target.value)}>
                  <option value="">Sem sugestão</option>
                  {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text3)' }}>
                  Será pré-selecionada no lançamento — pode ser trocada caso a caso.
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
