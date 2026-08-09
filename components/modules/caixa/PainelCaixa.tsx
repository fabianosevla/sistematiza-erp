'use client'
// ESTE ARQUIVO VAI EM: components/modules/caixa/PainelCaixa.tsx
//
// CONTROLE DE CAIXA — abrir, sangrar, suprir e fechar.
//
// Vive onde o operador está: dentro do PDV. Quem abre e fecha o caixa é quem
// vende, e o perfil Vendedor não tem acesso ao gerencial — jogar isto para
// Financeiro trancaria o operador para fora do próprio turno.
//
// O gestor vê o histórico em Financeiro. Operação aqui, leitura lá.
//
// ─── O NÚMERO DO CAIXA É DA MÁQUINA, NÃO DA CONTA ───────────────────────────
//
// Dois navegadores na mesma rede são idênticos para o servidor: não há como
// deduzir qual PC é qual. Por isso o número é perguntado uma vez e guardado
// naquele computador — mesma ideia do atalho do PDV.
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Square, ArrowDownToLine, ArrowUpFromLine, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InfoTip } from '@/components/ui/InfoTip'
import { SidePanel } from '@/components/ui/SidePanel'
import { useToast } from '@/components/ui/Toast'
import { fmtMoeda as fmt } from '@/lib/format'

interface Props {
  tenantSlug: string
  /** Nome de quem está no balcão, para gravar no turno. */
  operador?: string
  /** Quantos PCs vendem. Com 1, o número do caixa não é perguntado. */
  qtdCaixas?: number
  compacto?: boolean
}

const CHAVE_CAIXA = 'sistematiza.numeroCaixa'

/**
 * Número do caixa desta máquina. Vive no navegador, não na conta.
 *
 * Com um caixa só — que é o padrão — não há o que perguntar: é o caixa 1, e
 * a tela nem mostra o campo. Perguntar numa loja de balcão único seria
 * cerimônia sem função, e mais uma coisa para o operador errar.
 */
export function useNumeroCaixa(qtdCaixas = 1) {
  const [numero, setNumero] = useState<number | null>(null)
  useEffect(() => {
    if (qtdCaixas <= 1) { setNumero(1); return }
    const guardado = window.localStorage.getItem(CHAVE_CAIXA)
    setNumero(guardado ? Number(guardado) : null)
  }, [qtdCaixas])
  const gravar = (n: number) => {
    window.localStorage.setItem(CHAVE_CAIXA, String(n))
    setNumero(n)
  }
  return { numero, gravar }
}

const cent = (v: string) => Math.round((parseFloat(String(v).replace(',', '.')) || 0) * 100)

