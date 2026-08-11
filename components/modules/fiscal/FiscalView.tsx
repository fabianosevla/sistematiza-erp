'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Play, Square, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { InfoTip } from '@/components/ui/InfoTip'
import { Aviso } from '@/components/ui/Aviso'
import { PageHeader } from '@/components/ui/PageHeader'
import { FormModal } from '@/components/ui/FormModal'
import NovaNotaModal from './NovaNotaModal'
import PerfisTributariosTab from './PerfisTributariosTab'
import { fmtMoeda as fmt } from '@/lib/format'

interface Props { tenantSlug: string }

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pendente:   { label: 'Pendente',   color: 'secondary' },
  autorizada: { label: 'Autorizada', color: 'default' },
  cancelada:  { label: 'Cancelada',  color: 'destructive' },
  rejeitada:  { label: 'Rejeitada',  color: 'destructive' },
}

// Mesmo motivo dos demais arquivos do projeto: referencia de variavel
// para o elemento de ancora em vez da tag JSX literal.
const Anchor = 'a' as const

export default function FiscalView({ tenantSlug }: Props) {
  const qc = useQueryClient()
  const api = `/api/${tenantSlug}/fiscal`
  const [aba, setAba]                     = useState<'pdv' | 'nfe-saida' | 'relatorios' | 'parametros'>('pdv')
  const [filtroTipo, setFiltroTipo]       = useState('NFC-e')
  const [showNovaNota, setShowNovaNota]   = useState(false)
  const [showCancelar, setShowCancelar]   = useState<number | null>(null)
  const [motivoCancelamento, setMotivo]   = useState('')
  const [confirmFechar, setConfirmFechar] = useState<any>(null)

  const [showAbrirTurno, setShowAbrirTurno] = useState(false)
  const [operador, setOperador]             = useState('')
  const [valorAbertura, setValorAbertura]   = useState('0')

  const { data: turnoData } = useQuery({
    queryKey: ['turno', tenantSlug],
    queryFn:  async () => (await fetch(`${api}?turno=true`)).json(),
    refetchInterval: 30000,
  })

  const { data: notasData, isLoading } = useQuery({
    queryKey: ['notas', tenantSlug, filtroTipo],
    queryFn:  async () => (await fetch(`${api}?tipo=${filtroTipo}`)).json(),
  })

  const abrirTurnoMut = useMutation({
    mutationFn: () => fetch(`${api}?action=abrir-turno`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operador, numeroCaixa: 1, valorAbertura: Math.round(parseFloat(valorAbertura) * 100) }),
    }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['turno', tenantSlug] }); setShowAbrirTurno(false) },
  })

  const fecharTurnoMut = useMutation({
    mutationFn: (turnoId: number) => fetch(`${api}?action=fechar-turno`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnoId, valorFechamento: 0 }),
    }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turno', tenantSlug] }),
  })

  const emitirMut = useMutation({
    mutationFn: (notaId: number) => fetch(`${api}?action=emitir`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notaId }),
    }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notas', tenantSlug] }),
  })

  const cancelarMut = useMutation({
    mutationFn: (notaId: number) => fetch(`${api}?action=cancelar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notaId, motivo: motivoCancelamento }),
    }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notas', tenantSlug] }); setShowCancelar(null) },
  })

  const turno = turnoData?.data
  const notas = notasData?.data ?? []

  return (
    <div>
      <PageHeader titulo="Fiscal" />

      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {([
          // A aba "NF-e Entrada" saiu: ela só existia para dizer que a entrada
          // de nota de fornecedor fica em Estoque Avançado. Aba promete tela;
          // entregar aviso de mudança de endereço é dívida de navegação.
          { value: 'pdv',         label: 'NFC-e' },
          { value: 'nfe-saida',   label: 'NF-e Saída' },
          { value: 'relatorios',  label: 'Relatórios' },
          { value: 'parametros',  label: 'Parametrização' },
        ] as const).map(a => (
          <button key={a.value} onClick={() => setAba(a.value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${aba === a.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'pdv' && (
        <div className="space-y-4">
          {/* O CONTROLE DE CAIXA SAIU DAQUI.
              Ele vivia no módulo fiscal por acidente de história — a tabela
              t_turno_caixa nasceu no schema fiscal. Mas caixa é controle de
              dinheiro: quem nunca emitiu nota ainda precisa conferir a gaveta.
              Abrir, sangria e fechar ficam no PDV, com o operador. O histórico
              fica em Financeiro, com o gestor.

              O aviso que anunciava essa mudança também saiu: tela não é lugar
              de explicar ausência. Quem abre esta aba quer ver notas. */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">NFC-e — Nota Fiscal do Consumidor</h2>
              <Button size="sm" onClick={() => { setFiltroTipo('NFC-e'); setShowNovaNota(true) }}>
                <Plus size={14} className="mr-1.5" /> Nova NFC-e
              </Button>
            </div>
          </div>

          <NotasList notas={notas.filter((n: any) => n.tipo === 'NFC-e')} isLoading={isLoading}
            onEmitir={id => emitirMut.mutate(id)}
            onCancelar={id => { setShowCancelar(id); setMotivo('') }} />
        </div>
      )}

      {aba === 'nfe-saida' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold text-gray-700">Notas Fiscais de Saída (Modelo 55)</h2>
            <Button size="sm" onClick={() => { setFiltroTipo('NF-e'); setShowNovaNota(true) }}>
              <Plus size={14} className="mr-1.5" /> Nova NF-e
            </Button>
          </div>
          <NotasList notas={notas.filter((n: any) => n.tipo === 'NF-e')} isLoading={isLoading}
            onEmitir={id => emitirMut.mutate(id)}
            onCancelar={id => { setShowCancelar(id); setMotivo('') }} />
        </div>
      )}

      {aba === 'relatorios' && <RelatoriosFiscal tenantSlug={tenantSlug} />}

      {/* Parametrização fica por último na ordem das abas, mas é a primeira a
          ser usada numa implantação: sem ela, nenhuma das outras emite nada. */}
      {aba === 'parametros' && <PerfisTributariosTab tenantSlug={tenantSlug} />}

      {showAbrirTurno && (
        <FormModal titulo="Abrir Turno de Caixa" onClose={() => setShowAbrirTurno(false)} largura="max-w-sm">
          <div className="p-6 space-y-4">
            <div><Label>Operador *</Label><Input value={operador} onChange={e => setOperador(e.target.value)} className="mt-1" placeholder="Seu nome" autoFocus /></div>
            <div>
              <Label className="inline-flex items-center gap-1">
                Valor de abertura (R$)
                <InfoTip titulo="Valor de abertura">
                  Dinheiro em caixa no início do turno. Serve de referência na conferência do fechamento.
                </InfoTip>
              </Label>
              <Input type="number" min="0" step="0.01" value={valorAbertura} onChange={e => setValorAbertura(e.target.value)} className="mt-1" />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowAbrirTurno(false)}>Cancelar</Button>
              <Button onClick={() => abrirTurnoMut.mutate()} disabled={!operador || abrirTurnoMut.isPending}>Abrir turno</Button>
            </div>
          </div>
        </FormModal>
      )}

      {showCancelar && (
        <FormModal titulo="Cancelar Nota" onClose={() => setShowCancelar(null)} largura="max-w-sm">
          <div className="p-6 space-y-4">
            <div>
              <Label className="inline-flex items-center gap-1">
                Justificativa do cancelamento *
                <InfoTip titulo="Exigência da SEFAZ">
                  A justificativa vai junto com o pedido de cancelamento e precisa de
                  no mínimo 15 caracteres.
                </InfoTip>
              </Label>
              <textarea value={motivoCancelamento} onChange={e => setMotivo(e.target.value)} rows={3}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none"
                placeholder="Mínimo 15 caracteres..." />
              <p className="text-xs text-gray-400 mt-1">{motivoCancelamento.length} caracteres</p>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowCancelar(null)}>Voltar</Button>
              <Button variant="destructive" onClick={() => cancelarMut.mutate(showCancelar)}
                disabled={motivoCancelamento.length < 15 || cancelarMut.isPending}>
                Confirmar cancelamento
              </Button>
            </div>
          </div>
        </FormModal>
      )}

      {/* Antes era o confirm() do navegador */}
      {confirmFechar && (
        <ConfirmModal
          title="Fechar turno de caixa"
          message={`Fechar o turno do caixa #${confirmFechar.numeroCaixa} (${confirmFechar.operador})? Novas NFC-e só poderão ser emitidas após abrir outro turno.`}
          confirmLabel="Fechar turno"
          danger
          onConfirm={() => { fecharTurnoMut.mutate(confirmFechar.turnoId); setConfirmFechar(null) }}
          onCancel={() => setConfirmFechar(null)}
        />
      )}

      {showNovaNota && (
        <NovaNotaModal
          tenantSlug={tenantSlug}
          tipoInicial={filtroTipo === 'NF-e' ? 'NF-e' : 'NFC-e'}
          onClose={() => setShowNovaNota(false)}
        />
      )}
    </div>
  )
}

