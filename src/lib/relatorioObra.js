/**
 * relatorioObra.js
 * Gera e abre o relatório completo de uma obra em nova janela.
 * Suporta impressão em papel e salvar como PDF pelo browser.
 *
 * Uso:
 *   import { imprimirRelatorioObra } from '../lib/relatorioObra'
 *   imprimirRelatorioObra({ obra, lancamentos, empresa })
 */

const fmt  = v  => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtD = dt => {
  if (!dt) return '—'
  const d = new Date(dt + 'T12:00:00')
  return d.toLocaleDateString('pt-BR')
}

export function imprimirRelatorioObra({ obra, lancamentos = [], etapas = [], empresa = null, itensPorLancamento = {} }) {
  // ── Cálculos ──────────────────────────────────────────────────────────────
  const despesas  = lancamentos.filter(l => l.tipo === 'despesa')
  const receitas  = lancamentos.filter(l => l.tipo === 'receita')
  const totalDesp = despesas.reduce((s, l) => s + Number(l.valor || 0), 0)
  const totalRec  = receitas.reduce((s, l)  => s + Number(l.valor || 0), 0)
  const totalReemb = despesas.filter(l => l.reembolsavel).reduce((s, l) => s + Number(l.valor || 0), 0)
  const margem    = totalRec - totalDesp
  const contratado = Number(obra.valor_contratado || 0)

  // Agrupa por fonte de pagamento
  const grupos = {}
  for (const l of lancamentos) {
    const chave = l.pago_por || 'Sem fonte'
    if (!grupos[chave]) grupos[chave] = { despesas: 0, receitas: 0, reembolsavel: 0, itens: [] }
    if (l.tipo === 'despesa') grupos[chave].despesas += Number(l.valor || 0)
    else                      grupos[chave].receitas  += Number(l.valor || 0)
    if (l.reembolsavel)       grupos[chave].reembolsavel += Number(l.valor || 0)
    grupos[chave].itens.push(l)
  }

  // ── Empresa header ────────────────────────────────────────────────────────
  const logoHtml = empresa?.logo_base64
    ? `<img src="${empresa.logo_base64}" class="logo" alt="Logo" />`
    : ''

  const enderecoEmp = [
    empresa?.endereco, empresa?.numero, empresa?.complemento,
    empresa?.bairro, empresa?.cidade, empresa?.estado
  ].filter(Boolean).join(', ')

  const empresaHtml = empresa ? `
    <div class="empresa-header">
      ${logoHtml}
      <div class="empresa-info">
        <div class="empresa-nome">${empresa.nome_fantasia || empresa.nome}</div>
        ${(empresa.cnpj||empresa.cnpj_cpf) ? `<div class="empresa-detalhe">CNPJ: ${empresa.cnpj||empresa.cnpj_cpf}</div>` : ''}
        ${enderecoEmp     ? `<div class="empresa-detalhe">${enderecoEmp}</div>` : ''}
        ${empresa.telefone ? `<div class="empresa-detalhe">Tel: ${empresa.telefone}</div>` : ''}
        ${empresa.email   ? `<div class="empresa-detalhe">${empresa.email}</div>` : ''}
      </div>
    </div>
    <div class="divider"></div>
  ` : ''

  // ── Status label ──────────────────────────────────────────────────────────
  const statusLabel = {
    planejamento: 'Planejamento', em_andamento: 'Em Andamento',
    concluida: 'Concluída', cancelada: 'Cancelada'
  }[obra.status] || obra.status


  // ── Seção de etapas ──────────────────────────────────────────────────────
  const lancPorEtapa = (etId) => lancamentos.filter(l => l.etapa_id === etId)
  const gastoPorEtapa = (etId) => lancPorEtapa(etId)
    .filter(l => l.tipo === 'despesa').reduce((s, l) => s + Number(l.valor || 0), 0)

  const etapasHtml = etapas.length === 0 ? '' : `
    <div class="secao">
      <div class="secao-titulo">Etapas da Obra</div>
      <table class="tabela-lanc">
        <thead>
          <tr>
            <th>Etapa</th><th>Status</th><th class="num">Orçado</th>
            <th class="num">Realizado</th><th class="num">Saldo</th>
          </tr>
        </thead>
        <tbody>
          ${etapas.map(e => {
            const gasto  = gastoPorEtapa(e.id)
            const orcado = Number(e.valor_orcado || 0)
            const saldo  = orcado - gasto
            const statusLabel = { pendente:'Pendente', em_andamento:'Em Andamento', concluida:'Concluída', cancelada:'Cancelada' }[e.status] || e.status
            return `<tr>
              <td><strong>${e.nome}</strong>${e.descricao ? '<br><span class="obs">'+e.descricao+'</span>' : ''}</td>
              <td><span class="badge ${e.status === 'concluida' ? 'badge-pos' : e.status === 'em_andamento' ? 'badge-neg' : ''}" style="background:#f1f5f9;color:#475569">${statusLabel}</span></td>
              <td class="num">${orcado > 0 ? fmt(orcado) : '—'}</td>
              <td class="num neg">${fmt(gasto)}</td>
              <td class="num ${saldo >= 0 ? 'pos' : 'neg'}">${orcado > 0 ? fmt(saldo) : '—'}</td>
            </tr>`
          }).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2" class="num" style="font-weight:600;color:#666">Total</td>
            <td class="num" style="font-weight:700">${fmt(etapas.reduce((s,e) => s+Number(e.valor_orcado||0),0))}</td>
            <td class="num neg" style="font-weight:700">${fmt(totalDesp)}</td>
            <td class="num ${totalDesp <= etapas.reduce((s,e)=>s+Number(e.valor_orcado||0),0) ? 'pos':'neg'}" style="font-weight:700">
              ${fmt(etapas.reduce((s,e)=>s+Number(e.valor_orcado||0),0) - totalDesp)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  `

  // ── Seção resumo por fonte ────────────────────────────────────────────────
  const fontesHtml = Object.entries(grupos).map(([nome, g]) => `
    <div class="fonte-bloco">
      <div class="fonte-titulo">
        <span>${nome}</span>
        <span class="fonte-totais">
          ${g.despesas > 0 ? `<span class="neg">− ${fmt(g.despesas)}</span>` : ''}
          ${g.receitas > 0 ? `<span class="pos">+ ${fmt(g.receitas)}</span>` : ''}
          ${g.reembolsavel > 0 ? `<span class="warn">reemb.: ${fmt(g.reembolsavel)}</span>` : ''}
        </span>
      </div>
      ${g.itens.map(l => `
        <div class="fonte-item">
          <span class="fonte-item-desc">${fmtD(l.data_ref)} — ${l.descricao}${l.reembolsavel ? ' ♻' : ''}</span>
          <span class="${l.tipo === 'despesa' ? 'neg' : 'pos'}">${l.tipo === 'despesa' ? '−' : '+'} ${fmt(l.valor)}</span>
        </div>
      `).join('')}
    </div>
  `).join('')

  // ── Seção detalhe completo (tabela cronológica) ───────────────────────────
  const lancOrdenados = [...lancamentos].sort((a, b) => (a.data_ref || '').localeCompare(b.data_ref || ''))

  const tabelaHtml = lancOrdenados.length === 0
    ? '<p style="color:#888;font-size:13px">Nenhum lançamento registrado.</p>'
    : `
    <table class="tabela-lanc">
      <thead>
        <tr>
          <th>Data</th>
          <th>Tipo</th>
          <th>Descrição</th>
          <th>Fonte / Pago por</th>
          <th>Reemb.</th>
          <th class="num">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${lancOrdenados.map(l => `
          <tr>
            <td class="data">${fmtD(l.data_ref)}</td>
            <td><span class="badge ${l.tipo === 'despesa' ? 'badge-neg' : 'badge-pos'}">${l.tipo === 'despesa' ? 'Despesa' : 'Receita'}</span></td>
            <td>${l.descricao}${l.obs ? `<br><span class="obs">${l.obs}</span>` : ''}${
              (itensPorLancamento[l.id] && itensPorLancamento[l.id].length > 0)
                ? '<ul class="itens-lista">' + itensPorLancamento[l.id].map(it =>
                    `<li>${it.quantidade}x ${it.descricao} — ${fmt(it.valor_unitario)}/un = ${fmt(it.valor_total)}${it.desconta_estoque ? ' <span class="tag-estoque">estoque</span>' : ''}</li>`
                  ).join('') + '</ul>'
                : ''
            }</td>
            <td class="fonte">${l.pago_por || '—'}</td>
            <td class="centro">${l.reembolsavel ? '♻' : '—'}</td>
            <td class="num ${l.tipo === 'despesa' ? 'neg' : 'pos'}">${l.tipo === 'despesa' ? '−' : '+'} ${fmt(l.valor)}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" class="num" style="font-weight:600;color:#666">Total Despesas</td>
          <td class="num neg" style="font-weight:700">${fmt(totalDesp)}</td>
        </tr>
        <tr>
          <td colspan="5" class="num" style="font-weight:600;color:#666">Total Receitas</td>
          <td class="num pos" style="font-weight:700">${fmt(totalRec)}</td>
        </tr>
        <tr class="tr-margem">
          <td colspan="5" class="num" style="font-weight:700">Margem (rec. − desp.)</td>
          <td class="num ${margem >= 0 ? 'pos' : 'neg'}" style="font-weight:700;font-size:15px">${margem >= 0 ? '+' : ''}${fmt(margem)}</td>
        </tr>
      </tfoot>
    </table>
  `

  // ── Acerto final ──────────────────────────────────────────────────────────
  const acertoHtml = `
    <div class="acerto">
      <div class="acerto-titulo">Acerto Final</div>
      <div class="acerto-grid">
        ${contratado > 0 ? `
          <div class="acerto-item">
            <span class="acerto-label">Valor Contratado</span>
            <span class="acerto-val">${fmt(contratado)}</span>
          </div>
        ` : ''}
        <div class="acerto-item">
          <span class="acerto-label">Total Recebido</span>
          <span class="acerto-val pos">${fmt(totalRec)}</span>
        </div>
        <div class="acerto-item">
          <span class="acerto-label">Total Gasto</span>
          <span class="acerto-val neg">${fmt(totalDesp)}</span>
        </div>
        ${totalReemb > 0 ? `
          <div class="acerto-item">
            <span class="acerto-label">A Reembolsar pelo Cliente</span>
            <span class="acerto-val warn">${fmt(totalReemb)}</span>
          </div>
        ` : ''}
        <div class="acerto-item acerto-item-destaque">
          <span class="acerto-label">Margem</span>
          <span class="acerto-val ${margem >= 0 ? 'pos' : 'neg'}" style="font-size:20px;font-weight:800">${margem >= 0 ? '+' : ''}${fmt(margem)}</span>
        </div>
      </div>
    </div>
  `

  // ── HTML completo ─────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Relatório — ${obra.nome}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0 }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 13px; color: #1a1a2e;
      background: #fff; padding: 32px 36px;
      max-width: 900px; margin: 0 auto;
    }

    /* Empresa */
    .empresa-header { display: flex; align-items: center; gap: 20px; margin-bottom: 16px }
    .logo { height: 56px; max-width: 140px; object-fit: contain }
    .empresa-nome { font-size: 17px; font-weight: 700; color: #1a1a2e }
    .empresa-detalhe { font-size: 11px; color: #666; margin-top: 2px }
    .divider { border: none; border-top: 2px solid #e2e8f0; margin: 16px 0 }

    /* Cabeçalho da obra */
    .obra-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px }
    .obra-titulo { font-size: 22px; font-weight: 800; color: #1a1a2e }
    .obra-subtitulo { font-size: 13px; color: #666; margin-top: 4px }
    .obra-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px }
    .badge-status {
      display: inline-block; padding: 3px 10px; border-radius: 20px;
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px;
      background: #e0f2fe; color: #0369a1
    }
    .emissao { font-size: 11px; color: #999; margin-top: 4px }

    /* Cards de resumo */
    .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px }
    .card {
      border: 1px solid #e2e8f0; border-radius: 10px;
      padding: 12px 14px;
    }
    .card-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 4px }
    .card-val { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums }

    /* Seção */
    .secao { margin-bottom: 28px }
    .secao-titulo {
      font-size: 11px; font-weight: 700; color: #888;
      text-transform: uppercase; letter-spacing: .5px;
      border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 12px
    }

    /* Por fonte */
    .fonte-bloco { margin-bottom: 12px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden }
    .fonte-titulo {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 12px; background: #f8fafc;
      font-size: 12px; font-weight: 700; color: #334155
    }
    .fonte-totais { display: flex; gap: 12px; font-size: 12px }
    .fonte-item {
      display: flex; justify-content: space-between;
      padding: 5px 12px; font-size: 12px; color: #475569;
      border-top: 1px solid #f1f5f9
    }
    .fonte-item-desc { flex: 1; margin-right: 12px }

    /* Tabela de lançamentos */
    .tabela-lanc { width: 100%; border-collapse: collapse; font-size: 12px }
    .tabela-lanc th {
      padding: 8px 10px; text-align: left; font-size: 10px;
      text-transform: uppercase; letter-spacing: .5px;
      color: #888; background: #f8fafc;
      border-bottom: 2px solid #e2e8f0
    }
    .tabela-lanc td {
      padding: 7px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top
    }
    .tabela-lanc tfoot td { border-top: 2px solid #e2e8f0; border-bottom: none; padding: 8px 10px }
    .tabela-lanc tfoot .tr-margem td { background: #f8fafc }
    .badge { display: inline-block; padding: 2px 7px; border-radius: 12px; font-size: 10px; font-weight: 600 }
    .badge-neg { background: #fee2e2; color: #b91c1c }
    .badge-pos { background: #dcfce7; color: #15803d }
    .obs { font-size: 10px; color: #94a3b8; font-style: italic }
    .itens-lista { margin: 4px 0 0; padding-left: 16px; font-size: 10px; color: #64748b }
    .itens-lista li { margin-bottom: 2px }
    .tag-estoque { font-size: 8px; background: #e0e7ff; color: #4338ca; padding: 1px 5px; border-radius: 8px; margin-left: 4px }
    .data  { white-space: nowrap; color: #64748b }
    .fonte { color: #64748b; font-size: 11px }
    .centro { text-align: center }
    .num { text-align: right; font-variant-numeric: tabular-nums }

    /* Cores */
    .pos  { color: #15803d }
    .neg  { color: #b91c1c }
    .warn { color: #b45309 }

    /* Acerto final */
    .acerto {
      border: 2px solid #e2e8f0; border-radius: 12px;
      overflow: hidden; margin-top: 8px
    }
    .acerto-titulo {
      background: #1e293b; color: #fff;
      font-size: 12px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .5px;
      padding: 10px 16px
    }
    .acerto-grid { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px }
    .acerto-item { display: flex; justify-content: space-between; align-items: center }
    .acerto-item-destaque {
      border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 4px
    }
    .acerto-label { font-size: 13px; color: #475569 }
    .acerto-val { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums }

    /* Botão imprimir — some na impressão */
    .btn-print {
      position: fixed; top: 20px; right: 20px;
      background: #2563eb; color: #fff;
      border: none; border-radius: 10px;
      padding: 10px 22px; font-size: 14px; font-weight: 600;
      cursor: pointer; box-shadow: 0 4px 12px rgba(37,99,235,.3);
      display: flex; align-items: center; gap: 8px;
      transition: background .15s
    }
    .btn-print:hover { background: #1d4ed8 }

    /* Rodapé */
    .rodape {
      margin-top: 32px; padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      font-size: 10px; color: #94a3b8;
      display: flex; justify-content: space-between
    }

    @media print {
      body { padding: 20px 24px }
      .btn-print { display: none !important }
      .fonte-bloco { break-inside: avoid }
      .acerto { break-inside: avoid }
    }
  </style>
</head>
<body>

  <button class="btn-print" onclick="window.print()">
    🖨️ Imprimir / Salvar PDF
  </button>

  ${empresaHtml}

  <!-- Cabeçalho da obra -->
  <div class="obra-header">
    <div>
      <div class="obra-titulo">${obra.nome}</div>
      <div class="obra-subtitulo">
        ${obra.cliente_nome ? `Cliente: <strong>${obra.cliente_nome}</strong>` : ''}
        ${obra.data_inicio ? ` &nbsp;·&nbsp; Início: ${fmtD(obra.data_inicio)}` : ''}
        ${obra.data_fim    ? ` &nbsp;·&nbsp; Conclusão: ${fmtD(obra.data_fim)}` : ''}
      </div>
    </div>
    <div class="obra-meta">
      <span class="badge-status">${statusLabel}</span>
      <span class="emissao">Emitido em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
    </div>
  </div>

  <!-- Cards de resumo -->
  <div class="cards">
    ${contratado > 0 ? `
      <div class="card">
        <div class="card-label">Contratado</div>
        <div class="card-val" style="color:#2563eb">${fmt(contratado)}</div>
      </div>
    ` : ''}
    <div class="card">
      <div class="card-label">Total Recebido</div>
      <div class="card-val pos">${fmt(totalRec)}</div>
    </div>
    <div class="card">
      <div class="card-label">Total Gasto</div>
      <div class="card-val neg">${fmt(totalDesp)}</div>
    </div>
    <div class="card">
      <div class="card-label">Margem</div>
      <div class="card-val ${margem >= 0 ? 'pos' : 'neg'}">${margem >= 0 ? '+' : ''}${fmt(margem)}</div>
    </div>
  </div>

  ${obra.obs ? `
    <div class="secao">
      <div class="secao-titulo">Observações</div>
      <p style="font-size:13px;color:#475569">${obra.obs}</p>
    </div>
  ` : ''}

  ${etapasHtml}

  <!-- Resumo por fonte de pagamento -->
  <div class="secao">
    <div class="secao-titulo">Resumo por Fonte de Pagamento</div>
    ${Object.keys(grupos).length > 0 ? fontesHtml : '<p style="color:#888;font-size:13px">Nenhum lançamento.</p>'}
  </div>

  ${totalReemb > 0 ? `
    <div style="margin: -16px 0 24px; padding: 10px 14px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; font-size: 13px">
      ♻ <strong style="color:#b45309">Valor reembolsável pelo cliente:</strong>
      <strong style="color:#b45309; margin-left: 8px">${fmt(totalReemb)}</strong>
    </div>
  ` : ''}

  <!-- Detalhe completo -->
  <div class="secao">
    <div class="secao-titulo">Detalhe Completo dos Lançamentos (${lancamentos.length} registros)</div>
    ${tabelaHtml}
  </div>

  <!-- Acerto final -->
  ${acertoHtml}

  <!-- Rodapé -->
  <div class="rodape">
    <span>${empresa ? (empresa.nome_fantasia || empresa.nome) : ''}</span>
    <span>GestãoFam · Relatório gerado em ${new Date().toLocaleString('pt-BR')}</span>
  </div>

</body>
</html>`

  // Abre em nova janela
  const win = window.open('', '_blank', 'width=960,height=800')
  if (!win) {
    alert('Permita pop-ups para este site para abrir o relatório.')
    return
  }
  win.document.write(html)
  win.document.close()
  win.focus()
}
