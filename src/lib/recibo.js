/**
 * recibo.js
 * Gera e abre recibo de pagamento em nova janela.
 * Uso:
 *   import { gerarRecibo } from '../lib/recibo'
 *   gerarRecibo({ numero, valor, valorExtenso, cliente, cpfCnpj, formaPgto,
 *                 referencia, parcela, totalParcelas, data, local, empresa })
 */

export function gerarRecibo({
  numero, valor, valorExtenso = '',
  cliente = '', cpfCnpj = '',
  formaPgto = '', referencia = '',
  parcela = null, totalParcelas = null,
  data, local = '',
  empresa = null,
}) {
  const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  const fmtData = d => {
    if (!d) return ''
    const dt = new Date(d + 'T12:00:00')
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  }

  const logoHtml = empresa?.logo_base64
    ? `<img src="${empresa.logo_base64}" style="max-height:52px;max-width:90px;object-fit:contain" alt="Logo">`
    : `<div style="width:44px;height:44px;background:#1a2744;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#e8a030">${(empresa?.nome_fantasia || empresa?.nome || 'E').charAt(0)}</div>`

  const empresaNome    = empresa?.nome_fantasia || empresa?.nome || ''
  const empresaCnpj    = empresa?.cnpj_cpf || empresa?.cnpj || ''
  const empresaCidade  = empresa?.cidade || ''
  const empresaEstado  = empresa?.estado || ''
  const empresaTel     = empresa?.telefone || ''
  const localFinal     = local || (empresaCidade ? `${empresaCidade}${empresaEstado ? ' — ' + empresaEstado : ''}` : '')
  const parcelaInfo    = parcela && totalParcelas ? ` · Parcela ${parcela} de ${totalParcelas}` : ''

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recibo ${numero}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:#e8e8e8;padding:24px 16px;display:flex;flex-direction:column;align-items:center;gap:16px}
.btn-print{background:#1a2744;color:#fff;border:none;border-radius:8px;padding:9px 22px;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
.folha{background:#fff;width:190mm;border:1.5px solid #222;border-radius:3px;box-shadow:0 4px 20px rgba(0,0,0,.15);overflow:hidden}
.cab{display:grid;grid-template-columns:auto 1fr auto auto;align-items:stretch;border-bottom:1.5px solid #222}
.logo-bloco{padding:8px 14px;border-right:1.5px solid #222;display:flex;align-items:center;justify-content:center;min-width:80px;max-width:110px}
.emp-bloco{padding:8px 14px;display:flex;flex-direction:column;justify-content:center;border-right:1.5px solid #222}
.emp-nome{font-size:13px;font-weight:700;color:#1a2744}
.emp-det{font-size:9px;color:#666;margin-top:2px;line-height:1.5}
.rec-titulo{padding:8px 16px;display:flex;align-items:center;justify-content:center;border-right:1.5px solid #222;background:#1a2744;min-width:80px}
.rec-titulo span{font-size:15px;font-weight:800;color:#fff;letter-spacing:2px;text-transform:uppercase}
.num-bloco{padding:8px 16px;display:flex;flex-direction:column;justify-content:center;align-items:center;min-width:90px}
.num-label{font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.5px}
.num-val{font-size:20px;font-weight:700;font-family:'DM Mono',monospace;color:#1a2744;line-height:1.1}
.val-bloco{background:#f8f7f4;border-bottom:1.5px solid #222;display:flex;align-items:center;justify-content:space-between;padding:8px 18px;gap:12px}
.val-label{font-size:9px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-bottom:1px}
.val-extenso{font-size:10px;color:#666;font-style:italic}
.val-num{font-size:24px;font-weight:800;font-family:'DM Mono',monospace;color:#1a2744;white-space:nowrap}
.corpo{padding:14px 18px 12px;display:flex;flex-direction:column;gap:11px}
.lc{display:flex;align-items:baseline;gap:8px}
.lb{font-size:11px;color:#555;white-space:nowrap;flex-shrink:0}
.lv{flex:1;border-bottom:1px solid #333;padding-bottom:2px;font-size:12px;font-weight:500;color:#1a1a1a;min-width:0}
.ass{margin-top:10px;padding-top:8px;display:flex;flex-direction:column;align-items:center;gap:3px;width:55%;margin-left:auto;margin-right:auto}
.ass-linha{border-top:1px solid #333;width:100%;margin-bottom:3px;margin-top:16px}
.ass-nome{font-size:11px;font-weight:600;color:#1a2744;text-align:center}
.ass-label{font-size:9px;color:#777;text-align:center;text-transform:uppercase;letter-spacing:.3px}
.rodape{background:#f8f7f4;border-top:1.5px solid #222;padding:5px 16px;display:flex;justify-content:space-between;align-items:center}
.rodape span{font-size:8px;color:#aaa}
.rodape strong{color:#888}
.via{background:#1a2744;color:#fff;font-size:8px;font-weight:700;padding:1px 6px;border-radius:3px;letter-spacing:.5px;text-transform:uppercase}
@media print{body{background:#fff;padding:5mm}.btn-print{display:none}.folha{box-shadow:none}}
</style>
</head>
<body>
<button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
<div class="folha">
  <div class="cab">
    <div class="logo-bloco">${logoHtml}</div>
    <div class="emp-bloco">
      <div class="emp-nome">${empresaNome}</div>
      ${empresaCnpj  ? `<div class="emp-det">CNPJ/CPF: ${empresaCnpj}</div>` : ''}
      ${localFinal   ? `<div class="emp-det">${localFinal}</div>` : ''}
      ${empresaTel   ? `<div class="emp-det">${empresaTel}</div>` : ''}
    </div>
    <div class="rec-titulo"><span>Recibo</span></div>
    <div class="num-bloco">
      <div class="num-label">Nº</div>
      <div class="num-val">${String(numero).padStart(3,'0')}</div>
    </div>
  </div>
  <div class="val-bloco">
    <div>
      <div class="val-label">Valor recebido</div>
      ${valorExtenso ? `<div class="val-extenso">${valorExtenso}</div>` : ''}
    </div>
    <div class="val-num">${fmt(valor)}</div>
  </div>
  <div class="corpo">
    <div class="lc">
      <span class="lb">Recebi(emos) de</span>
      <span class="lv">${cliente}</span>
    </div>
    <div class="lc">
      <span class="lb">CPF/CNPJ</span>
      <span class="lv" style="max-width:150px">${cpfCnpj || '&nbsp;'}</span>
      <span class="lb">Forma de pagamento</span>
      <span class="lv">${formaPgto || '&nbsp;'}</span>
    </div>
    <div class="lc">
      <span class="lb">A importância de</span>
      <span class="lv">${fmt(valor)}${parcelaInfo}</span>
    </div>
    <div class="lc">
      <span class="lb">Referente a</span>
      <span class="lv">${referencia}</span>
    </div>
    <div class="lc" style="justify-content:flex-end">
      <span class="lb">${localFinal ? localFinal + ',' : ''}</span>
      <span class="lv" style="max-width:200px">${fmtData(data)}</span>
    </div>
    <div class="ass">
      <div class="ass-linha"></div>
      <div class="ass-nome">${empresaNome}</div>
      <div class="ass-label">Emitente${empresaCnpj ? ' · CNPJ/CPF ' + empresaCnpj : ''}</div>
    </div>
  </div>
  <div class="rodape">
    <span>Recibo <strong>${String(numero).padStart(3,'0')}</strong></span>
    <span>Gerado por <strong>GestãoFam</strong></span>
    <span class="via">Original</span>
  </div>
</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) { alert('Permita pop-ups para gerar o recibo.'); return }
  win.document.write(html)
  win.document.close()
  win.focus()
}
