'use client'
// components/modules/fiscal/NcmSimuladorTab.tsx
//
// Busca de NCM por palavra-chave. Diferente do simulador de CFOP, NCM não é
// calculado a partir de regras — é característica da mercadoria. Isso aqui
// ajuda a achar candidato numa lista curada (cresce por cadastro), não
// classifica produto sozinho.
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Pencil, Trash2 } from 'lucide-react'
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

const VAZIO = { ncm: '', descricao: '', cestSugerido: '', fonte: '' }

export default function NcmSimuladorTab({ tenantSlug }: Props) {
  const { toast } = useToast()
  const qc  = useQueryClient()
  const api = `/api/${tenantSlug}/fiscal/ncm-referencia`

  const [termo, setTermo]     = useState('')
  const [painel, setPainel]   = useState(false)
  const [editando, setEdit]   = useState<any | null>(null)
  const [form, setForm]       = useState({ ...VAZIO })
  const [confirmDel, setDel]  = useState<any | null>(null)
  const setF = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const { data, isLoading } = useQuery({
    queryKey: ['ncm-referencia', tenantSlug, termo],
    queryFn:  async () => (await fetch(`${api}?termo=${encodeURIComponent(termo)}`)).json(),
  })
  const resultadosBrutos: any[] = data?.data?.resultados ?? []

  // Ordenação por coluna, SOBRE OS RESULTADOS DA BUSCA — diferente do funil
  // de filtro (não faz sentido aqui: ver comentário mais abaixo, no
  // DataTable), ordenar continua útil mesmo com valor quase único por linha
  // (ex.: ordenar por NCM pra comparar códigos próximos na mesma família).
  const [sortKey, setSortKey] = useState('ncm')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  function toggleSort(chave: string) {
    if (sortKey === chave) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(chave); setSortDir('asc') }
  }
  const resultados = useMemo(() => [...resultadosBrutos].sort((a: any, b: any) => {
    const cmp = String(a?.[sortKey] ?? '').localeCompare(String(b?.[sortKey] ?? ''), 'pt-BR')
    return sortDir === 'asc' ? cmp : -cmp
  }), [resultadosBrutos, sortKey, sortDir])

  const inv = () => qc.invalidateQueries({ queryKey: ['ncm-referencia', tenantSlug] })

  const salvar = useMutation({
    mutationFn: async () => {
      const url    = editando ? `${api}/${editando.ncmRefId}` : api
      const method = editando ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao salvar')
      return d
    },
    onSuccess: () => { inv(); setPainel(false); toast('NCM salvo.') },
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
  function abrirEditar(r: any) {
    setEdit(r)
    setForm({ ncm: r.ncm, descricao: r.descricao, cestSugerido: r.cestSugerido ?? '', fonte: r.fonte ?? '' })
    setPainel(true)
  }

  const colunas: Coluna[] = [
    { chave: 'ncm', titulo: 'NCM', largura: 'w-28', ordenavel: true, render: (r: any) => (
      <span className="text-sm font-mono font-semibold text-green-700">{r.ncm}</span>
    )},
    { chave: 'descricao', titulo: 'Descrição', principal: true, ordenavel: true },
    { chave: 'cestSugerido', titulo: 'CEST sugerido', esconderAte: 'md', ordenavel: true, render: (r: any) => (
      <span className="text-sm font-mono">{r.cestSugerido || '—'}</span>
    )},
    { chave: 'fonte', titulo: 'Fonte', esconderAte: 'lg', ordenavel: true },
  ]

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 inline-flex items-center gap-1">
        Busca numa lista curada, não a tabela oficial completa (~10 mil códigos) — cresce conforme cadastrar.
        <InfoTip titulo="Por que não é automático">
          NCM classifica a mercadoria em si; não dá pra calcular a partir de outros dados, só
          consultar. Isso aqui ajuda a achar candidato — quem confirma é quem cadastra o produto.
        </InfoTip>
      </p>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <Input value={termo} onChange={e => setTermo(e.target.value)} className="pl-9 h-9"
            placeholder="Buscar por código ou palavra (ex.: massa, queijo, vinho)..." />
        </div>
        <Button size="sm" onClick={abrirNovo}><Plus size={14} className="mr-1" /> Novo NCM</Button>
      </div>

      {/* Sem filtro de coluna aqui: NCM, descrição e fonte são ~únicos por linha
          (não têm um conjunto pequeno de valores repetidos pra um funil fazer
          sentido) e a busca acima já cobre código/palavra sobre a lista toda,
          não só a página carregada — filtro de coluna seria redundante.
          Ordenação é outra coisa e continua útil mesmo com valor único por
          linha (ex.: por NCM, pra comparar códigos vizinhos da mesma família). */}
      <DataTable
        colunas={colunas}
        itens={resultados}
        chave={(r: any) => r.ncmRefId}
        carregando={isLoading}
        vazio={termo ? 'Nenhum NCM encontrado pra essa busca.' : 'Nenhum NCM cadastrado ainda.'}
        ordem={{ chave: sortKey, dir: sortDir }}
        onOrdenar={toggleSort}
        acoes={(r: any) => (
          <>
            <BotaoIcone titulo="Editar" onClick={() => abrirEditar(r)}><Pencil size={13} /></BotaoIcone>
            <BotaoIcone titulo="Excluir" variante="perigo" onClick={() => setDel(r)}><Trash2 size={13} /></BotaoIcone>
          </>
        )}
      />

      {painel && (
        <SidePanel titulo={editando ? 'Editar NCM' : 'Novo NCM de referência'} onClose={() => setPainel(false)}
          rodape={
            <>
              <Button variant="outline" onClick={() => setPainel(false)}>Cancelar</Button>
              <Button onClick={() => salvar.mutate()} disabled={!/^\d{8}$/.test(form.ncm) || !form.descricao.trim() || salvar.isPending}>
                {salvar.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </>
          }>
          <div className="p-6 space-y-4">
            <div>
              <Label>NCM (8 dígitos) *</Label>
              <Input value={form.ncm} onChange={e => setF('ncm', e.target.value.replace(/\D/g, '').slice(0, 8))}
                className="mt-1 font-mono" placeholder="00000000" maxLength={8} />
            </div>
            <div>
              <Label>Descrição *</Label>
              <Input value={form.descricao} onChange={e => setF('descricao', e.target.value)} className="mt-1" placeholder="O que esse código classifica" />
            </div>
            <div>
              <Label>CEST sugerido</Label>
              <Input value={form.cestSugerido} onChange={e => setF('cestSugerido', e.target.value)} className="mt-1" placeholder="Opcional — só se tiver ST" />
            </div>
            <div>
              <Label className="inline-flex items-center gap-1">
                Fonte
                <InfoTip titulo="Por que registrar a fonte">
                  Classificação fiscal muda por solução de consulta da Receita. Sem saber de onde
                  veio, ninguém sabe depois se ainda vale.
                </InfoTip>
              </Label>
              <Input value={form.fonte} onChange={e => setF('fonte', e.target.value)} className="mt-1" placeholder="Ex.: Solução de Consulta COSIT 98.234/2023" />
            </div>
          </div>
        </SidePanel>
      )}

      {confirmDel && (
        <ConfirmModal title="Excluir NCM" message={`Excluir o NCM ${confirmDel.ncm}?`}
          confirmLabel="Excluir" danger
          onConfirm={() => { excluir.mutate(confirmDel.ncmRefId); setDel(null) }}
          onCancel={() => setDel(null)} />
      )}
    </div>
  )
}
