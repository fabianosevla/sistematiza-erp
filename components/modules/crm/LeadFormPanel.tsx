'use client'
// components/modules/crm/LeadFormPanel.tsx — drawer de criar/editar lead do funil B2B
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SidePanel } from '@/components/ui/SidePanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/Toast'
import { parseMoeda, fmtMoedaInput } from '@/lib/format'

interface Props { tenantSlug: string; lead: any | null; onClose: () => void }

export default function LeadFormPanel({ tenantSlug, lead, onClose }: Props) {
  const { toast } = useToast()
  const qc  = useQueryClient()
  const api = `/api/${tenantSlug}/crm/leads`

  const [form, setForm] = useState({
    nomeEmpresa: lead?.nomeEmpresa ?? '',
    contatoNome: lead?.contatoNome ?? '',
    telefone:    lead?.telefone ?? '',
    email:       lead?.email ?? '',
    valorEstimado: fmtMoedaInput(lead?.valorEstimadoCentavos ?? 0),
    responsavel: lead?.responsavel ?? '',
    proximaAcaoData: lead?.proximaAcaoData ? String(lead.proximaAcaoData).slice(0, 10) : '',
    observacao:  lead?.observacao ?? '',
  })
  const setF = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const salvar = useMutation({
    mutationFn: async () => {
      const payload = {
        nomeEmpresa: form.nomeEmpresa.trim(),
        contatoNome: form.contatoNome.trim() || undefined,
        telefone:    form.telefone.trim() || undefined,
        email:       form.email.trim() || undefined,
        valorEstimadoCentavos: parseMoeda(form.valorEstimado),
        responsavel: form.responsavel.trim() || undefined,
        proximaAcaoData: form.proximaAcaoData || null,
        observacao:  form.observacao.trim() || undefined,
      }
      const url    = lead ? `${api}/${lead.leadId}` : api
      const method = lead ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao salvar')
      return d
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-leads', tenantSlug] })
      toast(lead ? 'Oportunidade atualizada.' : 'Oportunidade criada.')
      onClose()
    },
    onError: (e: any) => toast(e?.message ?? 'Erro ao salvar', 'error'),
  })

  return (
    <SidePanel titulo={lead ? 'Editar oportunidade' : 'Nova oportunidade'} subtitulo={lead ? lead.nomeEmpresa : 'Prospecção B2B'} onClose={onClose}
      rodape={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={!form.nomeEmpresa.trim() || salvar.isPending}>
            {salvar.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </>
      }>
      <div className="p-6 space-y-4">
        <div>
          <Label>Empresa (mercado/restaurante) *</Label>
          <Input value={form.nomeEmpresa} onChange={e => setF('nomeEmpresa', e.target.value)} className="mt-1" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Contato</Label><Input value={form.contatoNome} onChange={e => setF('contatoNome', e.target.value)} className="mt-1" /></div>
          <div><Label>Telefone</Label><Input value={form.telefone} onChange={e => setF('telefone', e.target.value)} className="mt-1" /></div>
        </div>
        <div>
          <Label>E-mail</Label>
          <Input value={form.email} onChange={e => setF('email', e.target.value)} className="mt-1" type="email" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Valor estimado (R$)</Label>
            <Input value={form.valorEstimado} onChange={e => setF('valorEstimado', e.target.value)} className="sem-spinner mt-1" inputMode="decimal" />
          </div>
          <div>
            <Label>Próxima ação em</Label>
            <Input type="date" value={form.proximaAcaoData} onChange={e => setF('proximaAcaoData', e.target.value)} className="mt-1" />
          </div>
        </div>
        <div>
          <Label>Responsável</Label>
          <Input value={form.responsavel} onChange={e => setF('responsavel', e.target.value)} className="mt-1" placeholder="Quem está tocando essa oportunidade" />
        </div>
        <div>
          <Label>Observação</Label>
          <textarea value={form.observacao} onChange={e => setF('observacao', e.target.value)} rows={4}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
        </div>
      </div>
    </SidePanel>
  )
}
