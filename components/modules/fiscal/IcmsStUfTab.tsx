'use client'
// components/modules/fiscal/IcmsStUfTab.tsx
//
// MVA e alíquota de ICMS-ST variam por ESTADO de destino (protocolo/convênio
// é estadual, muda por portaria). O perfil tributário tem um valor único —
// aqui cadastra a exceção por estado; sem linha aqui, a emissão usa o valor
// padrão do perfil, que é o comportamento de sempre.
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InfoTip } from '@/components/ui/InfoTip'
import { SidePanel } from '@/components/ui/SidePanel'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { useToast } from '@/components/ui/Toast'

interface Props { tenantSlug: string }

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

const VAZIO = { perfilTribId: '', ufDestino: '', mva: '0', aliqIcmsSt: '0', fonte: '', observacao: '' }

export default function IcmsStUfTab({ tenantSlug }: Props) {
  const { toast } = useToast()
  const qc  = useQueryClient()
  const api = `/api/${tenantSlug}/fiscal/icms-st-uf`

  const [painel, setPainel]  = useState(false)
  const [editando, setEdit]  = useState<any | null>(null)
  const [form, setForm]      = useState({ ...VAZIO })
  const [confirmDel, setDel] = useState<any | null>(null)
  const setF = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const { data: perfisRaw } = useQuery({
    queryKey: ['perfis-tributarios', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/fiscal/perfis`)).json(),
  })
  const perfis: any[] = perfisRaw?.data?.perfis ?? []
  const perfisComSt = perfis.filter((p: any) => p.temSt)
  const nomePerfil = (id: number) => perfis.find((p: any) => p.perfilTribId === id)?.nome ?? `#${id}`

  const { data, isLoading } = useQuery({
    queryKey: ['icms-st-uf', tenantSlug],
    queryFn:  async () => (await fetch(api)).json(),
  })
  const linhas: any[] = data?.data?.linhas ?? []

  const inv = () => qc.invalidateQueries({ queryKey: ['icms-st-uf', tenantSlug] })

  const salvar = useMutation({
    mutationFn: async () => {
      const url    = editando ? `${api}/${editando.icmsStUfId}` : api
      const method = editando ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao salvar')
      return d
    },
    onSuccess: () => { inv(); setPainel(false); toast('Valor salvo.') },
    onError: (e: any) => toast(e?.message ?? 'Erro ao salvar', 'error'),
  })

  const excluir = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${api}/${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao excluir')
      return d
    },
    onSuccess: () => { inv(); toast('Excluído.') },
    onError: (e: any) => toast(e?.message ?? 'Erro ao excluir', 'error'),
  })

  function abrirNovo() { setEdit(null); setForm({ ...VAZIO }); setPainel(true) }
  function abrirEditar(l: any) {
    setEdit(l)
    setForm({
      perfilTribId: String(l.perfilTribId), ufDestino: l.ufDestino,
      mva: String(l.mva), aliqIcmsSt: String(l.aliqIcmsSt),
      fonte: l.fonte ?? '', observacao: l.observacao ?? '',
    })
    setPainel(true)
  }

  const colunas: Coluna[] = [
    { chave: 'perfilTribId', titulo: 'Perfil', render: (l: any) => (
      <span className="text-sm font-medium text-gray-900">{nomePerfil(l.perfilTribId)}</span>
    )},
    { chave: 'ufDestino', titulo: 'Estado', render: (l: any) => (
      <span className="text-sm font-mono text-gray-900">{l.ufDestino}</span>
    )},
    { chave: 'mva', titulo: 'MVA', alinhamento: 'right', render: (l: any) => (
      <span className="text-sm text-gray-600">{l.mva}%</span>
    )},
    { chave: 'aliqIcmsSt', titulo: 'Alíquota ICMS-ST', alinhamento: 'right', render: (l: any) => (
      <span className="text-sm text-gray-600">{l.aliqIcmsSt}%</span>
    )},
    { chave: 'fonte', titulo: 'Fonte', esconderAte: 'lg', render: (l: any) => (
      <span className="text-xs text-gray-400 truncate block max-w-xs">{l.fonte || '—'}</span>
    )},
  ]

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 inline-flex items-center gap-1">
        Sem linha cadastrada pro estado, a emissão usa o MVA/alíquota padrão do perfil tributário.
        <InfoTip titulo="Por que por estado">
          MVA e alíquota de substituição tributária vêm de protocolo/convênio estadual — mudam de UF
          pra UF e ao longo do tempo por portaria. Um valor único no perfil só está certo por coincidência.
        </InfoTip>
      </p>

      <DataTable
        colunas={colunas}
        itens={linhas}
        chave={(l: any) => l.icmsStUfId}
        carregando={isLoading}
        vazio="Nenhum valor específico por estado — tudo usa o padrão do perfil."
        ferramentas={
          <Button size="sm" onClick={abrirNovo} disabled={perfisComSt.length === 0}>
            <Plus size={14} className="mr-1" /> Novo valor por estado
          </Button>
        }
        acoes={(l: any) => (
          <>
            <BotaoIcone titulo="Editar" onClick={() => abrirEditar(l)}><Pencil size={14} /></BotaoIcone>
            <BotaoIcone titulo="Excluir" variante="perigo" onClick={() => setDel(l)}><Trash2 size={14} /></BotaoIcone>
          </>
        )}
      />
      {perfisComSt.length === 0 && (
        <p className="text-xs text-amber-600">Nenhum perfil tributário está marcado com substituição tributária ainda.</p>
      )}

      {painel && (
        <SidePanel titulo={editando ? 'Editar valor por estado' : 'Novo valor por estado'} onClose={() => setPainel(false)}
          rodape={
            <>
              <Button variant="outline" onClick={() => setPainel(false)}>Cancelar</Button>
              <Button onClick={() => salvar.mutate()} disabled={!form.perfilTribId || !form.ufDestino || salvar.isPending}>
                {salvar.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </>
          }>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Perfil tributário *</Label>
                <select value={form.perfilTribId} onChange={e => setF('perfilTribId', e.target.value)}
                  className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                  <option value="">Selecionar...</option>
                  {perfisComSt.map((p: any) => <option key={p.perfilTribId} value={p.perfilTribId}>{p.nome}</option>)}
                </select>
              </div>
              <div>
                <Label>Estado de destino *</Label>
                <select value={form.ufDestino} onChange={e => setF('ufDestino', e.target.value)}
                  className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                  <option value="">Selecionar...</option>
                  {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>MVA (%)</Label><Input value={form.mva} onChange={e => setF('mva', e.target.value)} className="sem-spinner mt-1" inputMode="decimal" /></div>
              <div><Label>Alíquota ICMS-ST (%)</Label><Input value={form.aliqIcmsSt} onChange={e => setF('aliqIcmsSt', e.target.value)} className="sem-spinner mt-1" inputMode="decimal" /></div>
            </div>
            <div>
              <Label className="inline-flex items-center gap-1">
                Fonte
                <InfoTip titulo="Por que registrar a fonte">
                  MVA muda por portaria. Sem saber de onde veio e quando, ninguém sabe depois se o valor ainda vale.
                </InfoTip>
              </Label>
              <Input value={form.fonte} onChange={e => setF('fonte', e.target.value)} className="mt-1" placeholder="Ex.: Protocolo ICMS 103/12, Portaria SAIF 59/2025" />
            </div>
            <div>
              <Label>Observação</Label>
              <Input value={form.observacao} onChange={e => setF('observacao', e.target.value)} className="mt-1" placeholder="Opcional" />
            </div>
          </div>
        </SidePanel>
      )}

      {confirmDel && (
        <ConfirmModal title="Excluir valor" message={`Excluir o valor de ${nomePerfil(confirmDel.perfilTribId)} para ${confirmDel.ufDestino}?`}
          confirmLabel="Excluir" danger
          onConfirm={() => { excluir.mutate(confirmDel.icmsStUfId); setDel(null) }}
          onCancel={() => setDel(null)} />
      )}
    </div>
  )
}
