'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Download, Upload, Package2, Clock, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import CsvImportModal from '@/components/ui/CsvImportModal'
import { useDominio } from '@/hooks/useDominio'
import { HistoricoModal } from '@/components/ui/HistoricoModal'
import { AuditoriaInfo } from '@/components/ui/AuditoriaInfo'
import { InfoTip } from '@/components/ui/InfoTip'
import { fmtMoeda as fmt } from '@/lib/format'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { FormModal } from '@/components/ui/FormModal'

interface Props { tenantSlug: string }

// Estoque de insumo é fracionado (ex.: 0,250 kg). Mostra até 4 casas,
// cortando zeros à direita — 2 continua "2", 0,25 aparece "0,25".
function fmtEstoque(v: any) {
  const n = parseFloat(String(v ?? 0))
  if (!isFinite(n)) return '0'
  return String(Number(n.toFixed(4)))
}

type SortKey = 'nome' | 'tipo' | 'estoqueAtual' | 'precoCusto'
type SortDir  = 'asc' | 'desc'

export default function InsumosView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/cadastros/insumos`

  const tipos    = useDominio(tenantSlug, 'tipo_insumo',    ['Matéria Prima', 'Embalagem', 'Limpeza', 'Outros'])
  const unidades = useDominio(tenantSlug, 'unidade_medida', ['kg', 'g', 'l', 'ml', 'un', 'cx', 'sc', 'fd'])

  const [busca, setBusca]                 = useState('')
  const [page, setPage]                   = useState(1)
  const [limit, setLimit]                 = useState(20)
  const [showModal, setShowModal]         = useState(false)
  const [showImport, setShowImport]       = useState(false)
  const [showHistorico, setShowHistorico] = useState<any>(null)
  const [editando, setEditando]           = useState<any>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; nome: string } | null>(null)
  const [sortKey, setSortKey]             = useState<SortKey>('nome')
  const [sortDir, setSortDir]             = useState<SortDir>('asc')

  const [nome, setNome]               = useState('')
  const [tipo, setTipo]               = useState('')
  const [unidade, setUnidade]         = useState('')
  const [estoqueMin, setEstoqueMin]   = useState('0')
  const [estoqueAtual, setEstoqueAtual] = useState('0')
  const [precoCusto, setPrecoCusto]   = useState('')
  const [descricao, setDescricao]       = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')

  // Volta pra página 1 sempre que a busca muda
  useEffect(() => { setPage(1) }, [busca])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['insumos', tenantSlug] })

  // Paginação e busca no SERVIDOR (?page, ?limit, ?search).
  const { data: raw, isLoading } = useQuery({
    queryKey: ['insumos', tenantSlug, page, limit, busca],
    queryFn:  async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (busca) params.set('search', busca)
      return (await fetch(`${api}?${params}`)).json()
    },
  })

  // Fornecedores para o dropdown do campo fornecedorId
  const { data: fornecedoresRaw } = useQuery({
    queryKey: ['fornecedores-select', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/fornecedores?limit=500`)).json(),
  })
  const fornecedores: any[] = Array.isArray(fornecedoresRaw?.data?.data) ? fornecedoresRaw.data.data
    : Array.isArray(fornecedoresRaw?.data) ? fornecedoresRaw.data : []

  const salvarMut = useMutation({
    mutationFn: async () => {
      const payload = {
        nome, tipo, unidade,
        descricao:    descricao.trim() || null,
        codigoBarras: codigoBarras.trim() || null,
        fornecedorId: fornecedorId ? Number(fornecedorId) : null,
        // Estoque de insumo aceita fração (ex.: 0,250 kg) — colunas
        // migradas para NUMERIC(14,4) e Zod sem .int()
        estoqueMinimo: parseFloat(String(estoqueMin).replace(',', '.')) || 0,
        estoqueAtual:  parseFloat(String(estoqueAtual).replace(',', '.')) || 0,
        precoCusto: precoCusto ? Math.round(parseFloat(precoCusto.replace(',', '.')) * 100) : 0,
      }
      const url    = editando ? `${api}/${editando.insumoId}` : api
      const method = editando ? 'PUT' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      // Status ANTES do corpo: resposta sem JSON (405, por exemplo) fazia o
      // res.json() estourar e esconder o erro real.
      if (!res.ok) {
        const texto = await res.text()
        let msg = `Erro ${res.status} ao salvar insumo`
        try { msg = JSON.parse(texto)?.message ?? msg } catch {}
        throw new Error(msg)
      }
      return res.json()
    },
    onSuccess: (d: any) => {
      invalidate()
      const criando = !editando
      // O painel NÃO fecha ao salvar — quem fecha é o operador, no X.
      // Depois de criar, passa para modo edição do registro novo: senão um
      // segundo clique em Salvar criaria um insumo duplicado.
      if (criando) {
        const novoId = d?.data?.insumoId ?? d?.insumoId
        if (novoId) setEditando({ insumoId: novoId, nome })
      }
      toast(criando ? 'Insumo criado!' : 'Insumo atualizado!')
    },
    onError:   (e: any) => toast(e?.message ?? 'Erro ao salvar insumo.', 'error'),
  })

  const excluirMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => { invalidate(); fecharModal(); toast('Insumo excluído.') },
    onError:   () => toast('Erro ao excluir.', 'error'),
  })

  function abrirModal(item?: any) {
    if (item) {
      setEditando(item); setNome(item.nome)
      setTipo(item.tipo ?? tipos[0] ?? ''); setUnidade(item.unidade ?? unidades[0] ?? '')
      setEstoqueMin(String(item.estoqueMinimo ?? 0)); setEstoqueAtual(String(item.estoqueAtual ?? 0))
      setPrecoCusto(item.precoCusto ? (item.precoCusto / 100).toFixed(2) : '')
      setDescricao(item.descricao ?? '')
      setCodigoBarras(item.codigoBarras ?? '')
      setFornecedorId(item.fornecedorId ? String(item.fornecedorId) : '')
    } else {
      setEditando(null); setNome(''); setTipo(tipos[0] ?? ''); setUnidade(unidades[0] ?? '')
      setEstoqueMin('0'); setEstoqueAtual('0'); setPrecoCusto('')
      setDescricao(''); setCodigoBarras(''); setFornecedorId('')
    }
    setShowModal(true)
  }

  function fecharModal() { setShowModal(false); setEditando(null) }

  function toggleSort(key: string) {
    const k = key as SortKey
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }

  // Exporta TODOS os insumos (não só a página atual)
  async function exportCSV() {
    const res = await fetch(`${api}?limit=100000`)
    const j   = await res.json()
    const all = Array.isArray(j?.data?.data) ? j.data.data : Array.isArray(j?.data) ? j.data : []
    const rows = all.map((i: any) => [i.insumoId, i.nome, i.tipo ?? '', i.unidade ?? '', i.estoqueAtual, i.estoqueMinimo, i.precoCusto ? (i.precoCusto/100).toFixed(2) : '0'])
    const csv  = [['ID','Nome','Tipo','Unidade','Estoque Atual','Estoque Mínimo','Preço Custo'], ...rows].map(r => r.map((c: any) => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿'+csv], { type: 'text/csv' })); a.download = 'insumos.csv'; a.click()
  }

  const pagina = Array.isArray(raw?.data?.data) ? raw.data.data : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : []
  const meta   = raw?.data?.meta

  // Ordena apenas a página atual (a busca é feita no servidor)
  const insumos = [...pagina].sort((a: any, b: any) => {
    const av = a[sortKey] ?? ''; const bv = b[sortKey] ?? ''
    const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'pt-BR')
    return sortDir === 'asc' ? cmp : -cmp
  })

  const colunas: Coluna[] = [
    {
      chave: 'nome', titulo: 'Nome', ordenavel: true,
      classeCelula: 'pl-[10px] pr-4 py-3 border-l-2 border-transparent group-hover:border-green-500 transition-all duration-150',
      render: (ins: any) => (
        <span className="text-sm font-medium text-gray-900 cursor-pointer hover:text-green-700" onClick={() => abrirModal(ins)}>
          {ins.nome}
        </span>
      ),
    },
    {
      chave: 'tipo', titulo: 'Tipo', ordenavel: true, alinhamento: 'center',
      render: (ins: any) => <Badge variant="secondary">{ins.tipo ?? '—'}</Badge>,
    },
    {
      chave: 'unidade', titulo: 'Unidade', alinhamento: 'center',
      render: (ins: any) => ins.unidade ?? '—',
    },
    {
      chave: 'estoqueAtual', titulo: 'Est. Atual', ordenavel: true, alinhamento: 'center',
      render: (ins: any) => (
        <span className={`text-sm font-semibold ${ins.estoqueAtual <= ins.estoqueMinimo ? 'text-red-600' : 'text-gray-700'}`}>
          {fmtEstoque(ins.estoqueAtual)}
        </span>
      ),
    },
    {
      chave: 'estoqueMinimo', titulo: 'Est. Mínimo', alinhamento: 'center',
      render: (ins: any) => fmtEstoque(ins.estoqueMinimo),
    },
    {
      chave: 'precoCusto', titulo: 'Preço Custo', ordenavel: true, alinhamento: 'center',
      classeCelula: 'px-4 py-3 text-center text-sm font-medium text-gray-700',
      render: (ins: any) => ins.precoCusto ? fmt(ins.precoCusto) : '—',
    },
  ]

  return (
    <div>
      <PageHeader
        titulo="Insumos"
        acoes={
          <>
            <Button variant="outline" onClick={exportCSV}><Download size={14} className="mr-1.5" /> CSV</Button>
            <Button variant="outline" onClick={() => setShowImport(true)}><Upload size={14} className="mr-1.5" /> Importar</Button>
            <Button onClick={() => abrirModal()}><Plus size={15} className="mr-1.5" /> Novo Insumo</Button>
          </>
        }
      />

      <SearchInput
        valor={busca}
        onChange={setBusca}
        placeholder="Buscar insumo..."
        className="mb-4 max-w-xs"
      />

      <DataTable
        colunas={colunas}
        itens={insumos}
        chave={(ins: any) => ins.insumoId}
        carregando={isLoading}
        usarSkeleton
        acoesCentro
        vazio={
          <EmptyState icon={Package2} title="Nenhum insumo encontrado"
            action="Cadastrar primeiro insumo" onAction={() => abrirModal()} />
        }
        ordem={{ chave: sortKey, dir: sortDir }}
        onOrdenar={toggleSort}
        meta={meta}
        onPageChange={setPage}
        onLimitChange={(l: number) => { setLimit(l); setPage(1) }}
        acoes={(ins: any) => (
          <>
            <BotaoIcone titulo="Histórico" variante="destaque" onClick={() => setShowHistorico(ins)}>
              <Clock size={14} />
            </BotaoIcone>
            <BotaoIcone titulo="Editar" onClick={() => abrirModal(ins)}>
              <Pencil size={14} />
            </BotaoIcone>
            <BotaoIcone titulo="Excluir" variante="perigo" onClick={() => setConfirmDelete({ id: ins.insumoId, nome: ins.nome })}>
              <Trash2 size={14} />
            </BotaoIcone>
          </>
        )}
      />

      {/* Painel criar / editar */}
      {showModal && (
        <FormModal
          titulo={editando ? 'Editar insumo' : 'Novo insumo'}
          subtitulo={editando?.nome}
          onClose={fecharModal}
          largura="max-w-lg"
        >
          <div className="p-6 space-y-4">
            <div><Label>Nome *</Label><Input value={nome} onChange={e => setNome(e.target.value)} className="mt-1" autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="inline-flex items-center gap-1">
                  Tipo
                  <InfoTip titulo="Tipo de insumo">
                    A lista vem de Cadastros → Domínios. Para incluir um tipo novo, cadastre lá e ele aparece aqui.
                  </InfoTip>
                </Label>
                <select value={tipo} onChange={e => setTipo(e.target.value)} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                  {tipos.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Label className="inline-flex items-center gap-1">
                  Unidade
                  <InfoTip titulo="Unidade">
                    Unidade em que o estoque deste insumo é controlado. A lista vem de Cadastros → Domínios.
                  </InfoTip>
                </Label>
                <select value={unidade} onChange={e => setUnidade(e.target.value)} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                  {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Código de Barras</Label><Input value={codigoBarras} onChange={e => setCodigoBarras(e.target.value)} className="mt-1" placeholder="EAN" /></div>
              <div>
                <Label>Fornecedor</Label>
                <select value={fornecedorId} onChange={e => setFornecedorId(e.target.value)} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                  <option value="">— Sem fornecedor —</option>
                  {fornecedores.map((f: any) => <option key={f.fornecedorId} value={f.fornecedorId}>{f.nomeFantasia || f.nomeCompleto}</option>)}
                </select>
              </div>
            </div>
            <div><Label>Descrição</Label><Input value={descricao} onChange={e => setDescricao(e.target.value)} className="mt-1" placeholder="Descrição do insumo (opcional)" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="inline-flex items-center gap-1">
                  Est. Atual
                  <InfoTip titulo="Estoque atual">
                    Aceita valores fracionados — use ponto como separador (ex.: 0.250 kg).
                  </InfoTip>
                </Label>
                <Input type="number" min="0" step="any" inputMode="decimal" value={estoqueAtual}
                  onChange={e => setEstoqueAtual(e.target.value)} className="sem-spinner mt-1" />
              </div>
              <div>
                <Label className="inline-flex items-center gap-1">
                  Est. Mínimo
                  <InfoTip titulo="Estoque mínimo">
                    Abaixo desta quantidade o saldo aparece em vermelho na listagem.
                    Aceita fração — use ponto (ex.: 0.250).
                  </InfoTip>
                </Label>
                <Input type="number" min="0" step="any" inputMode="decimal" value={estoqueMin}
                  onChange={e => setEstoqueMin(e.target.value)} className="sem-spinner mt-1" />
              </div>
              <div>
                <Label>Preço Custo (R$)</Label>
                <Input type="number" min="0" step="0.01" inputMode="decimal" value={precoCusto}
                  onChange={e => setPrecoCusto(e.target.value)} className="sem-spinner mt-1" />
              </div>
            </div>

            {editando && (
              <AuditoriaInfo
                criadoPor={editando.createdBy}
                criadoEm={editando.createdDt}
                atualizadoPor={editando.updatedBy}
                atualizadoEm={editando.updatedDt}
                className="pt-3 border-t border-gray-100"
              />
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={fecharModal}>Fechar</Button>
              <Button onClick={() => salvarMut.mutate()} disabled={!nome || salvarMut.isPending}>
                {salvarMut.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </FormModal>
      )}

      {showImport && (
        <CsvImportModal tenantSlug={tenantSlug} entidade="insumos" nomeEntidade="Insumos"
          onClose={() => setShowImport(false)} onSuccess={() => { invalidate(); setShowImport(false) }} />
      )}

      {confirmDelete && (
        <ConfirmModal title="Excluir insumo"
          message={`Tem certeza que deseja excluir "${confirmDelete.nome}"? Isso pode afetar fichas técnicas vinculadas.`}
          confirmLabel="Excluir" danger
          onConfirm={() => { excluirMut.mutate(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)} />
      )}

      {showHistorico && (
        <HistoricoModal
          tenantSlug={tenantSlug}
          entidade="insumo"
          entidadeId={showHistorico.insumoId}
          titulo={showHistorico.nome}
          onClose={() => setShowHistorico(null)}
        />
      )}
    </div>
  )
}