function NotasList({ notas, isLoading, onEmitir, onCancelar }: {
  notas: any[]; isLoading: boolean
  onEmitir: (id: number) => void; onCancelar: (id: number) => void
}) {
  if (isLoading) return <div className="text-center py-8 text-sm text-gray-400">Carregando...</div>
  if (notas.length === 0) return (
    <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
      <p className="text-sm text-gray-400">Nenhuma nota encontrada.</p>
    </div>
  )
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-3">Tipo</th>
            <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-3">Número</th>
            <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-3 hidden md:table-cell">Destinatário</th>
            <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-3">Status</th>
            <th className="text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-3">Total</th>
            <th className="px-4 py-3 w-32 bg-gray-50" />
          </tr>
        </thead>
        <tbody>
          {notas.map((n: any) => {
            const s = STATUS_MAP[n.status] ?? STATUS_MAP.pendente
            return (
              <tr key={n.notaId} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-4 py-3"><Badge variant="outline">{n.tipo}</Badge></td>
                <td className="px-4 py-3 text-sm font-mono text-gray-600">{n.numero ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{n.razaoSocial ?? 'Consumidor Final'}</td>
                <td className="px-4 py-3"><Badge variant={s.color as any}>{s.label}</Badge></td>
                <td className="px-4 py-3 text-right text-sm font-semibold">{fmt(n.valorTotal)}</td>
                <td className="px-4 py-3">
                  {/* Ações ficam sempre visíveis: são o caminho principal da tela */}
                  <div className="flex items-center justify-end gap-2">
                    {n.status === 'pendente' && (
                      <button onClick={() => onEmitir(n.notaId)} className="text-xs text-green-600 hover:text-green-700 font-medium">Emitir</button>
                    )}
                    {n.danfeUrl && (
                      <Anchor href={n.danfeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-600 hover:text-gray-700">DANFE</Anchor>
                    )}
                    {n.status === 'autorizada' && (
                      <button onClick={() => onCancelar(n.notaId)} className="text-xs text-red-500 hover:text-red-600">Cancelar</button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RelatoriosFiscal({ tenantSlug }: { tenantSlug: string }) {
  const api = `/api/${tenantSlug}/fiscal`
  const ano = new Date().getFullYear()

  const { data: resumoRaw, isLoading: loadingResumo } = useQuery({
    queryKey: ['fiscal-relatorio-resumo', tenantSlug, ano],
    queryFn:  async () => (await fetch(`${api}?relatorio=resumo-mensal&ano=${ano}`)).json(),
  })
  const { data: formaRaw, isLoading: loadingForma } = useQuery({
    queryKey: ['fiscal-relatorio-forma', tenantSlug],
    queryFn:  async () => (await fetch(`${api}?relatorio=por-forma`)).json(),
  })
  const { data: apuracaoRaw, isLoading: loadingApuracao } = useQuery({
    queryKey: ['fiscal-relatorio-apuracao', tenantSlug],
    queryFn:  async () => (await fetch(`${api}?relatorio=apuracao`)).json(),
  })

  const resumo   = Array.isArray(resumoRaw?.data) ? resumoRaw.data : []
  const porForma = Array.isArray(formaRaw?.data) ? formaRaw.data : []
  const apuracao = Array.isArray(apuracaoRaw?.data) ? apuracaoRaw.data : []

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-700">Resumo mensal de emissões — {ano}</p>
        </div>
        {loadingResumo ? (
          <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>
        ) : resumo.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nenhuma nota emitida em {ano} ainda.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Mês', 'Tipo', 'Autorizadas', 'Canceladas', 'Pendentes', 'Valor'].map((h, i) => (
                  <th key={h} className={`text-${i >= 2 ? 'right' : 'left'} text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-2.5`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resumo.map((r: any, i: number) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-900">{r.mes}</td>
                  <td className="px-4 py-2 text-sm text-gray-500">{r.tipo}</td>
                  <td className="px-4 py-2 text-right text-sm text-green-600 font-medium">{r.autorizadas}</td>
                  <td className="px-4 py-2 text-right text-sm text-red-500">{r.canceladas}</td>
                  <td className="px-4 py-2 text-right text-sm text-amber-500">{r.pendentes}</td>
                  <td className="px-4 py-2 text-right text-sm font-semibold">{fmt(r.valorTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100"><p className="text-sm font-semibold text-gray-700">Notas por forma de pagamento</p></div>
          {loadingForma ? (
            <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>
          ) : porForma.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sem dados ainda.</p>
          ) : porForma.map((f: any, i: number) => (
            <div key={i} className="flex justify-between px-4 py-2.5 border-b border-gray-50 last:border-0">
              <span className="text-sm text-gray-700">{f.forma} <span className="text-gray-400">({f.qtdNotas})</span></span>
              <span className="text-sm font-semibold">{fmt(f.total)}</span>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700 inline-flex items-center gap-1">
              Impostos lançados nas notas
              <InfoTip titulo="Como este número é formado">
                É a soma dos impostos já registrados em cada nota emitida.
                Não é cálculo automático de tributos nem substitui a apuração contábil.
              </InfoTip>
            </p>
          </div>
          {loadingApuracao ? (
            <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>
          ) : apuracao.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sem dados ainda.</p>
          ) : apuracao.map((a: any, i: number) => (
            <div key={i} className="px-4 py-2.5 border-b border-gray-50 last:border-0">
              <p className="text-sm font-medium text-gray-900 mb-1">{a.mes}</p>
              <div className="flex gap-4 text-xs text-gray-500">
                <span>ICMS: <b className="text-gray-700">{fmt(a.icms)}</b></span>
                <span>IPI: <b className="text-gray-700">{fmt(a.ipi)}</b></span>
                <span>ST: <b className="text-gray-700">{fmt(a.valorSt)}</b></span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}