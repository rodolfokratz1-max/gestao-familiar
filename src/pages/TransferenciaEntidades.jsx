/**
 * TransferenciaEntidades.jsx
 * Módulo para:
 * - Transferência real entre entidades (empresa pagou despesa pessoal)
 * - Correção de lançamento na entidade errada
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useEntidade } from '../contexts/EntidadeContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { ArrowLeftRight, AlertCircle, CheckCircle, Plus, Pencil, Building2, User, ArrowRight } from 'lucide-react'
import { today, fmtDate } from '../lib/utils.js'

const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const TIPO_LABEL = { transferencia: 'Transferência', correcao: 'Correção' }
const TIPO_COLOR = { transferencia: 'badge-blue', correcao: 'badge-yellow' }

const EMPTY = {
  tipo: 'transferencia',
  descricao: '',
  valor: '',
  data_ref: today(),
  entidade_origem_id: '',
  conta_origem_id: '',
  entidade_destino_id: '',
  conta_destino_id: '',
  obs: '',
}

export default function TransferenciaEntidades() {
  const toast = useToast()
  const { entidadeAtiva, entidades, pode } = useEntidade()

  const [rows, setRows]         = useState([])
  const [contasMap, setContasMap] = useState({}) // { entidade_id: [contas] }
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)
  const [confirmando, setConfirmando] = useState(null)

  useEffect(() => {
    if (!entidadeAtiva?.id) return
    load()
    loadContas()
  }, [entidadeAtiva?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('transferencias_entidades')
      .select('*')
      .order('data_ref', { ascending: false })
      .order('created_at', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }

  async function loadContas() {
    // Carrega contas de todas as entidades que o usuário tem acesso
    const ids = entidades.map(e => e.id)
    if (!ids.length) return
    const { data } = await supabase
      .from('contas')
      .select('id,nome,entidade_id,saldo_atual')
      .in('entidade_id', ids)
      .eq('ativo', true)
      .order('nome')
    const mapa = {}
    for (const c of (data || [])) {
      if (!mapa[c.entidade_id]) mapa[c.entidade_id] = []
      mapa[c.entidade_id].push(c)
    }
    setContasMap(mapa)
  }

  const contasOrigem  = contasMap[form.entidade_origem_id]  || []
  const contasDestino = contasMap[form.entidade_destino_id] || []
  const entidadeOrigemNome  = entidades.find(e => e.id === form.entidade_origem_id)?.nome_fantasia
    || entidades.find(e => e.id === form.entidade_origem_id)?.nome || ''
  const entidadeDestinoNome = entidades.find(e => e.id === form.entidade_destino_id)?.nome_fantasia
    || entidades.find(e => e.id === form.entidade_destino_id)?.nome || ''

  function openNew() {
    setForm({ ...EMPTY, entidade_origem_id: entidadeAtiva?.id || '' })
    setModal(true)
  }

  async function save() {
    if (!form.descricao?.trim()) return toast('Descrição obrigatória', 'error')
    if (!form.valor || Number(form.valor) <= 0) return toast('Valor deve ser maior que zero', 'error')
    if (!form.entidade_origem_id) return toast('Selecione a entidade de origem', 'error')
    if (!form.entidade_destino_id) return toast('Selecione a entidade de destino', 'error')
    if (form.entidade_origem_id === form.entidade_destino_id) return toast('Origem e destino devem ser entidades diferentes', 'error')

    setSaving(true)
    try {
      const valor = Number(String(form.valor).replace(',', '.'))

      // ── Lança saída na entidade de origem ────────────────────────────────
      let caixaOrigemId = null
      if (form.conta_origem_id) {
        const descricaoOrigem = form.tipo === 'correcao'
          ? `[Correção] ${form.descricao} → ${entidadeDestinoNome}`
          : `[Transf. para ${entidadeDestinoNome}] ${form.descricao}`

        const { data: cxOri } = await supabase.from('caixa').insert({
          data:          form.data_ref,
          tipo:          'saida',
          descricao:     descricaoOrigem,
          valor,
          categoria:     form.tipo === 'correcao' ? 'Correção' : 'Transferência',
          conta_id:      form.conta_origem_id,
          entidade_id:   form.entidade_origem_id,
          obs:           form.obs || null,
          origem_tabela: 'transferencias_entidades',
        }).select().single()
        caixaOrigemId = cxOri?.id || null

        // Atualiza saldo da conta de origem
        const { data: ctOri } = await supabase.from('contas').select('saldo_atual').eq('id', form.conta_origem_id).single()
        if (ctOri) {
          await supabase.from('contas').update({ saldo_atual: Number(ctOri.saldo_atual || 0) - valor }).eq('id', form.conta_origem_id)
        }
      }

      // ── Lança entrada na entidade de destino ─────────────────────────────
      let caixaDestinoId = null
      if (form.conta_destino_id) {
        const descricaoDestino = form.tipo === 'correcao'
          ? `[Correção recebida de ${entidadeOrigemNome}] ${form.descricao}`
          : `[Transf. de ${entidadeOrigemNome}] ${form.descricao}`

        const { data: cxDest } = await supabase.from('caixa').insert({
          data:          form.data_ref,
          tipo:          'entrada',
          descricao:     descricaoDestino,
          valor,
          categoria:     form.tipo === 'correcao' ? 'Correção' : 'Transferência',
          conta_id:      form.conta_destino_id,
          entidade_id:   form.entidade_destino_id,
          obs:           form.obs || null,
          origem_tabela: 'transferencias_entidades',
        }).select().single()
        caixaDestinoId = cxDest?.id || null

        // Atualiza saldo da conta de destino
        const { data: ctDest } = await supabase.from('contas').select('saldo_atual').eq('id', form.conta_destino_id).single()
        if (ctDest) {
          await supabase.from('contas').update({ saldo_atual: Number(ctDest.saldo_atual || 0) + valor }).eq('id', form.conta_destino_id)
        }
      }

      // ── Registra a transferência ──────────────────────────────────────────
      await supabase.from('transferencias_entidades').insert({
        tipo:                form.tipo,
        descricao:           form.descricao,
        valor,
        data_ref:            form.data_ref,
        entidade_origem_id:  form.entidade_origem_id,
        conta_origem_id:     form.conta_origem_id  || null,
        caixa_origem_id:     caixaOrigemId,
        entidade_destino_id: form.entidade_destino_id,
        conta_destino_id:    form.conta_destino_id || null,
        caixa_destino_id:    caixaDestinoId,
        obs:                 form.obs || null,
      })

      toast(form.tipo === 'correcao' ? 'Correção registrada!' : 'Transferência registrada!', 'success')
      setModal(false)
      load()
      loadContas()
    } catch (e) {
      toast('Erro: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function estornar(row) {
    // Reverte os dois lançamentos no caixa
    if (row.caixa_origem_id) {
      const { data: cxO } = await supabase.from('caixa').select('valor,conta_id').eq('id', row.caixa_origem_id).single()
      if (cxO) {
        await supabase.from('caixa').delete().eq('id', row.caixa_origem_id)
        const { data: ct } = await supabase.from('contas').select('saldo_atual').eq('id', cxO.conta_id).single()
        if (ct) await supabase.from('contas').update({ saldo_atual: Number(ct.saldo_atual || 0) + Number(cxO.valor) }).eq('id', cxO.conta_id)
      }
    }
    if (row.caixa_destino_id) {
      const { data: cxD } = await supabase.from('caixa').select('valor,conta_id').eq('id', row.caixa_destino_id).single()
      if (cxD) {
        await supabase.from('caixa').delete().eq('id', row.caixa_destino_id)
        const { data: ct } = await supabase.from('contas').select('saldo_atual').eq('id', cxD.conta_id).single()
        if (ct) await supabase.from('contas').update({ saldo_atual: Number(ct.saldo_atual || 0) - Number(cxD.valor) }).eq('id', cxD.conta_id)
      }
    }
    await supabase.from('transferencias_entidades').delete().eq('id', row.id)
    toast('Estornado com sucesso', 'success')
    setConfirmando(null)
    load()
    loadContas()
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const nomeEntidade = id => {
    const e = entidades.find(x => x.id === id)
    return e ? (e.nome_fantasia || e.nome) : id
  }

  if (!entidades || entidades.length < 2) return (
    <div className="empty-state">
      <ArrowLeftRight size={40} />
      <p>Você precisa ter acesso a pelo menos 2 entidades para usar este módulo</p>
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(79,142,247,.07)', border: '1px solid rgba(79,142,247,.2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)' }}>
        <strong style={{ color: 'var(--accent)' }}>Transferências entre Entidades</strong> — use para registrar quando uma entidade paga algo pela outra,
        ou para corrigir um lançamento feito na entidade errada. Gera saída na origem e entrada no destino automaticamente.
      </div>

      <div className="toolbar">
        <div style={{ flex: 1 }} />
        {pode('lancar') && (
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={15} /> Nova Transferência / Correção
          </button>
        )}
      </div>

      <div className="card">
        {loading
          ? <div className="loading"><div className="spinner" /></div>
          : rows.length === 0
            ? <div className="empty-state"><ArrowLeftRight size={40} /><p>Nenhuma transferência registrada</p></div>
            : <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th><th>Tipo</th><th>Descrição</th>
                      <th>Origem</th><th></th><th>Destino</th>
                      <th>Valor</th><th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontSize: 12, color: 'var(--text2)' }}>{fmtDate(r.data_ref)}</td>
                        <td><span className={`badge ${TIPO_COLOR[r.tipo]}`} style={{ fontSize: 10 }}>{TIPO_LABEL[r.tipo]}</span></td>
                        <td style={{ fontWeight: 600, fontSize: 13 }}>{r.descricao}</td>
                        <td style={{ fontSize: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            {entidades.find(e=>e.id===r.entidade_origem_id)?.tipo === 'pj'
                              ? <Building2 size={11} color="var(--text3)" />
                              : <User size={11} color="var(--text3)" />}
                            {nomeEntidade(r.entidade_origem_id)}
                          </div>
                        </td>
                        <td><ArrowRight size={14} color="var(--text3)" /></td>
                        <td style={{ fontSize: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            {entidades.find(e=>e.id===r.entidade_destino_id)?.tipo === 'pj'
                              ? <Building2 size={11} color="var(--text3)" />
                              : <User size={11} color="var(--text3)" />}
                            {nomeEntidade(r.entidade_destino_id)}
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13 }}>{fmt(r.valor)}</td>
                        <td>
                          {pode('gestor') && (
                            <button className="icon-btn del" title="Estornar" onClick={() => setConfirmando(r)}>
                              ↩
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
        }
      </div>

      {/* Modal */}
      {modal && (
        <Modal title="Nova Transferência / Correção" onClose={() => setModal(false)} onSave={save}>
          <div className="form-grid form-grid-2">
            {/* Tipo */}
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Tipo</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {[
                  { id: 'transferencia', label: '💸 Transferência', desc: 'Uma entidade pagou por outra (valor real)' },
                  { id: 'correcao',      label: '🔄 Correção',      desc: 'Lançamento foi feito na entidade errada' },
                ].map(t => (
                  <button key={t.id} type="button" onClick={() => f('tipo', t.id)}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                      border: form.tipo === t.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: form.tipo === t.id ? 'var(--accent-glow)' : 'var(--bg3)',
                      textAlign: 'left',
                    }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: form.tipo === t.id ? 'var(--accent)' : 'var(--text)' }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Descrição *</label>
              <input className="form-input" value={form.descricao} onChange={e => f('descricao', e.target.value)}
                placeholder={form.tipo === 'correcao' ? 'Ex: Compra de material lançada errado' : 'Ex: Empresa pagou conta pessoal'}
                autoFocus />
            </div>

            <div className="form-group">
              <label className="form-label">Valor *</label>
              <input className="form-input" type="number" step="0.01" value={form.valor} onChange={e => f('valor', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Data</label>
              <input className="form-input" type="date" value={form.data_ref} onChange={e => f('data_ref', e.target.value)} />
            </div>

            {/* Origem */}
            <div className="form-group" style={{ paddingTop: 8, borderTop: '1px solid var(--border)', gridColumn: '1/-1' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>
                ↑ Origem (saída)
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Entidade de origem *</label>
              <select className="form-select" value={form.entidade_origem_id}
                onChange={e => { f('entidade_origem_id', e.target.value); f('conta_origem_id', '') }}>
                <option value="">Selecionar...</option>
                {entidades.map(e => (
                  <option key={e.id} value={e.id}>{e.nome_fantasia || e.nome}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Conta de origem</label>
              <select className="form-select" value={form.conta_origem_id} onChange={e => f('conta_origem_id', e.target.value)}
                disabled={!form.entidade_origem_id}>
                <option value="">Sem conta (só registra)</option>
                {contasOrigem.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>

            {/* Destino */}
            <div className="form-group" style={{ paddingTop: 8, borderTop: '1px solid var(--border)', gridColumn: '1/-1' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>
                ↓ Destino (entrada)
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Entidade de destino *</label>
              <select className="form-select" value={form.entidade_destino_id}
                onChange={e => { f('entidade_destino_id', e.target.value); f('conta_destino_id', '') }}>
                <option value="">Selecionar...</option>
                {entidades.filter(e => e.id !== form.entidade_origem_id).map(e => (
                  <option key={e.id} value={e.id}>{e.nome_fantasia || e.nome}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Conta de destino</label>
              <select className="form-select" value={form.conta_destino_id} onChange={e => f('conta_destino_id', e.target.value)}
                disabled={!form.entidade_destino_id}>
                <option value="">Sem conta (só registra)</option>
                {contasDestino.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Observações</label>
              <textarea className="form-textarea" value={form.obs || ''} onChange={e => f('obs', e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      {confirmando && (
        <ConfirmDialog
          message={`Estornar a ${TIPO_LABEL[confirmando.tipo].toLowerCase()} "${confirmando.descricao}" de ${fmt(confirmando.valor)}?\n\nOs lançamentos no caixa de ambas as entidades serão removidos e os saldos revertidos.`}
          onConfirm={() => estornar(confirmando)}
          onCancel={() => setConfirmando(null)} />
      )}
    </div>
  )
}
