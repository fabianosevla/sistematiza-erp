'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/Toast'
import { InfoTip } from '@/components/ui/InfoTip'
import { PageHeader } from '@/components/ui/PageHeader'

/**
 * components/modules/configuracoes/HabilitacoesModulosView.tsx
 *
 * Era a seção "Habilitações de módulos" do acordeão único de Configurações;
 * virou página própria (/[tenant]/configuracoes/modulos). Mesma lista,
 * mesma mutation, mesmo reload após salvar (o menu lateral é montado no
 * servidor pelo tenant-layout, então só reflete as chaves novas depois de
 * recarregar).
 *
 * REGRA: todo item que aparece no menu lateral tem que estar nesta lista.
 * Ao acrescentar um menu no Sidebar, acrescente a chave aqui também — senão
 * o cliente não consegue desligá-lo.
 */

interface Props { tenantSlug: string }

const MODULOS = [
  { key: 'vendasAtivo',     label: 'Vendas',            group: 'Menus principais' },
  { key: 'financeiroAtivo', label: 'Financeiro',        group: 'Menus principais' },

  { key: 'producaoAtivo',  label: 'Produção',          group: 'Operacional' },
  { key: 'estoqueAtivo',   label: 'Estoque',           group: 'Operacional' },
  { key: 'comprasAtivo',   label: 'Compras',           group: 'Operacional' },
  { key: 'pedidosAtivo',   label: 'Pedidos',           group: 'Operacional' },

  { key: 'consultasAtivo', label: 'Consultas',         group: 'Gerencial'   },
  { key: 'metasAtivo',     label: 'Metas & Simulador', group: 'Gerencial'   },
  { key: 'fidelidadeAtivo',label: 'Fidelidade',        group: 'Gerencial'   },
  { key: 'planoAcaoAtivo', label: 'Plano de Ação',     group: 'Gerencial'   },
  { key: 'fiscalAtivo',    label: 'Fiscal (NFC-e)',    group: 'Gerencial'   },
  { key: 'turnoCaixaAtivo', label: 'Turno de caixa no PDV', group: 'Operacional' },
] as const

export default function HabilitacoesModulosView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const [modulosLocal, setModulosLocal] = useState<Record<string, boolean>>({})

  const { data: configApiRaw } = useQuery({
    queryKey: ['configuracoes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/configuracoes`)).json(),
  })
  const configApi = configApiRaw?.data

  function getToggleValue(key: string): boolean {
    if (key in modulosLocal) return modulosLocal[key]
    if (configApi && configApi[key] !== undefined) return !!configApi[key]
    return false
  }
  function valorSalvo(key: string): boolean {
    if (configApi && configApi[key] !== undefined) return !!configApi[key]
    return false
  }
  function handleToggle(key: string) {
    const novoValor = !getToggleValue(key)
    setModulosLocal(prev => {
      const proximo = { ...prev }
      if (novoValor === valorSalvo(key)) delete proximo[key]
      else proximo[key] = novoValor
      return proximo
    })
  }

  const salvarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/${tenantSlug}/configuracoes`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(modulosLocal),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao salvar')
      return d
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['configuracoes', tenantSlug] })
      toast('Módulos salvos!')
      if (typeof window !== 'undefined') setTimeout(() => window.location.reload(), 500)
    },
    onError: () => toast('Erro ao salvar os módulos.', 'error'),
  })

  const modulosPendentes = Object.keys(modulosLocal).length
  const grupos = [...new Set(MODULOS.map(m => m.group))]

  return (
    <div>
      <PageHeader titulo="Habilitações de módulos" />
      <div className="max-w-3xl bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <InfoTip className="mb-3 block">
          Define o que aparece no menu lateral. As mudanças só valem depois de salvar.
        </InfoTip>
        <div className="space-y-6">
          {grupos.map(grupo => (
            <div key={grupo}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{grupo}</p>
              <div className="space-y-2">
                {MODULOS.filter(m => m.group === grupo).map(modulo => {
                  const ativo    = getToggleValue(modulo.key)
                  const alterado = modulo.key in modulosLocal
                  return (
                    <div key={modulo.key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-700">
                        {modulo.label}
                        {alterado && <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 align-middle" />}
                      </span>
                      <button
                        onClick={() => handleToggle(modulo.key)}
                        className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${ativo ? 'bg-green-500' : 'bg-gray-200'}`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${ativo ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-gray-50">
          <Button variant="outline" size="sm"
            onClick={() => setModulosLocal({})}
            disabled={modulosPendentes === 0 || salvarMut.isPending}>
            Desfazer
          </Button>
          <Button size="sm"
            onClick={() => salvarMut.mutate()}
            disabled={modulosPendentes === 0 || salvarMut.isPending}>
            {salvarMut.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
