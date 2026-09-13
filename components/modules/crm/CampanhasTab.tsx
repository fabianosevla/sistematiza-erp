'use client'
// components/modules/crm/CampanhasTab.tsx
//
// Campanha em massa por WhatsApp — mesmo mecanismo da Reativação (aba
// Fidelidade), reaproveitado pra qualquer público. Sem credencial da Meta
// configurada, fica pronta mas não dispara (mesmo estado de hoje na
// Reativação) — não finge que funciona.
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { InfoTip } from '@/components/ui/InfoTip'
import { useToast } from '@/components/ui/Toast'
import { fmtDataHoraLocal as fmtDataHora } from '@/lib/format'

interface Props { tenantSlug: string }

// Mesmos baldes de SegmentacaoTab.tsx — repetido aqui de propósito: importar
// a classe de serviço (lib/services/crm/SegmentacaoService.ts) num componente
// client arrastaria o `pg`/Drizzle pro bundle do navegador.
const BALDE_LABEL: Record<string, string> = {
  ativo: 'Ativo', em_risco: 'Em risco', sumindo: 'Sumindo', inativo: 'Inativo',
}
const BALDES_ENVIAVEIS = ['ativo', 'em_risco', 'sumindo', 'inativo'] as const

export default function CampanhasTab({ tenantSlug }: Props) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const api = `/api/${tenantSlug}/crm/campanhas`

  const [nome, setNome]         = useState('')
  const [mensagem, setMensagem] = useState('')
  const [balde, setBalde]       = useState('')

  const { data: statusData } = useQuery({
    queryKey: ['crm-campanhas-status', tenantSlug],
    queryFn:  async () => (await fetch(api)).json(),
  })
  const pronto  = statusData?.data?.pronto ?? false
  const envios: any[] = statusData?.data?.ultimosEnvios ?? []

  const { data: segData } = useQuery({
    queryKey: ['crm-segmentacao', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/crm/segmentacao`)).json(),
  })
  const linhas: any[] = segData?.data?.linhas ?? []
  const clienteIds = balde ? linhas.filter(l => l.balde === balde).map(l => l.clienteId) : []

  const enviarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campanhaNome: nome.trim(), mensagem: mensagem.trim(), clienteIds }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao enviar')
      return d
    },
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ['crm-campanhas-status', tenantSlug] })
      toast(`Campanha enviada: ${d.data.enviados} de ${d.data.total} — ${d.data.erros} erro(s).`)
      setNome(''); setMensagem(''); setBalde('')
    },
    onError: (e: any) => toast(e.message, 'error'),
  })

  const podeEnviar = pronto && nome.trim().length >= 2 && mensagem.trim().length >= 2 && clienteIds.length > 0 && !enviarMut.isPending

  return (
    <div className="space-y-5">
      {!pronto && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            WhatsApp ainda não está configurado — a campanha fica pronta, mas não dispara.
            Configure em Fidelidade → Configuração → WhatsApp (Meta Cloud API).
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 max-w-xl">
        <div>
          <Label>Nome da campanha</Label>
          <Input value={nome} onChange={e => setNome(e.target.value)} className="mt-1" placeholder="Ex.: Promoção de setembro" />
        </div>
        <div>
          <Label className="inline-flex items-center gap-1">
            Público
            <InfoTip titulo="De onde vem a lista">Reaproveita os baldes da aba Segmentação.</InfoTip>
          </Label>
          <select value={balde} onChange={e => setBalde(e.target.value)}
            className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
            <option value="">Selecionar...</option>
            {BALDES_ENVIAVEIS.map(b => (
              <option key={b} value={b}>{BALDE_LABEL[b]} ({linhas.filter(l => l.balde === b).length})</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Mensagem</Label>
          <textarea value={mensagem} onChange={e => setMensagem(e.target.value)} rows={4} maxLength={1000}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
        </div>
        <Button onClick={() => enviarMut.mutate()} disabled={!podeEnviar}>
          {enviarMut.isPending
            ? <><Loader2 size={14} className="mr-1.5 animate-spin" /> Enviando...</>
            : <><Send size={14} className="mr-1.5" /> Enviar pra {clienteIds.length} cliente(s)</>}
        </Button>
      </div>

      {envios.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Últimos envios</p>
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
            {envios.map(e => (
              <div key={e.envioId} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-sm text-gray-900">{e.clienteNome ?? 'Cliente'} — <span className="text-gray-500">{e.campanhaNome}</span></p>
                  <p className="text-xs text-gray-400">{e.enviadoEm ? fmtDataHora(e.enviadoEm) : '—'}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${e.status === 'enviado' ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
                  {e.status === 'enviado' ? 'Enviado' : 'Erro'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
