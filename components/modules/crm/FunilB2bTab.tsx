'use client'
// components/modules/crm/FunilB2bTab.tsx
//
// Pipeline de prospecção B2B (mercado/restaurante). Lista agrupada por
// estágio, não board com arrastar-e-soltar — o sistema não tem esse padrão
// em nenhuma outra tela, e pra um volume pequeno de lead uma lista já
// resolve sem introduzir uma interação nova.
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trophy, XCircle, Trash2, Pencil, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { FormModal } from '@/components/ui/FormModal'
import { useToast } from '@/components/ui/Toast'
import { fmtMoeda as fmt, fmtData } from '@/lib/format'
import LeadFormPanel from './LeadFormPanel'

interface Props { tenantSlug: string }

const ESTAGIOS = [
  { key: 'novo',        label: 'Novo' },
  { key: 'contatado',   label: 'Contatado' },
  { key: 'negociando',  label: 'Negociando' },
  { key: 'proposta',    label: 'Proposta' },
] as const

export default function FunilB2bTab({ tenantSlug }: Props) {
  const { toast } = useToast()
  const qc  = useQueryClient()
  const api = `/api/${tenantSlug}/crm/leads`

  const [painel, setPainel]         = useState<'novo' | any>(null)
  const [confirmGanho, setGanho]    = useState<any>(null)
  const [perdaLead, setPerdaLead]   = useState<any>(null)
  const [motivoPerda, setMotivo]    = useState('')
  const [confirmDel, setDel]        = useState<any>(null)
  const [mostrarFechados, setMostrarFechados] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['crm-leads', tenantSlug],
    queryFn:  async () => (await fetch(api)).json(),
  })
  const leads: any[] = data?.data ?? []
  const abertos  = leads.filter(l => l.estagio !== 'ganho' && l.estagio !== 'perdido')
  const fechados = leads.filter(l => l.estagio === 'ganho' || l.estagio === 'perdido')

  const inv = () => qc.invalidateQueries({ queryKey: ['crm-leads', tenantSlug] })

  const mudarEstagio = useMutation({
    mutationFn: async ({ leadId, estagio, motivoPerda }: any) => {
      const res = await fetch(`${api}/${leadId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estagio, ...(motivoPerda ? { motivoPerda } : {}) }),
      })
      if (!res.ok) throw new Error((await res.json())?.message ?? 'Erro ao atualizar')
    },
    onSuccess: () => { inv(); toast('Lead atualizado.') },
    onError: (e: any) => toast(e.message, 'error'),
  })

  const excluir = useMutation({
    mutationFn: async (leadId: number) => {
      const res = await fetch(`${api}/${leadId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json())?.message ?? 'Erro ao excluir')
    },
    onSuccess: () => { inv(); toast('Lead excluído.') },
    onError: (e: any) => toast(e.message, 'error'),
  })

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 size={20} className="text-gray-300 animate-spin" /></div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Prospecção de mercado/restaurante — não é venda de balcão.</p>
        <Button size="sm" onClick={() => setPainel('novo')}><Plus size={14} className="mr-1" /> Novo lead</Button>
      </div>

      {abertos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-400">Nenhum lead em aberto ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {ESTAGIOS.map(est => (
            <div key={est.key} className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
                {est.label} <span className="text-gray-400">({abertos.filter(l => l.estagio === est.key).length})</span>
              </p>
              <div className="space-y-2">
                {abertos.filter(l => l.estagio === est.key).map(l => (
                  <div key={l.leadId} className="bg-white rounded-lg border border-gray-100 p-3">
                    <p className="text-sm font-medium text-gray-900">{l.nomeEmpresa}</p>
                    {l.contatoNome && <p className="text-xs text-gray-500">{l.contatoNome}</p>}
                    {l.valorEstimadoCentavos > 0 && <p className="text-xs text-green-700 font-medium mt-1">{fmt(l.valorEstimadoCentavos)}</p>}
                    {l.proximaAcaoData && <p className="text-xs text-gray-400 mt-1">Próxima ação: {fmtData(l.proximaAcaoData)}</p>}
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-50">
                      <BotaoIcone titulo="Editar" onClick={() => setPainel(l)}><Pencil size={13} /></BotaoIcone>
                      <BotaoIcone titulo="Marcar como ganho" variante="sucesso" onClick={() => setGanho(l)}><Trophy size={13} /></BotaoIcone>
                      <BotaoIcone titulo="Marcar como perdido" variante="perigo" onClick={() => { setPerdaLead(l); setMotivo('') }}><XCircle size={13} /></BotaoIcone>
                      <BotaoIcone titulo="Excluir" variante="perigo" onClick={() => setDel(l)}><Trash2 size={13} /></BotaoIcone>
                    </div>
                    {/* Avançar de estágio: seletor simples, sem arrastar. */}
                    <select value={l.estagio} onChange={e => mudarEstagio.mutate({ leadId: l.leadId, estagio: e.target.value })}
                      className="mt-2 w-full h-7 rounded-md border border-gray-200 px-1.5 text-xs bg-white">
                      {ESTAGIOS.map(e2 => <option key={e2.key} value={e2.key}>{e2.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {fechados.length > 0 && (
        <div>
          <button onClick={() => setMostrarFechados(v => !v)} className="text-xs text-gray-500 hover:text-gray-700 font-medium">
            {mostrarFechados ? 'Ocultar' : 'Ver'} ganhos e perdidos ({fechados.length})
          </button>
          {mostrarFechados && (
            <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50 mt-2">
              {fechados.map(l => (
                <div key={l.leadId} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm text-gray-900">{l.nomeEmpresa}</p>
                    {l.motivoPerda && <p className="text-xs text-gray-400">{l.motivoPerda}</p>}
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${l.estagio === 'ganho' ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
                    {l.estagio === 'ganho' ? 'Ganho' : 'Perdido'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {painel && (
        <LeadFormPanel tenantSlug={tenantSlug} lead={painel === 'novo' ? null : painel} onClose={() => setPainel(null)} />
      )}

      {confirmGanho && (
        <ConfirmModal title="Marcar como ganho" message={`"${confirmGanho.nomeEmpresa}" virou cliente?`}
          confirmLabel="Sim, ganhamos"
          onConfirm={() => { mudarEstagio.mutate({ leadId: confirmGanho.leadId, estagio: 'ganho' }); setGanho(null) }}
          onCancel={() => setGanho(null)} />
      )}

      {perdaLead && (
        <FormModal titulo="Marcar como perdido" subtitulo={perdaLead.nomeEmpresa} onClose={() => setPerdaLead(null)} largura="max-w-sm">
          <div className="p-6 space-y-4">
            <div>
              <Label>Motivo (opcional)</Label>
              <Input value={motivoPerda} onChange={e => setMotivo(e.target.value)} className="mt-1" placeholder="Preço, prazo, já tem fornecedor..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPerdaLead(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => {
                mudarEstagio.mutate({ leadId: perdaLead.leadId, estagio: 'perdido', motivoPerda: motivoPerda.trim() || undefined })
                setPerdaLead(null)
              }}>Confirmar</Button>
            </div>
          </div>
        </FormModal>
      )}

      {confirmDel && (
        <ConfirmModal title="Excluir lead" message={`Excluir "${confirmDel.nomeEmpresa}" do funil?`}
          confirmLabel="Excluir" danger
          onConfirm={() => { excluir.mutate(confirmDel.leadId); setDel(null) }}
          onCancel={() => setDel(null)} />
      )}
    </div>
  )
}
