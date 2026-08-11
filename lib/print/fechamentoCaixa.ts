// ESTE ARQUIVO VAI EM: lib/print/fechamentoCaixa.ts
//
// Descritivo de fechamento de caixa — mesmo relatório em dois lugares:
// o operador fechando o turno no PDV, e o gestor conferindo a linha do dia
// em Financeiro → Caixa. Uma função só, pra não divergir o conteúdo entre
// as duas telas.
//
// Dois formatos, porque a folha e a bobina não se dão bem com o mesmo layout:
// A4 é a tabela de sempre. Térmica reaproveita o estilo do cupom (Consolas
// em negrito, largura de 72mm) — sem isso, o descritivo saía claro e
// espremido no meio da bobina.
import { fmtMoeda as fmt, fmtDataHoraLocal } from '@/lib/format'

export interface DadosFechamentoCaixa {
  numeroCaixa: number | string
  operador:    string
  abertoEm:    string | Date
  fechadoEm?:  string | Date | null
  resumo: {
    turno: { valorAbertura: number }
    formas: Array<{ forma: string; vendas: number; total: number }>
    porCaixa: Array<{ caixa: number; vendas: number; total: number }>
    emDinheiro: number
    sangrias: number
    suprimentos: number
    esperadoGaveta: number
  }
  contado?:     number | null
  diferenca?:   number | null
  observacao?:  string | null
}

export type FormatoImpressaoCaixa = 'a4' | 'termica'

const esc = (t: any) => String(t ?? '').replace(/[&<>]/g, (c: string) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))

function montarLinhas(d: DadosFechamentoCaixa) {
  const linhasResumo: Array<[string, number]> = [
    ['Abertura',           d.resumo.turno.valorAbertura],
    ['Vendas em dinheiro', d.resumo.emDinheiro],
    ['Suprimentos',        d.resumo.suprimentos],
    ['Sangrias',           -d.resumo.sangrias],
    ['Esperado na gaveta', d.resumo.esperadoGaveta],
  ]
  if (d.contado != null) linhasResumo.push(['Contado', d.contado])

  const diferencaTxt = d.diferenca == null ? null
    : d.diferenca === 0 ? 'Confere.'
    : `${d.diferenca > 0 ? 'Sobra' : 'Falta'} de ${fmt(Math.abs(d.diferenca))}.`

  return { linhasResumo, diferencaTxt }
}

function htmlA4(d: DadosFechamentoCaixa) {
  const { linhasResumo, diferencaTxt } = montarLinhas(d)

  const linhasFormas = d.resumo.formas.map(f => `
    <tr><td>${esc(f.forma)}</td><td class="r">${f.vendas}</td><td class="r">${fmt(f.total)}</td></tr>
  `).join('')

  const linhasPorCaixa = d.resumo.porCaixa.map(c => `
    <tr><td>Caixa ${esc(c.caixa || '—')}</td><td class="r">${c.vendas}</td><td class="r">${fmt(c.total)}</td></tr>
  `).join('')

  return `<!doctype html><html><head><meta charset="utf-8"><title>Fechamento de caixa</title><style>
    @page { size: A4; margin: 16mm; }
    * { font-family: Arial, Helvetica, sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; font-size: 13px; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    p.sub { margin: 0 0 16px; color: #555; font-size: 12px; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #444; margin: 20px 0 6px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
    td, th { padding: 5px 6px; border-bottom: 1px solid #eee; text-align: left; }
    th { font-size: 11px; text-transform: uppercase; color: #777; border-bottom: 1px solid #ccc; }
    .r { text-align: right; }
    tr.total td { font-weight: 700; border-top: 2px solid #333; border-bottom: none; }
    .aviso { margin-top: 10px; padding: 8px 10px; border-radius: 6px; font-size: 13px; font-weight: 600; }
    .ok    { background: #e8f7ee; color: #1a7a3c; }
    .warn  { background: #fdf3e0; color: #9a6a00; }
    .obs   { margin-top: 16px; font-size: 12px; color: #444; }
  </style></head><body>

    <h1>Descritivo de fechamento de caixa</h1>
    <p class="sub">
      Caixa ${esc(d.numeroCaixa)} · Operador ${esc(d.operador)} ·
      Aberto em ${fmtDataHoraLocal(d.abertoEm)}
      ${d.fechadoEm ? ` · Fechado em ${fmtDataHoraLocal(d.fechadoEm)}` : ''}
    </p>

    <h2>Resumo</h2>
    <table>
      ${linhasResumo.map(([rot, val]) => `<tr><td>${esc(rot)}</td><td class="r">${fmt(val)}</td></tr>`).join('')}
    </table>

    ${diferencaTxt ? `<div class="aviso ${d.diferenca === 0 ? 'ok' : 'warn'}">${diferencaTxt}</div>` : ''}

    ${d.resumo.formas.length > 0 ? `
      <h2>Por forma de pagamento</h2>
      <table>
        <tr><th>Forma</th><th class="r">Vendas</th><th class="r">Total</th></tr>
        ${linhasFormas}
      </table>
    ` : ''}

    ${d.resumo.porCaixa.length > 0 ? `
      <h2>Por caixa</h2>
      <table>
        <tr><th>Caixa</th><th class="r">Vendas</th><th class="r">Total</th></tr>
        ${linhasPorCaixa}
      </table>
    ` : ''}

    ${d.observacao ? `<p class="obs"><strong>Observação do fechamento:</strong> ${esc(d.observacao)}</p>` : ''}

  </body></html>`
}