export default function PainelCaixa({ tenantSlug, operador = '', qtdCaixas = 1, compacto }: Props) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const api = `/api/${tenantSlug}/caixa`
  const { numero: numeroCaixa, gravar: gravarNumero } = useNumeroCaixa(qtdCaixas)

  const [painel, setPainel]   = useState<null | 'abrir' | 'mov' | 'fechar' | 'maquina'>(null)
  const [form, setForm]       = useState({ operador, valorAbertura: '0', valor: '', motivo: '', conferido: '', obs: '', tipo: 'sangria' as 'sangria' | 'suprimento', numero: '1' })
  const setF = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const { data: raw } = useQuery({
    queryKey: ['caixa', tenantSlug, numeroCaixa],
    queryFn:  async () => (await fetch(`${api}?numeroCaixa=${numeroCaixa ?? ''}`)).json(),
    refetchInterval: 60000,
  })
  const turno = raw?.data?.meu ?? null

  const { data: resumoRaw } = useQuery({
    queryKey: ['caixa-resumo', tenantSlug, turno?.turnoId],
    queryFn:  async () => (await fetch(`${api}?turnoId=${turno.turnoId}`)).json(),
    enabled:  !!turno,
  })
  const resumo = resumoRaw?.data

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['caixa', tenantSlug] })
    qc.invalidateQueries({ queryKey: ['caixa-resumo', tenantSlug] })
  }

  function chamar(acao: string, body: any) {
    return async () => {
      const res = await fetch(`${api}?acao=${acao}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro')
      return d
    }
  }

  const abrirMut = useMutation({
    mutationFn: () => chamar('abrir', {
      operador: form.operador.trim() || operador || 'Operador',
      numeroCaixa: numeroCaixa ?? 1,
      valorAbertura: cent(form.valorAbertura),
    })(),
    onSuccess: () => { inv(); setPainel(null); toast('Caixa aberto.') },
    onError: (e: any) => toast(e?.message ?? 'Erro ao abrir o caixa', 'error'),
  })

  const movMut = useMutation({
    mutationFn: () => chamar('movimentar', {
      turnoId: turno?.turnoId, tipo: form.tipo,
      valor: cent(form.valor), motivo: form.motivo,
    })(),
    onSuccess: () => {
      inv(); setPainel(null); setF('valor', ''); setF('motivo', '')
      toast(form.tipo === 'sangria' ? 'Sangria registrada.' : 'Suprimento registrado.')
    },
    onError: (e: any) => toast(e?.message ?? 'Erro ao registrar', 'error'),
  })

  const fecharMut = useMutation({
    mutationFn: () => chamar('fechar', {
      turnoId: turno?.turnoId,
      valorFechamento: cent(form.conferido),
      observacao: form.obs,
    })(),
    onSuccess: (d: any) => {
      inv(); setPainel(null)
      const dif = d?.data?.diferenca ?? 0
      toast(dif === 0 ? 'Caixa fechado. Sem diferença.'
        : `Caixa fechado. ${dif > 0 ? 'Sobra' : 'Falta'} de ${fmt(Math.abs(dif))}.`,
        dif === 0 ? 'success' : 'warning')
    },
    onError: (e: any) => toast(e?.message ?? 'Erro ao fechar o caixa', 'error'),
  })

  // Máquina ainda sem número: primeira coisa a resolver.
  if (numeroCaixa === null) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center justify-between gap-3">
        <span className="text-sm text-gray-600 inline-flex items-center gap-1.5">
          <Monitor size={15} className="text-gray-400" />
          Este computador ainda não tem número de caixa
          <InfoTip titulo="Número do caixa">Fica guardado neste computador e identifica de onde saiu cada venda.</InfoTip>
        </span>
        <div className="flex items-center gap-2">
          <Input type="number" min="1" value={form.numero}
            onChange={e => setF('numero', e.target.value)}
            className="sem-spinner h-8 w-20 text-sm" />
          <Button size="sm" onClick={() => gravarNumero(Number(form.numero) || 1)}>Definir</Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {qtdCaixas > 1 ? `Caixa ${numeroCaixa}` : 'Caixa'}
            {turno
              ? <span className="text-green-700"> — aberto por {turno.operador}</span>
              : <span className="text-gray-400"> — fechado</span>}
          </p>
          {turno && resumo && !compacto && (
            <p className="text-xs text-gray-500 mt-0.5">
              Vendido {fmt(resumo.totalVendido)} · dinheiro {fmt(resumo.emDinheiro)} · esperado na gaveta {fmt(resumo.esperadoGaveta)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {!turno ? (
            <Button size="sm" onClick={() => { setF('operador', operador); setPainel('abrir') }}>
              <Play size={14} className="mr-1.5" /> Abrir caixa
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => { setF('tipo', 'sangria'); setPainel('mov') }}>
                <ArrowUpFromLine size={14} className="mr-1.5" /> Sangria
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setF('tipo', 'suprimento'); setPainel('mov') }}>
                <ArrowDownToLine size={14} className="mr-1.5" /> Suprimento
              </Button>
              <Button variant="destructive" size="sm" onClick={() => { setF('conferido', ''); setPainel('fechar') }}>
                <Square size={14} className="mr-1.5" /> Fechar
              </Button>
            </>
          )}
        </div>
      </div>

      {painel === 'abrir' && (
        <SidePanel titulo={qtdCaixas > 1 ? `Abrir caixa ${numeroCaixa}` : 'Abrir caixa'} largura="w-[26vw] min-w-[420px]"
          onClose={() => setPainel(null)}
          rodape={
            <>
              <Button variant="outline" onClick={() => setPainel(null)}>Fechar</Button>
              <Button onClick={() => abrirMut.mutate()} disabled={abrirMut.isPending}>
                {abrirMut.isPending ? 'Abrindo...' : 'Abrir'}
              </Button>
            </>
          }>
          <div className="p-6 space-y-4">
            <div>
              <Label>Operador</Label>
              <Input value={form.operador} onChange={e => setF('operador', e.target.value)} className="mt-1" autoFocus />
            </div>
            <div>
              <Label className="inline-flex items-center gap-1">
                Valor de abertura (R$)
                <InfoTip titulo="Valor de abertura">O troco que já está na gaveta antes da primeira venda.</InfoTip>
              </Label>
              <Input type="number" step="0.01" inputMode="decimal" value={form.valorAbertura}
                onChange={e => setF('valorAbertura', e.target.value)} className="sem-spinner mt-1" />
            </div>
          </div>
        </SidePanel>
      )}

      {painel === 'mov' && (
        <SidePanel titulo={form.tipo === 'sangria' ? 'Sangria' : 'Suprimento'}
          largura="w-[26vw] min-w-[420px]" onClose={() => setPainel(null)}
          rodape={
            <>
              <Button variant="outline" onClick={() => setPainel(null)}>Fechar</Button>
              <Button onClick={() => movMut.mutate()} disabled={!form.valor || movMut.isPending}>
                {movMut.isPending ? 'Registrando...' : 'Registrar'}
              </Button>
            </>
          }>
          <div className="p-6 space-y-4">
            <div>
              <Label className="inline-flex items-center gap-1">
                Valor (R$)
                <InfoTip titulo={form.tipo === 'sangria' ? 'Sangria' : 'Suprimento'}>
                  {form.tipo === 'sangria'
                    ? 'Dinheiro que sai da gaveta para o cofre ou o banco.'
                    : 'Dinheiro que entra na gaveta, normalmente troco.'}
                </InfoTip>
              </Label>
              <Input type="number" step="0.01" inputMode="decimal" value={form.valor}
                onChange={e => setF('valor', e.target.value)} className="sem-spinner mt-1" autoFocus />
            </div>
            <div>
              <Label>Motivo</Label>
              <Input value={form.motivo} onChange={e => setF('motivo', e.target.value)} className="mt-1" />
            </div>
          </div>
        </SidePanel>
      )}

      {painel === 'fechar' && resumo && (
        <SidePanel titulo={qtdCaixas > 1 ? `Fechar caixa ${numeroCaixa}` : 'Fechar caixa'} largura="w-[30vw] min-w-[480px]"
          onClose={() => setPainel(null)}
          rodape={
            <>
              <Button variant="outline" onClick={() => setPainel(null)}>Fechar</Button>
              <Button variant="destructive" onClick={() => fecharMut.mutate()}
                disabled={form.conferido === '' || fecharMut.isPending}>
                {fecharMut.isPending ? 'Fechando...' : 'Confirmar fechamento'}
              </Button>
            </>
          }>
          <div className="p-6 space-y-4">
            <div className="rounded-xl border border-gray-100 divide-y divide-gray-50">
              {[
                ['Abertura',        resumo.turno.valorAbertura],
                ['Vendas em dinheiro', resumo.emDinheiro],
                ['Suprimentos',     resumo.suprimentos],
                ['Sangrias',        -resumo.sangrias],
              ].map(([rot, val]: any) => (
                <div key={rot} className="flex justify-between px-4 py-2 text-sm">
                  <span className="text-gray-500">{rot}</span>
                  <span className="text-gray-900">{fmt(val)}</span>
                </div>
              ))}
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-sm font-semibold text-gray-900">Esperado na gaveta</span>
                <span className="text-base font-semibold text-gray-900">{fmt(resumo.esperadoGaveta)}</span>
              </div>
            </div>

            <div>
              <Label className="inline-flex items-center gap-1">
                Contado na gaveta (R$)
                <InfoTip titulo="Conferência">Conte o dinheiro antes de digitar — a diferença é calculada sozinha.</InfoTip>
              </Label>
              <Input type="number" step="0.01" inputMode="decimal" value={form.conferido}
                onChange={e => setF('conferido', e.target.value)} className="sem-spinner mt-1" autoFocus />
            </div>

            {form.conferido !== '' && (
              <div className={`rounded-xl px-4 py-3 text-sm ${
                cent(form.conferido) - resumo.esperadoGaveta === 0
                  ? 'bg-green-50 text-green-800'
                  : 'bg-amber-50 text-amber-800'
              }`}>
                {(() => {
                  const dif = cent(form.conferido) - resumo.esperadoGaveta
                  if (dif === 0) return 'Confere.'
                  return `${dif > 0 ? 'Sobra' : 'Falta'} de ${fmt(Math.abs(dif))}.`
                })()}
              </div>
            )}

            {resumo.porCaixa?.length > 1 && (
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

            <div>
              <Label>Observação</Label>
              <Input value={form.obs} onChange={e => setF('obs', e.target.value)} className="mt-1" />
            </div>
          </div>
        </SidePanel>
      )}
    </>
  )
}
