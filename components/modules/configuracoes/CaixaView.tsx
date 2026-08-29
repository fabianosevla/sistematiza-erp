'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/Toast'
import { InfoTip } from '@/components/ui/InfoTip'

/**
 * components/modules/configuracoes/CaixaView.tsx
 *
 * Uma das abas de Configurações (`ConfiguracoesView.tsx`). Mesmos campos,
 * mesma mutation, mesmo comportamento de sempre.
 */

interface Props { tenantSlug: string }

const CAMPOS = ['qtdCaixas', 'regimeTurno'] as const

export default function CaixaView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()

  const [valores, setValores]   = useState<Record<string, string>>({})
  const [tocados, setTocados]   = useState<Set<string>>(new Set())
  const pendente = tocados.size > 0

  const { data: configApiRaw } = useQuery({
    queryKey: ['configuracoes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/configuracoes`)).json(),
  })
  const configApi = configApiRaw?.data

  useEffect(() => {
    if (!configApi || pendente) return
    setValores({
      qtdCaixas:   String(configApi.qtdCaixas ?? 1),
      regimeTurno: String(configApi.regimeTurno ?? 'dia'),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configApi])

  const setV = (k: string, v: string) => {
    setTocados(prev => new Set(prev).add(k))
    setValores(p => ({ ...p, [k]: v }))
  }

  const salvarMut = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {
        qtdCaixas:   Math.max(1, Number(valores.qtdCaixas ?? 1) || 1),
        regimeTurno: valores.regimeTurno,
      }
      const res = await fetch(`/api/${tenantSlug}/configuracoes`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao salvar')
      return d
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['configuracoes', tenantSlug] })
      setTocados(new Set())
      toast('Caixa salvo!')
    },
    onError: () => toast('Erro ao salvar o caixa.', 'error'),
  })

  return (
    <div>

      {!configApi?.turnoCaixaAtivo ? (
        <div className="max-w-3xl bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <p className="text-sm text-gray-500">
            O controle de turno de caixa não está habilitado para esta empresa. Ative em{' '}
            <span className="font-medium text-gray-700">Configurações → Habilitações de módulos</span> para usar esta tela.
          </p>
        </div>
      ) : (
        <div className="max-w-3xl bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="inline-flex items-center gap-1">
                Computadores vendendo
                <InfoTip titulo="Quantos caixas">Com mais de um, cada máquina informa seu número uma vez.</InfoTip>
              </Label>
              <Input type="number" min="1" value={valores.qtdCaixas ?? '1'}
                onChange={e => setV('qtdCaixas', e.target.value)}
                className="sem-spinner mt-1 h-9 text-sm" />
            </div>
            <div>
              <Label className="inline-flex items-center gap-1">
                Um turno por
                <InfoTip titulo="Regime do turno">Por dia, a loja fecha um caixa só; por operador, cada um fecha o seu.</InfoTip>
              </Label>
              <select value={valores.regimeTurno ?? 'dia'}
                onChange={e => setV('regimeTurno', e.target.value)}
                className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white">
                <option value="dia">Dia — um turno para a loja</option>
                <option value="operador">Operador — um turno por caixa</option>
              </select>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-gray-50">
            <Button size="sm" onClick={() => salvarMut.mutate()} disabled={!pendente || salvarMut.isPending}>
              {salvarMut.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