// Mesmo tratamento visual do cupom: Consolas em negrito e print-color-adjust
// exact, porque impressora térmica queima o papel por ponto — traço fino sai
// apagado, e é isso que estava saindo "sem tinta".
function htmlTermica(d: DadosFechamentoCaixa) {
  const { linhasResumo, diferencaTxt } = montarLinhas(d)

  const linhasFormas = d.resumo.formas.map(f => `
    <tr><td>${esc(f.forma)}</td><td class="r">${f.vendas}</td><td class="r">${fmt(f.total)}</td></tr>
  `).join('')

  const linhasPorCaixa = d.resumo.porCaixa.map(c => `
    <tr><td>Caixa ${esc(c.caixa || '—')}</td><td class="r">${c.vendas}</td><td class="r">${fmt(c.total)}</td></tr>
  `).join('')

  return `<!doctype html><html><head><meta charset="utf-8"><title>Fechamento de caixa</title><style>
    @page { size: 80mm auto; margin: 0; }
    * {
      font-family: 'Consolas', 'DejaVu Sans Mono', 'Courier New', monospace;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { width: 72mm; margin: 0; padding: 4mm 3mm; font-size: 13px; line-height: 1.35; font-weight: 700; }
    h1 { font-size: 15px; text-align: center; margin: 0 0 4px; font-weight: 900; letter-spacing: .5px; }
    p { margin: 1px 0; }
    p.sub { font-size: 11px; font-weight: 400; margin-bottom: 4px; }
    .c { text-align: center; } .r { text-align: right; }
    table { width: 100%; border-collapse: collapse; }
    td, th { padding: 2px 0; text-align: left; }
    th { font-size: 11px; }
    hr { border: none; border-top: 2px solid #000; margin: 5px 0; }
    hr.leve { border-top: 1px dashed #000; }
    .aviso { margin-top: 6px; padding: 4px 0; font-size: 13px; font-weight: 900; text-align: center; }
    .obs { margin-top: 8px; font-size: 12px; font-weight: 400; }
  </style></head><body>

    <h1>DESCRITIVO DE FECHAMENTO</h1>
    <p class="c sub">
      Caixa ${esc(d.numeroCaixa)} · ${esc(d.operador)}<br/>
      Aberto ${fmtDataHoraLocal(d.abertoEm)}
      ${d.fechadoEm ? `<br/>Fechado ${fmtDataHoraLocal(d.fechadoEm)}` : ''}
    </p>
    <hr/>

    <table>
      ${linhasResumo.map(([rot, val]) => `<tr><td>${esc(rot)}</td><td class="r">${fmt(val)}</td></tr>`).join('')}
    </table>

    ${diferencaTxt ? `<div class="aviso">${diferencaTxt}</div>` : ''}

    ${d.resumo.formas.length > 0 ? `
      <hr class="leve"/>
      <table>
        <tr><th colspan="3">POR FORMA DE PAGAMENTO</th></tr>
        ${linhasFormas}
      </table>
    ` : ''}

    ${d.resumo.porCaixa.length > 0 ? `
      <hr class="leve"/>
      <table>
        <tr><th colspan="3">POR CAIXA</th></tr>
        ${linhasPorCaixa}
      </table>
    ` : ''}

    ${d.observacao ? `<hr class="leve"/><p class="obs">Observação: ${esc(d.observacao)}</p>` : ''}
    <hr/>

  </body></html>`
}

export function imprimirFechamentoCaixa(
  d: DadosFechamentoCaixa,
  onSemPopup?: () => void,
  formato: FormatoImpressaoCaixa = 'a4',
) {
  const win = window.open('', '_blank', formato === 'termica' ? 'width=380,height=640' : 'width=800,height=900')
  if (!win) { onSemPopup?.(); return }

  win.document.write(formato === 'termica' ? htmlTermica(d) : htmlA4(d))
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 300)
}
