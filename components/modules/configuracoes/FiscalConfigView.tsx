'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/Toast'
import { InfoTip } from '@/components/ui/InfoTip'

/**
 * components/modules/configuracoes/FiscalConfigView.tsx
 *
 * Uma das abas de Configurações (`ConfiguracoesView.tsx`). Chamado
 * "FiscalConfigView" para não colidir com components/modules/fiscal/ —
 * aquele é o módulo de emissão de NFC-e/NF-e, este é só a parametrização
 * (Tabela A do kit do contador). Mesmos campos, mesma mutation.
 */

interface Props { tenantSlug: string }

const CAMPOS = [
  'crt', 'cnae', 'serieNfce', 'serieNfe', 'focusNfeToken', 'focusNfeAmbiente', 'mensagemFiscal',
] as const

export default function FiscalConfigView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()

  const [empresa, setEmpresa] = useState<Record<string, string>>({})
  const [tocados, setTocados] = useState<Set<string>>(new Set())
  const pendente = tocados.size > 0

  const { data: configApiRaw } = useQuery({
    queryKey: ['configuracoes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/configuracoes`)).json(),
  })
  const configApi = configApiRaw?.data

  useEffect(() => {
    if (!configApi || pendente) return
    const carregado: Record<string, string> = {}
    for (const c of CAMPOS) carregado[c] = configApi[c] ?? ''
    carregado.credenciadoNfce = configApi.credenciadoNfce ? '1' : ''
    carregado.credenciadoNfe  = configApi.credenciadoNfe  ? '1' : ''
    setEmpresa(carregado)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configApi])

  const setEmp = (k: string, v: string) => {
    setTocados(prev => new Set(prev).add(k))
    setEmpresa(p => ({ ...p, [k]: v }))
  }

  const salvarMut = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {}
      for (const c of CAMPOS) body[c] = empresa[c]
      body.credenciadoNfce = empresa.credenciadoNfce === '1'
      body.credenciadoNfe  = empresa.credenciadoNfe  === '1'
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
      toast('Configurações fiscais salvas!')
    },
    onError: () => toast('Erro ao salvar as configurações fiscais.', 'error'),
  })

  return (
    <div>

      {!configApi?.fiscalAtivo ? (
        <div className="max-w-3xl bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <p className="text-sm text-gray-500">
            O módulo Fiscal (NFC-e) não está habilitado para esta empresa. Ative em{' '}
            <span className="font-medium text-gray-700">Configurações → Habilitações de módulos</span> para usar esta tela.
          </p>
        </div>
      ) : (
        <div className="max-w-3xl bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Regime</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="inline-flex items-center gap-1">
                    CRT
                    <InfoTip titulo="CRT">Código do regime: 1 Simples, 2 Simples com excesso, 3 Regime Normal.</InfoTip>
                  </Label>
                  <select value={empresa.crt ?? ''} onChange={e => setEmp('crt', e.target.value)}
                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white">
                    <option value="">— não informado —</option>
                    <option value="1">1 — Simples Nacional</option>
                    <option value="2">2 — Simples Nacional, excesso de sublimite</option>
                    <option value="3">3 — Regime Normal</option>
                  </select>
                </div>
                <div>
                  <Label>CNAE principal</Label>
                  <Input value={empresa.cnae ?? ''} onChange={e => setEmp('cnae', e.target.value)}
                    className="mt-1 h-9 text-sm" />
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Credenciamento na SEFAZ</p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={empresa.credenciadoNfce === '1'}
                    onChange={e => setEmp('credenciadoNfce', e.target.checked ? '1' : '')}
                    className="w-4 h-4 rounded" />
                  <span className="text-sm text-gray-700 inline-flex items-center gap-1">
                    Credenciada para NFC-e
                    <InfoTip titulo="Credenciamento">Autorização do estado para emitir. Sem ela a SEFAZ recusa.</InfoTip>
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={empresa.credenciadoNfe === '1'}
                    onChange={e => setEmp('credenciadoNfe', e.target.checked ? '1' : '')}
                    className="w-4 h-4 rounded" />
                  <span className="text-sm text-gray-700">Credenciada para NF-e</span>
                </label>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Séries</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Série NFC-e</Label>
                  <Input value={empresa.serieNfce ?? ''} onChange={e => setEmp('serieNfce', e.target.value)}
                    className="mt-1 h-9 text-sm" placeholder="1" />
                </div>
                <div>
                  <Label>Série NF-e</Label>
                  <Input value={empresa.serieNfe ?? ''} onChange={e => setEmp('serieNfe', e.target.value)}
                    className="mt-1 h-9 text-sm" placeholder="1" />
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Emissor</p>
              <div className="space-y-3">
                <div>
                  <Label className="inline-flex items-center gap-1">
                    Token do emissor
                    <InfoTip titulo="Token">Um por empresa, gerado no painel do emissor após cadastrar o CNPJ.</InfoTip>
                  </Label>
                  <Input type="password" value={empresa.focusNfeToken ?? ''}
                    onChange={e => setEmp('focusNfeToken', e.target.value)}
                    className="mt-1 h-9 text-sm" placeholder="••••••••" />
                </div>
                <div>
                  <Label className="inline-flex items-center gap-1">
                    Ambiente
                    <InfoTip titulo="Ambiente">Homologação emite nota de teste, sem valor fiscal.</InfoTip>
                  </Label>
                  <select value={empresa.focusNfeAmbiente ?? 'homologacao'}
                    onChange={e => setEmp('focusNfeAmbiente', e.target.value)}
                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white">
                    <option value="homologacao">Homologação — testes</option>
                    <option value="producao">Produção — nota válida</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <Label className="inline-flex items-center gap-1">
                Mensagem fiscal do rodapé
                <InfoTip titulo="Mensagem fiscal">No Simples Nacional o texto é exigido por lei na nota.</InfoTip>
              </Label>
              <Input value={empresa.mensagemFiscal ?? ''} onChange={e => setEmp('mensagemFiscal', e.target.value)}
                className="mt-1 h-9 text-sm"
                placeholder="Documento emitido por ME optante pelo Simples Nacional" />
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
