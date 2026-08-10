// ESTE ARQUIVO VAI EM: lib/print/fechamentoCaixa.ts
//
// Descritivo de fechamento de caixa — mesmo relatório em dois lugares:
// o operador fechando o turno no PDV, e o gestor conferindo a linha do dia
// em Financeiro → Caixa. Uma função só, pra não divergir o conteúdo entre
// as duas telas.
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

const esc = (t: any) => String(t ?? '').replace(/[&<>]/g, (c: string) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))

export function imprimirFechamentoCaixa(d: DadosFechamentoCaixa, onSemPopup?: () => void) {
  const win = window.open('', '_blank', 'width=800,height=900')
  if (!win) { onSemPopup?.(); return }

  const linhasResumo: Array<[string, number]> = [
    ['Abertura',           d.resumo.turno.valorAbertura],
    ['Vendas em dinheiro', d.resumo.emDinheiro],
    ['Suprimentos',        d.resumo.suprimentos],
    ['Sangrias',           -d.resumo.sangrias],
    ['Esperado na gaveta', d.resumo.esperadoGaveta],
  ]
  if (d.contado != null) linhasResumo.push(['Contado', d.contado])

  const linhasFormas = d.resumo.formas.map(f => `
    <tr><td>${esc(f.forma)}</td><td class="r">${f.vendas}</td><td class="r">${fmt(f.total)}</td></tr>
  `).join('')

  const linhasPorCaixa = d.resumo.porCaixa.map(c => `
    <tr><td>Caixa ${esc(c.caixa || '—')}</td><td class="r">${c.vendas}</td><td class="r">${fmt(c.total)}</td></tr>
  `).join('')

  const diferencaTxt = d.diferenca == null ? null
    : d.diferenca === 0 ? 'Confere.'
    : `${d.diferenca > 0 ? 'Sobra' : 'Falta'} de ${fmt(Math.abs(d.diferenca))}.`

  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Fechamento de caixa</title><style>
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

  </body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 300)
}
