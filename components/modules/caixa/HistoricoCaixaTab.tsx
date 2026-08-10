'use client'
// ESTE ARQUIVO VAI EM: components/modules/caixa/HistoricoCaixaTab.tsx
//
// HISTÓRICO DE CAIXA — a visão do gestor.
//
// A operação — abrir, sangria, fechar — fica no PDV, onde o operador está.
// Aqui é leitura: quem fechou, quando, com qual diferença. São públicos
// diferentes, e o perfil Vendedor não tem acesso a esta tela.
//
// A diferença é o número que interessa. Por isso ela é a coluna destacada, e
// não o total vendido — faturamento já existe em Consultas.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InfoTip } from '@/components/ui/InfoTip'
import { SidePanel } from '@/components/ui/SidePanel'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import {
  SeletorPeriodo, PERIODICIDADES, intervaloDe, deslocar,
  type Periodicidade,
} from '@/components/ui/SeletorPeriodo'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { fmtMoeda as fmt } from '@/lib/format'
import { imprimirFechamentoCaixa } from '@/lib/print/fechamentoCaixa'

interface Props { tenantSlug: string }

const fmtDataHora = (d: any) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export default function HistoricoCaixaTab({ tenantSlug }: Props) {
  const { toast } = useToast()
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>('mensal')
  const [ancora, setAncora]   = useState(new Date())
  const [fimCustom, setFim]   = useState<Date | null>(null)
  const [detalhe, setDetalhe] = useState<any | null>(null)

  const periodo = intervaloDe(periodicidade, ancora, fimCustom)

  const { data: raw, isLoading } = useQuery({
    queryKey: ['caixa-historico', tenantSlug, periodo.inicio, periodo.fim],
    queryFn:  async () => (await fetch(
      `/api/${tenantSlug}/caixa?historico=true&dataInicio=${periodo.inicio}&dataFim=${periodo.fim}`
    )).json(),
  })
  const turnos: any[] = raw?.data ?? []

  const { data: resumoRaw } = useQuery({
    queryKey: ['caixa-resumo', tenantSlug, detalhe?.turno_id],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/caixa?turnoId=${detalhe.turno_id}`)).json(),
    enabled:  !!detalhe,
  })
  const resumo = resumoRaw?.data

  // Só turnos fechados entram nas somas: turno aberto ainda não tem diferença,
  // e contá-lo como zero faria a média mentir.
  const fechados  = turnos.filter(t => t.status === 'fechado')
  const totalDif  = fechados.reduce((a, t) => a + Number(t.diferenca ?? 0), 0)
  const comFalta  = fechados.filter(t => Number(t.diferenca ?? 0) < 0).length

  const colunas: Coluna[] = [
    { chave: 'aberto_em', titulo: 'Abertura', render: (t: any) => (
      <span className="text-sm text-gray-700">{fmtDataHora(t.aberto_em)}</span>
    )},
    { chave: 'operador', titulo: 'Operador', filtravel: true, render: (t: any) => (
      <span className="text-sm text-gray-900">{t.operador}</span>
    )},
    { chave: 'numero_caixa', titulo: 'Caixa', filtravel: true, render: (t: any) => (
      <span className="text-sm text-gray-600">{t.numero_caixa}</span>
    )},
    { chave: 'vendido', titulo: 'Vendido', render: (t: any) => (
      <span className="text-sm text-gray-700">{fmt(Number(t.vendido ?? 0))}</span>
    )},
    { chave: 'valor_esperado', titulo: 'Esperado', esconderAte: 'lg', render: (t: any) => (
      <span className="text-sm text-gray-600">
        {t.valor_esperado == null ? '—' : fmt(Number(t.valor_esperado))}
      </span>
    )},
    { chave: 'valor_fechamento', titulo: 'Contado', esconderAte: 'lg', render: (t: any) => (
      <span className="text-sm text-gray-600">
        {t.valor_fechamento == null ? '—' : fmt(Number(t.valor_fechamento))}
      </span>
    )},
    {
      chave: 'diferenca', titulo: 'Diferença',
      cabecalho: <InfoTip titulo="Diferença">Contado menos esperado. Negativo é falta.</InfoTip>,
      render: (t: any) => {
        if (t.status !== 'fechado') return <span className="text-xs text-gray-400">aberto</span>
        const d = Number(t.diferenca ?? 0)
        if (d === 0) return <span className="text-sm text-gray-400">—</span>
        return (
          <span className={`text-sm font-semibold ${d < 0 ? 'text-red-600' : 'text-amber-600'}`}>
            {d < 0 ? '−' : '+'}{fmt(Math.abs(d))}
          </span>
        )
      },
    },
  ]

  function exportar() {
    if (turnos.length === 0) { toast('Nada para exportar neste período.', 'error'); return }
    const linhas = turnos.map(t => [
      fmtDataHora(t.aberto_em), t.operador, t.numero_caixa,
      (Number(t.vendido ?? 0) / 100).toFixed(2),
      t.valor_esperado == null ? '' : (Number(t.valor_esperado) / 100).toFixed(2),
      t.valor_fechamento == null ? '' : (Number(t.valor_fechamento) / 100).toFixed(2),
      t.diferenca == null ? '' : (Number(t.diferenca) / 100).toFixed(2),
    ])
    const csv = [['Abertura', 'Operador', 'Caixa', 'Vendido', 'Esperado', 'Contado', 'Diferenca'], ...linhas]
      .map(l => l.join(';')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = `caixa-${periodo.inicio}-a-${periodo.fim}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <select
            value={periodicidade}
            onChange={e => setPeriodicidade(e.target.value as Periodicidade)}
            className="h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white">
            {PERIODICIDADES.map(p => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={() => setAncora(deslocar(periodicidade, ancora, -1, fimCustom))}>
            <ChevronLeft size={14} />
          </Button>
          <SeletorPeriodo
            periodicidade={periodicidade} valor={ancora} onChange={setAncora}
            fimCustom={fimCustom}
            onChangeCustom={(i, f) => { setAncora(i); setFim(f) }}
          />
          <Button variant="outline" size="sm" onClick={() => setAncora(deslocar(periodicidade, ancora, 1, fimCustom))}>
            <ChevronRight size={14} />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={exportar}>
          <Download size={14} className="mr-1.5" /> Exportar
        </Button>
      </div>

      {fechados.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { rot: 'Turnos fechados', val: String(fechados.length), cor: 'text-gray-900' },
            { rot: 'Com falta',       val: String(comFalta),        cor: comFalta > 0 ? 'text-red-600' : 'text-gray-900' },
            { rot: 'Diferença total', val: fmt(totalDif),           cor: totalDif < 0 ? 'text-red-600' : 'text-gray-900' },
          ].map(k => (
            <div key={k.rot} className="bg-white rounded-xl border border-gray-100 px-4 py-3">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">{k.rot}</p>
              <p className={`text-xl font-semibold mt-1 ${k.cor}`}>{k.val}</p>
            </div>
          ))}
        </div>
      )}

      <DataTable
        colunas={colunas}
        itens={turnos}
        chave={(t: any) => t.turno_id}
        carregando={isLoading}
        vazio="Nenhum turno neste período."
        onLinhaClick={(t: any) => setDetalhe(t)}
      />

      {detalhe && (
        <SidePanel
          titulo={`Caixa ${detalhe.numero_caixa} — ${detalhe.operador}`}
          subtitulo={fmtDataHora(detalhe.aberto_em)}
          largura="w-[30vw] min-w-[480px]"
          onClose={() => setDetalhe(null)}
          rodape={
            <Button variant="outline" disabled={!resumo} onClick={() => {
              if (!resumo) return
              imprimirFechamentoCaixa({
                numeroCaixa: detalhe.numero_caixa,
                operador:    detalhe.operador,
                abertoEm:    detalhe.aberto_em,
                fechadoEm:   detalhe.status === 'fechado' ? detalhe.fechado_em : null,
                resumo,
                contado:    detalhe.valor_fechamento ?? null,
                diferenca:  detalhe.status === 'fechado' ? Number(detalhe.diferenca ?? 0) : null,
                observacao: detalhe.observacao ?? null,
              }, () => toast('Habilite pop-ups para imprimir.', 'error'))
            }}>
              <Printer size={14} className="mr-1.5" /> Imprimir descritivo de fechamento de caixa
            </Button>
          }
        >
          <div className="p-6 space-y-4">
            {!resumo ? (
              <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>
            ) : (
              <>
                <div className="rounded-xl border border-gray-100 divide-y divide-gray-50">
                  {[
                    ['Abertura',           resumo.turno.valorAbertura],
                    ['Vendas em dinheiro', resumo.emDinheiro],
                    ['Suprimentos',        resumo.suprimentos],
                    ['Sangrias',           -resumo.sangrias],
                    ['Esperado na gaveta', resumo.esperadoGaveta],
                    ['Contado',            detalhe.valor_fechamento ?? 0],
                  ].map(([rot, val]: any) => (
                    <div key={rot} className="flex justify-between px-4 py-2 text-sm">
                      <span className="text-gray-500">{rot}</span>
                      <span className="text-gray-900">{fmt(Number(val ?? 0))}</span>
                    </div>
                  ))}
                </div>

                {resumo.formas.length > 0 && (
                  <div className="rounded-xl border border-gray-100 px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Por forma de pagamento</p>
                    {resumo.formas.map((f: any) => (
                      <div key={f.forma} className="flex justify-between text-sm py-0.5">
                        <span className="text-gray-500">{f.forma} · {f.vendas} venda(s)</span>
                        <span className="text-gray-900">{fmt(f.total)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {resumo.porCaixa?.length > 0 && (
                  <div className="rounded-xl border border-gray-100 px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Por caixa</p>
                    {resumo.porCaixa.map((c: any) => (
                      <div key={c.caixa} className="flex justify-between text-sm py-0.5">
                        <span className="text-gray-500">Caixa {c.caixa || '—'} · {c.vendas} venda(s)</span>
                        <span className="text-gray-900">{fmt(c.total)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {detalhe.observacao && (
                  <div>
                    <p className="text-[11px] text-gray-400">Observação do fechamento</p>
                    <p className="text-sm text-gray-700">{detalhe.observacao}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </SidePanel>
      )}
    </div>
  )
}
