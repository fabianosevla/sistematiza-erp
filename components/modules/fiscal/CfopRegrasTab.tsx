'use client'
// components/modules/fiscal/CfopRegrasTab.tsx
//
// CFOP de operações que NÃO são venda — devolução, bonificação, transferência,
// remessa para industrialização/conserto, consignação, compra de uso/consumo
// e de ativo. Venda tem tela própria (Perfis tributários), porque o CFOP de
// venda depende do produto; aqui não depende, só do tipo de operação e de
// mesmo-estado ou não.
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

const VAZIO = { tipoOperacao: '', direcao: 'saida', localizacao: 'interno', cfop: '', observacao: '' }

export default function CfopRegrasTab({ tenantSlug }: Props) {
  const { toast } = useToast()
  const qc  = useQueryClient()
  const api = `/api/${tenantSlug}/fiscal/cfop-regras`

  const [painel, setPainel]  = useState(false)
  const [editando, setEdit]  = useState<any | null>(null)
  const [form, setForm]      = useState({ ...VAZIO })
  const [confirmDel, setDel] = useState<any | null>(null)
  const setF = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const { data, isLoading } = useQuery({
    queryKey: ['cfop-regras', tenantSlug],
    queryFn:  async () => (await fetch(api)).json(),
  })
  const regras: any[] = data?.data?.regras ?? []

  const inv = () => qc.invalidateQueries({ queryKey: ['cfop-regras', tenantSlug] })

  const salvar = useMutation({
    mutationFn: async () => {
      const url    = editando ? `${api}/${editando.cfopRegraId}` : api
      const method = editando ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao salvar')
      return d
    },
    onSuccess: () => { inv(); setPainel(false); toast('Regra salva.') },
    onError: (e: any) => toast(e?.message ?? 'Erro ao salvar', 'error'),
  })

  const excluir = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${api}/${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao excluir')
      return d
    },
    onSuccess: () => { inv(); toast('Regra excluída.') },
    onError: (e: any) => toast(e?.message ?? 'Erro ao excluir', 'error'),
  })

  function abrirNovo() { setEdit(null); setForm({ ...VAZIO }); setPainel(true) }
  function abrirEditar(r: any) {
    setEdit(r)
    setForm({
      tipoOperacao: r.tipoOperacao, direcao: r.direcao, localizacao: r.localizacao,
      cfop: r.cfop, observacao: r.observacao ?? '',
    })
    setPainel(true)
  }

  const colunas: Coluna[] = [
    { chave: 'tipoOperacao', titulo: 'Tipo de operação', render: (r: any) => (
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{r.tipoOperacao}</p>
        {r.observacao && <p className="text-xs text-gray-400 truncate">{r.observacao}</p>}
      </div>
    )},
    { chave: 'direcao', titulo: 'Direção', render: (r: any) => (
      <span className="text-sm text-gray-600">{r.direcao === 'entrada' ? 'Entrada' : 'Saída'}</span>
    )},
    { chave: 'localizacao', titulo: 'Destino', render: (r: any) => (
      <span className="text-sm text-gray-600">{r.localizacao === 'interestadual' ? 'Fora do estado' : 'Dentro do estado'}</span>
    )},
    { chave: 'cfop', titulo: 'CFOP', render: (r: any) => (
      <span className="text-sm font-mono text-gray-900">{r.cfop}</span>
    )},
  ]

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 inline-flex items-center gap-1">
        Venda não aparece aqui — ela é resolvida pelo perfil tributário de cada produto, na aba Perfis tributários.
        <InfoTip titulo="Por que venda não está aqui">
          O CFOP de venda muda de produto pra produto (por causa da substituição tributária).
          As operações desta lista não dependem do produto — só do tipo de operação e do estado de destino.
        </InfoTip>
      </p>

      <DataTable
        colunas={colunas}
        itens={regras}
        chave={(r: any) => r.cfopRegraId}
        carregando={isLoading}
        vazio="Nenhuma regra cadastrada."
        ferramentas={<Button size="sm" onClick={abrirNovo}><Plus size={14} className="mr-1" /> Nova regra</Button>}
        acoes={(r: any) => (
          <>
            <BotaoIcone titulo="Editar" onClick={() => abrirEditar(r)}><Pencil size={14} /></BotaoIcone>
            <BotaoIcone titulo="Excluir" variante="perigo" onClick={() => setDel(r)}><Trash2 size={14} /></BotaoIcone>
          </>
        )}
      />

      {painel && (
        <SidePanel titulo={editando ? 'Editar regra de CFOP' : 'Nova regra de CFOP'} onClose={() => setPainel(false)}
          rodape={
            <>
              <Button variant="outline" onClick={() => setPainel(false)}>Cancelar</Button>
              <Button onClick={() => salvar.mutate()} disabled={!form.tipoOperacao.trim() || !/^\d{4}$/.test(form.cfop) || salvar.isPending}>
                {salvar.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </>
          }>
          <div className="p-6 space-y-4">
            <div>
              <Label>Tipo de operação *</Label>
              <Input value={form.tipoOperacao} onChange={e => setF('tipoOperacao', e.target.value)} className="mt-1"
                placeholder="Ex.: Devolução de venda, Bonificação, Transferência..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Direção</Label>
                <select value={form.direcao} onChange={e => setF('direcao', e.target.value)}
                  className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                  <option value="saida">Saída (a empresa manda)</option>
                  <option value="entrada">Entrada (a empresa recebe)</option>
                </select>
              </div>
              <div>
                <Label>Destino</Label>
                <select value={form.localizacao} onChange={e => setF('localizacao', e.target.value)}
                  className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                  <option value="interno">Dentro do estado</option>
                  <option value="interestadual">Fora do estado</option>
                </select>
              </div>
            </div>
            <div>
              <Label>CFOP *</Label>
              <Input value={form.cfop} onChange={e => setF('cfop', e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="mt-1 font-mono" placeholder="0000" maxLength={4} />
            </div>
            <div>
              <Label>Observação</Label>
              <Input value={form.observacao} onChange={e => setF('observacao', e.target.value)} className="mt-1" placeholder="Opcional" />
            </div>
          </div>
        </SidePanel>
      )}

      {confirmDel && (
        <ConfirmModal title="Excluir regra" message={`Excluir a regra de "${confirmDel.tipoOperacao}"?`}
          confirmLabel="Excluir" danger
          onConfirm={() => { excluir.mutate(confirmDel.cfopRegraId); setDel(null) }}
          onCancel={() => setDel(null)} />
      )}
    </div>
  )
}
