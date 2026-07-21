/**
 * relatorioObraAnual.js
 * Resumo anual de uma obra — quebra mês a mês.
 * Usa os mesmos lançamentos já carregados na tela (lancamentosMap da obra),
 * então não faz nenhuma busca extra ao banco.
 *
 * Uso:
 *   import { imprimirRelatorioObraAnual } from '../lib/relatorioObraAnual'
 *   imprimirRelatorioObraAnual({ obra, lancamentos, ano, empresa })
 */

const fmt  = v  => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export function imprimirRelatorioObraAnual({ obra, lancamentos = [], ano, empresa = null }) {
  const anoNum = Number(ano)

  // Filtra só o ano pedido
  const doAno = lancamentos.filter(l => l.data_ref && Number(l.data_ref.slice(0, 4)) === anoNum)

  // Agrupa por mês
  const porMes = {}
  for (let m = 1; m <= 12; m++) porMes[m] = { gasto: 0, recebido: 0 }
  for (const l of doAno) {
    const mes = Number(l.data_ref.slice(5, 7))
    if (l.tipo === 'despesa') porMes[mes].gasto += Number(l.valor || 0)
    else porMes[mes].recebido += Number(l.valor || 0)
  }

  const totalGasto    = doAno.filter(l => l.tipo === 'despesa').reduce((s, l) => s + Number(l.valor || 0), 0)
  const totalRecebido = doAno.filter(l => l.tipo === 'receita').reduce((s, l) => s + Number(l.valor || 0), 0)
  const saldoAno       = totalRecebido - totalGasto
  const contratado     = Number(obra.valor_contratado || 0)

  // Meses com movimento — evita linhas vazias no relatório
  const mesesComMovimento = Object.keys(porMes)
    .map(Number)
    .filter(m => porMes[m].gasto > 0 || porMes[m].recebido > 0)
    .sort((a, b) => a - b)

  // ── Linhas da tabela mensal (pré-calculadas, evita template literal aninhado) ──
  const rowsMes = mesesComMovimento.map(m => {
    const d = porMes[m]
    const saldoMes = d.recebido - d.gasto
    const corSaldo = saldoMes >= 0 ? '#15803d' : '#b91c1c'
    return '<tr>'
      + '<td style="font-weight:600">' + MESES[m - 1] + '</td>'
      + '<td class="num" style="color:#b91c1c">' + (d.gasto > 0 ? fmt(d.gasto) : '—') + '</td>'
      + '<td class="num" style="color:#15803d">' + (d.recebido > 0 ? fmt(d.recebido) : '—') + '</td>'
      + '<td class="num" style="font-weight:700;color:' + corSaldo + '">' + fmt(saldoMes) + '</td>'
      + '</tr>'
  }).join('')

  const semMovimento = mesesComMovimento.length === 0
    ? '<tr><td colspan="4" style="text-align:center;color:#999;padding:20px 0">Nenhum lançamento em ' + anoNum + '</td></tr>'
    : ''

  const totalRecHistorico = lancamentos.filter(l => l.tipo === 'receita').reduce((s,l) => s + Number(l.valor||0), 0)
  const saldoAReceber = Math.max(0, contratado - totalRecHistorico)

  const acertoBoxHtml = contratado > 0
    ? '<div class="acerto-item"><span class="acerto-label">Valor Contratado</span><span class="acerto-val">' + fmt(contratado) + '</span></div>'
      + '<div class="acerto-item"><span class="acerto-label">Total Recebido (histórico)</span><span class="acerto-val pos">' + fmt(totalRecHistorico) + '</span></div>'
      + '<div class="acerto-item"><span class="acerto-label">Saldo a Receber</span><span class="acerto-val" style="font-size:20px">' + fmt(saldoAReceber) + '</span></div>'
    : '<div class="acerto-item"><span class="acerto-label">Saldo do ano ' + anoNum + '</span><span class="acerto-val ' + (saldoAno >= 0 ? 'pos' : 'neg') + '" style="font-size:20px">' + fmt(saldoAno) + '</span></div>'

  const logoHtml = empresa?.logo_base64
    ? '<img src="' + empresa.logo_base64 + '" class="logo" alt="Logo" />'
    : ''

  const empresaNome = empresa?.nome_fantasia || empresa?.nome || ''

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Resumo Anual ${anoNum} — ${obra.nome}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0 }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 13px; color: #1a1a2e;
      background: #fff; padding: 32px 36px;
      max-width: 900px; margin: 0 auto;
    }
    .empresa-header { display: flex; align-items: center; gap: 20px; margin-bottom: 16px }
    .logo { height: 56px; max-width: 140px; object-fit: contain }
    .empresa-nome { font-size: 17px; font-weight: 700; color: #1a1a2e }
    .divider { border: none; border-top: 2px solid #e2e8f0; margin: 16px 0 }
    .obra-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px }
    .obra-titulo { font-size: 22px; font-weight: 800; color: #1a1a2e }
    .obra-subtitulo { font-size: 13px; color: #666; margin-top: 4px }
    .emissao { font-size: 11px; color: #999; margin-top: 4px }
    .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px }
    .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px }
    .card-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 4px }
    .card-val { font-size: 18px; font-weight: 800 }
    .secao-titulo { font-size: 13px; font-weight: 700; color: #1a1a2e; margin: 24px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #e2e8f0 }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px }
    th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #888; padding: 8px 6px; border-bottom: 2px solid #e2e8f0 }
    th.num, td.num { text-align: right }
    td { padding: 8px 6px; border-bottom: 1px solid #f1f5f9 }
    tfoot td { font-weight: 800; border-top: 2px solid #1a1a2e; padding-top: 10px; background: #f8fafc }
    .acerto-box { background: #1a1a2e; border-radius: 12px; padding: 20px 24px; margin-top: 24px; color: #fff }
    .acerto-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.1) }
    .acerto-item:last-child { border-bottom: none }
    .acerto-label { font-size: 12px; color: rgba(255,255,255,.7) }
    .acerto-val { font-weight: 700; font-size: 15px }
    .pos { color: #4ade80 } .neg { color: #f87171 }
    .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #999 }
    .btn-print { position: fixed; top: 16px; right: 16px; background: #1a1a2e; color: #fff; border: none; border-radius: 8px; padding: 10px 18px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,.15) }
    @media print { .btn-print { display: none } body { padding: 0 } }
  </style>
</head>
<body>
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>

  <div class="empresa-header">
    ${logoHtml}
    <div class="empresa-nome">${empresaNome}</div>
  </div>
  <hr class="divider" />

  <div class="obra-header">
    <div>
      <div class="obra-titulo">${obra.nome}</div>
      <div class="obra-subtitulo">Resumo Anual — ${anoNum}${obra.cliente_nome ? ' · Cliente: ' + obra.cliente_nome : ''}</div>
    </div>
    <div class="emissao">Emitido em ${new Date().toLocaleDateString('pt-BR')}</div>
  </div>

  <div class="cards">
    ${contratado > 0 ? '<div class="card"><div class="card-label">Contratado</div><div class="card-val" style="color:#0369a1">' + fmt(contratado) + '</div></div>' : ''}
    <div class="card"><div class="card-label">Gasto no ano</div><div class="card-val" style="color:#b91c1c">${fmt(totalGasto)}</div></div>
    <div class="card"><div class="card-label">Recebido no ano</div><div class="card-val" style="color:#15803d">${fmt(totalRecebido)}</div></div>
    <div class="card"><div class="card-label">Saldo do ano</div><div class="card-val" style="color:${saldoAno >= 0 ? '#15803d' : '#b91c1c'}">${fmt(saldoAno)}</div></div>
  </div>

  <div class="secao-titulo">Resumo Mês a Mês — ${anoNum}</div>
  <table>
    <thead>
      <tr><th>Mês</th><th class="num">Gasto</th><th class="num">Recebido</th><th class="num">Saldo</th></tr>
    </thead>
    <tbody>
      ${rowsMes}${semMovimento}
    </tbody>
    <tfoot>
      <tr>
        <td>Total ${anoNum}</td>
        <td class="num" style="color:#b91c1c">${fmt(totalGasto)}</td>
        <td class="num" style="color:#15803d">${fmt(totalRecebido)}</td>
        <td class="num" style="color:${saldoAno >= 0 ? '#15803d' : '#b91c1c'}">${fmt(saldoAno)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="acerto-box">
    ${acertoBoxHtml}
  </div>

  <div class="footer">Relatório gerado automaticamente pelo GestãoFam</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=1000,height=800')
  if (!win) { alert('Permita pop-ups para gerar o relatório.'); return }
  win.document.write(html)
  win.document.close()
  win.focus()
}
