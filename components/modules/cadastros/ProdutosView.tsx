'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Download, Upload, BookOpen, Package, EyeOff, Pencil, Lock, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import ImportacaoModal from '@/components/modules/importacao/ImportacaoModal'
import { useDominio } from '@/hooks/useDominio'
import { AuditoriaInfo } from '@/components/ui/AuditoriaInfo'
import { InfoTip } from '@/components/ui/InfoTip'
import { fmtMoeda as fmt, fmtMoedaInput as fmtInput, fmtQtd } from '@/lib/format'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { SidePanel } from '@/components/ui/SidePanel'

interface Props { tenantSlug: string }

type SortKey = 'nome' | 'tipo' | 'precoVarejo' | 'estoqueAtual'
type SortDir  = 'asc' | 'desc'

export default function ProdutosView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/cadastros/produtos`

  const tipos    = useDominio(tenantSlug, 'tipo_produto',   ['Massa','Molho','Acompanhamento','Bebida','Outro'])
  const unidades = useDominio(tenantSlug, 'unidade_medida', ['kg','g','l','ml','un','cx'])

  const [busca, setBusca]                 = useState('')
  const [page, setPage]                   = useState(1)
  const [limit, setLimit]                 = useState(20)
  const [showInativos, setShowInativos]   = useState(false)
  const [showPainel, setShowPainel]         = useState(false)
  const [showImport, setShowImport]       = useState(false)
  const [showFicha, setShowFicha]         = useState<any>(null)
  const [editando, setEditando]           = useState<any>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; nome: string } | null>(null)
  const [sortKey, setSortKey]             = useState<SortKey>('nome')
  const [sortDir, setSortDir]             = useState<SortDir>('asc')

  const [nome, setNome]               = useState('')
  const [tipo, setTipo]               = useState('')
  const [unidade, setUnidade]         = useState('')
  // CORREÇÃO (dados ocultos): descricao, codigoBarras, categoria e precoCusto
  // existiam no banco mas não apareciam em lugar nenhum da tela.
  const [descricao, setDescricao]       = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [categoria, setCategoria]       = useState('')
  const [precoCusto, setPrecoCusto]     = useState('')
  const [precoVarejo, setPrecoVarejo] = useState('')
  const [atacados, setAtacados]       = useState({ A: '', B: '', C: '', D: '', E: '' })
  const [estoqueMin, setEstoqueMin]   = useState('0')
  const [estoqueAtual, setEstoqueAtual] = useState('0')
  const [ativo, setAtivo]             = useState(true)
  const [revenda, setRevenda]         = useState(false)
  const [insumoAtivo, setInsumoAtivo] = useState(false)

  // ── Fiscais ──────────────────────────────────────────────────────────────
  // Descrevem a mercadoria. A tributação vem do perfil, cadastrado pelo
  // contador em Fiscal > Parametrização.
  const [ncm, setNcm]                 = useState('')
  const [cest, setCest]               = useState('')
  const [origem, setOrigem]           = useState('0')
  const [unidadeTrib, setUnidadeTrib] = useState('')
  const [perfilTrib, setPerfilTrib]   = useState('')

  useEffect(() => { setPage(1) }, [busca])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['produtos', tenantSlug] })

  // Perfis tributários para o seletor. staleTime alto: muda raramente, e é o
  // contador quem mexe — não faz sentido rebuscar a cada abertura do painel.
  const { data: perfisRaw } = useQuery({
    queryKey: ['perfis-tributarios', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/fiscal/perfis`)).json(),
    staleTime: 5 * 60 * 1000,
  })
  const perfisTrib: any[] = perfisRaw?.data?.perfis ?? []

  const { data: raw, isLoading } = useQuery({
    queryKey: ['produtos', tenantSlug, page, limit, busca, showInativos],
    queryFn:  async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (busca) params.set('search', busca)
      if (showInativos) params.set('incluirInativos', 'true')
      return (await fetch(`${api}?${params}`)).json()
    },
  })

  // ── FICHA TÉCNICA query (somente leitura) ─────────────────────────────────
  // A rota GET retorna { data: { itens: [...], custoProdução: ... } }
  // então precisamos de fichaRaw?.data?.itens, não fichaRaw?.data diretamente.
  const { data: fichaRaw } = useQuery({
    queryKey: ['ficha', tenantSlug, showFicha?.produtoId],
    queryFn:  async () => (await fetch(`${api}/${showFicha.produtoId}/ficha`)).json(),
    enabled:  !!showFicha,
  })

  // ── MUTATIONS ─────────────────────────────────────────────────────────────

  const salvarMut = useMutation({
    mutationFn: async () => {
      const parseP = (v: string) => v ? Math.round(parseFloat(v.replace(',', '.')) * 100) : 0
      const payload = {
        // CORREÇÃO: revenda agora é flag PRÓPRIA (coluna revenda no banco) —
        // não sobrescreve mais o tipo. Um produto pode ser "Bebida" E revenda.
        nome, tipo, unidade, activeFlag: ativo, revenda,
        descricao:     descricao.trim() || null,
        codigoBarras:  codigoBarras.trim() || null,
        categoria:     categoria.trim() || null,
        insumoFlg:     insumoAtivo,
        precoCusto:    parseP(precoCusto),
        precoVarejo:   parseP(precoVarejo),
        precoAtacado:  parseP(atacados.A),
        precoAtacadoA: parseP(atacados.A),
        precoAtacadoB: parseP(atacados.B),
        precoAtacadoC: parseP(atacados.C),
        precoAtacadoD: parseP(atacados.D),
        precoAtacadoE: parseP(atacados.E),
        estoqueMinimo: Number(estoqueMin),
        ncm:               ncm.trim() || null,
        cest:              cest.trim() || null,
        origem:            origem || '0',
        unidadeTributavel: unidadeTrib.trim() || null,
        perfilTribId:      perfilTrib ? Number(perfilTrib) : null,
        // inclui modificationNum para suportar o optimistic locking da rota PUT
        ...(editando?.modificationNum !== undefined
          ? { modificationNum: editando.modificationNum }
          : {}),
      }
      const url    = editando ? `${api}/${editando.produtoId}` : api
      const method = editando ? 'PUT' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      // CORREÇÃO CRÍTICA: checar res.ok para não disparar onSuccess em erros
      // Sem isso, uma resposta 409/500 do servidor disparava onSuccess, fechava
      // o modal e mostrava "Produto atualizado!" mas nada tinha sido salvo.
      if (!res.ok) {
        const msg = data?.message ?? data?.error ?? `Erro ${res.status} ao salvar produto`
        throw new Error(msg)
      }
      return data
    },
    onSuccess: (data: any) => {
      invalidate()
      const criando = !editando
      // O painel NÃO fecha ao salvar — quem fecha é o operador, no X.
      // Mas depois de CRIAR ele passa para o modo edição do registro novo:
      // sem isso, um segundo clique em Salvar criaria um produto duplicado.
      if (criando) {
        const novoId = data?.data?.produtoId ?? data?.produtoId
        if (novoId) setEditando({ produtoId: novoId, nome })
      }
      toast(criando ? 'Produto criado!' : 'Produto atualizado!')
    },
    onError: (err: any) => toast(err?.message ?? 'Erro ao salvar.', 'error'),
  })

  const excluirMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${api}/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? 'Erro ao excluir')
      return data
    },
    onSuccess: () => { invalidate(); toast('Produto desativado. Histórico de vendas preservado.') },
    onError:   (err: any) => toast(err?.message ?? 'Erro ao excluir.', 'error'),
  })

  const reativarMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${api}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeFlag: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? 'Erro ao reativar')
      return data
    },
    onSuccess: () => { invalidate(); toast('Produto reativado!') },
    onError:   (err: any) => toast(err?.message ?? 'Erro ao reativar.', 'error'),
  })

  // ── HELPERS ───────────────────────────────────────────────────────────────

  function abrirPainel(item?: any) {
    if (item) {
      setEditando(item)
      setNome(item.nome)
      setTipo(item.tipo ?? tipos[0] ?? '')
      setUnidade(item.unidade ?? unidades[0] ?? '')
      setDescricao(item.descricao ?? '')
      setCodigoBarras(item.codigoBarras ?? '')
      setCategoria(item.categoria ?? '')
      setPrecoCusto(item.precoCusto ? fmtInput(item.precoCusto) : '')
      setPrecoVarejo(fmtInput(item.precoVarejo))
      setAtacados({
        A: fmtInput(item.precoAtacadoA ?? item.precoAtacado ?? 0),
        B: fmtInput(item.precoAtacadoB ?? 0),
        C: fmtInput(item.precoAtacadoC ?? 0),
        D: fmtInput(item.precoAtacadoD ?? 0),
        E: fmtInput(item.precoAtacadoE ?? 0),
      })
      setEstoqueMin(String(item.estoqueMinimo ?? 0))
      setEstoqueAtual(String(item.estoqueAtual ?? 0))
      setAtivo(item.activeFlag ?? true)
      setRevenda(item.tipo === 'Revenda' || item.revenda === true)
      setInsumoAtivo(item.insumoFlg === true)
      setNcm(item.ncm ?? '')
      setCest(item.cest ?? '')
      setOrigem(item.origem ?? '0')
      setUnidadeTrib(item.unidadeTributavel ?? '')
      setPerfilTrib(item.perfilTribId ? String(item.perfilTribId) : '')
    } else {
      setEditando(null)
      setNome('')
      setTipo(tipos[0] ?? '')
      setUnidade(unidades[0] ?? '')
      setDescricao('')
      setCodigoBarras('')
      setCategoria('')
      setPrecoCusto('')
      setPrecoVarejo('')
      setAtacados({ A: '', B: '', C: '', D: '', E: '' })
      setEstoqueMin('0')
      setEstoqueAtual('0')
      setAtivo(true)
      setRevenda(false)
      setInsumoAtivo(false)
      setNcm(''); setCest(''); setOrigem('0'); setUnidadeTrib(''); setPerfilTrib('')
    }
    setShowPainel(true)
  }

  function fecharPainel() { setShowPainel(false); setEditando(null) }

  function toggleSort(key: string) {
    const k = key as SortKey
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }

  function exportCSV() {
    const rows = todos.map((p: any) => [
      p.produtoId, p.nome, p.tipo ?? '', p.unidade ?? '',
      p.precoVarejo ? (p.precoVarejo / 100).toFixed(2) : '0',
      p.estoqueAtual, p.estoqueMinimo,
      p.activeFlag ? 'Ativo' : 'Inativo',
    ])
    const csv = [['ID','Nome','Tipo','Unidade','Preço Varejo','Est.Atual','Est.Mín','Status'], ...rows]
      .map(r => r.map((c: any) => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
    a.download = 'produtos.csv'
    a.click()
  }

  // ── DADOS DERIVADOS ───────────────────────────────────────────────────────

  const todos   = Array.isArray(raw?.data?.data) ? raw.data.data
    : Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw) ? raw : []

  // CORREÇÃO: rota GET /ficha retorna { data: { itens: [...], custoProdução: ... } }
  const fichaItens = Array.isArray(fichaRaw?.data?.itens) ? fichaRaw.data.itens
    : Array.isArray(fichaRaw?.itens) ? fichaRaw.itens
    : Array.isArray(fichaRaw?.data) ? fichaRaw.data
    : Array.isArray(fichaRaw) ? fichaRaw : []

  // Custo de produção calculado pela própria rota; fallback soma local
  const custoFicha = Number(
    fichaRaw?.data?.['custoProdução'] ??
    fichaItens.reduce((acc: number, i: any) => acc + parseFloat(String(i.quantidade ?? 0)) * Number(i.precoCusto ?? 0), 0)
  )

  const produtos = [...todos]
    .sort((a: any, b: any) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'pt-BR')
      return sortDir === 'asc' ? cmp : -cmp
    })

  const colunas: Coluna[] = [
    {
      chave: 'nome', titulo: 'Nome', ordenavel: true,
      classeCelula: 'pl-[10px] pr-4 py-3 border-l-2 border-transparent group-hover:border-green-500 transition-all duration-150',
      render: (p: any) => {
        const inativo = p.activeFlag === false
        return (
          <>
            <span
              className={`text-sm font-medium ${inativo ? 'text-gray-400 line-through' : 'text-gray-900 cursor-pointer hover:text-green-700'}`}
              onClick={() => !inativo && abrirPainel(p)}>
              {p.nome}
            </span>
            {p.insumoFlg && !inativo && (
              <span className="ml-2 text-[10px] bg-gray-100 text-gray-600 border border-gray-200 rounded-full px-1.5 py-0.5 align-middle">insumo</span>
            )}
            {p.revenda && !inativo && (
              <span className="ml-2 text-[10px] bg-gray-100 text-gray-600 border border-gray-200 rounded-full px-1.5 py-0.5 align-middle">revenda</span>
            )}
            {inativo && (
              <InfoTip titulo="Produto inativo" className="ml-2 align-middle">
                Não aparece em vendas nem em produção. O histórico é preservado e você pode reativar a qualquer momento.
              </InfoTip>
            )}
          </>
        )
      },
    },
    {
      chave: 'tipo', titulo: 'Tipo', ordenavel: true, alinhamento: 'center',
      render: (p: any) => <Badge variant="secondary">{p.tipo ?? '—'}</Badge>,
    },
    { chave: 'unidade', titulo: 'Unidade', alinhamento: 'center', render: (p: any) => p.unidade ?? '—' },
    {
      chave: 'precoVarejo', titulo: 'Varejo', ordenavel: true, alinhamento: 'center',
      classeCelula: 'px-4 py-3 text-center text-sm font-medium',
      render: (p: any) => p.precoVarejo ? fmt(p.precoVarejo) : '—',
    },
    {
      chave: 'precoAtacadoA', titulo: 'Atacado A', alinhamento: 'center',
      render: (p: any) => (p.precoAtacadoA ?? p.precoAtacado) ? fmt(p.precoAtacadoA ?? p.precoAtacado) : '—',
    },
    {
      chave: 'estoqueAtual', titulo: 'Estoque', ordenavel: true, alinhamento: 'center',
      render: (p: any) => (
        <>
          <span className={`text-sm font-semibold ${p.estoqueAtual <= p.estoqueMinimo ? 'text-red-600' : 'text-green-600'}`}>
            {p.estoqueAtual}
          </span>
          <span className="text-xs text-gray-300">/{p.estoqueMinimo}</span>
        </>
      ),
    },
    {
      chave: 'activeFlag', titulo: 'Status', alinhamento: 'center',
      render: (p: any) => {
        const inativo = p.activeFlag === false
        return <Badge variant={inativo ? 'secondary' : 'default'}>{inativo ? 'Inativo' : 'Ativo'}</Badge>
      },
    },
  ]

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        titulo="Produtos"
        acoes={
          <>
            <Button variant="outline" onClick={() => setShowInativos(v => !v)}
              className={showInativos ? 'border-amber-300 text-amber-600' : ''}>
              <EyeOff size={14} className="mr-1.5" />
              {showInativos ? 'Ocultar inativos' : 'Ver inativos'}
            </Button>
            <Button variant="outline" onClick={exportCSV}><Download size={14} className="mr-1.5" /> CSV</Button>
            <Button variant="outline" onClick={() => setShowImport(true)}><Upload size={14} className="mr-1.5" /> Importar</Button>
            <Button onClick={() => abrirPainel()}><Plus size={15} className="mr-1.5" /> Novo Produto</Button>
          </>
        }
      />

      <SearchInput
        valor={busca}
        onChange={setBusca}
        placeholder="Buscar produto..."
        className="mb-4 max-w-xs"
      />

      <DataTable
        colunas={colunas}
        itens={produtos}
        chave={(p: any) => p.produtoId}
        carregando={isLoading}
        usarSkeleton
        acoesCentro
        vazio={
          <EmptyState icon={Package} title="Nenhum produto cadastrado"
            action="Cadastrar primeiro produto" onAction={() => abrirPainel()} />
        }
        ordem={{ chave: sortKey, dir: sortDir }}
        onOrdenar={toggleSort}
        classeLinha={(p: any) => p.activeFlag === false ? 'opacity-50 bg-gray-50/50' : ''}
        meta={raw?.data?.meta}
        onPageChange={setPage}
        onLimitChange={(l: number) => { setLimit(l); setPage(1) }}
        acoes={(p: any) => {
          const inativo = p.activeFlag === false
          return (
            <>
              {!inativo && (
                <>
                  <BotaoIcone titulo="Editar" variante="sucesso" onClick={() => abrirPainel(p)}>
                    <Pencil size={14} />
                  </BotaoIcone>
                  <BotaoIcone titulo="Ver ficha técnica (somente leitura)" variante="azul" onClick={() => setShowFicha(p)}>
                    <BookOpen size={14} />
                  </BotaoIcone>
                </>
              )}
              {inativo ? (
                <BotaoIcone titulo="Reativar" variante="sucesso" onClick={() => reativarMut.mutate(p.produtoId)}>
                  <RotateCcw size={14} />
                </BotaoIcone>
              ) : (
                <BotaoIcone titulo="Desativar" variante="perigo" onClick={() => setConfirmDelete({ id: p.produtoId, nome: p.nome })}>
                  <Trash2 size={14} />
                </BotaoIcone>
              )}
            </>
          )
        }}
      />

      {/* Painel criar / editar */}
      {showPainel && (
        <SidePanel
          titulo={editando ? 'Editar produto' : 'Novo produto'}
          subtitulo={editando?.nome}
          onClose={fecharPainel}
          rodape={
            <>
              <Button variant="outline" onClick={fecharPainel}>Fechar</Button>
              <Button onClick={() => salvarMut.mutate()} disabled={!nome || salvarMut.isPending}>
                {salvarMut.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </>
          }
        >
          <div className="p-6 space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} className="mt-1" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="inline-flex items-center gap-1">
                  Tipo
                  <InfoTip titulo="Tipo de produto">
                    A lista vem de Cadastros → Domínios. Para incluir um tipo novo, cadastre lá e ele aparece aqui.
                  </InfoTip>
                </Label>
                <select value={tipo} onChange={e => setTipo(e.target.value)}
                  className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                  {tipos.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Label className="inline-flex items-center gap-1">
                  Unidade
                  <InfoTip titulo="Unidade">
                    Também vem de Cadastros → Domínios. É a unidade em que o produto é vendido e controlado no estoque.
                  </InfoTip>
                </Label>
                <select value={unidade} onChange={e => setUnidade(e.target.value)}
                  className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                  {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <Input value={categoria} onChange={e => setCategoria(e.target.value)} className="mt-1" placeholder="Ex.: Massas, Bebidas…" />
              </div>
              <div>
                <Label>Código de Barras</Label>
                <Input value={codigoBarras} onChange={e => setCodigoBarras(e.target.value)} className="mt-1" placeholder="EAN" />
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={descricao} onChange={e => setDescricao(e.target.value)} className="mt-1" placeholder="Descrição do produto (opcional)" />
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Preços</p>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-700 font-semibold inline-flex items-center gap-1">
                      Custo (R$)
                      <InfoTip titulo="Preço de custo">
                        Se o produto tem ficha técnica, o custo calculado por ela prevalece.
                        Este campo é usado apenas como valor de reserva.
                      </InfoTip>
                    </Label>
                    <Input type="number" min="0" step="0.01" value={precoCusto}
                      onChange={e => setPrecoCusto(e.target.value)} className="mt-1 h-9" placeholder="0,00" />
                  </div>
                  <div>
                    <Label className="text-xs text-green-700 font-semibold">Varejo (R$)</Label>
                    <Input type="number" min="0" step="0.01" value={precoVarejo}
                      onChange={e => setPrecoVarejo(e.target.value)} className="mt-1 h-9" placeholder="0,00" />
                  </div>
                </div>
                <div className="border-t border-gray-200 pt-3">
                  <p className="text-xs text-gray-500 font-medium mb-2 inline-flex items-center gap-1">
                    Atacado
                    <InfoTip titulo="Tabelas de atacado">
                      Cinco faixas de preço para clientes diferentes. Deixe em branco as que você não usa —
                      elas não aparecem na hora da venda.
                    </InfoTip>
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {(['A','B','C','D','E'] as const).map(k => (
                      <div key={k}>
                        <Label className="text-xs">Atac. {k}</Label>
                        <Input type="number" min="0" step="0.01" value={atacados[k]}
                          onChange={e => setAtacados(prev => ({ ...prev, [k]: e.target.value }))}
                          className="mt-1 h-9 text-sm" placeholder="0,00" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="inline-flex items-center gap-1">
                  Estoque Atual
                  <InfoTip titulo="Estoque atual">
                    Somente leitura aqui. O saldo muda por produção, venda e ajustes —
                    para corrigir, use Estoque → Produto Acabado.
                  </InfoTip>
                </Label>
                <Input
                  type="number"
                  value={estoqueAtual}
                  readOnly
                  className="mt-1 bg-gray-50 text-gray-400 cursor-not-allowed"
                />
              </div>
              <div>
                <Label className="inline-flex items-center gap-1">
                  Estoque Mínimo
                  <InfoTip titulo="Estoque mínimo">
                    Abaixo desta quantidade o saldo aparece em vermelho nas listagens e entra nos alertas de reposição.
                  </InfoTip>
                </Label>
                <Input type="number" min="0" value={estoqueMin}
                  onChange={e => setEstoqueMin(e.target.value)} className="mt-1" />
              </div>
            </div>

            {/* ── FISCAL ──────────────────────────────────────────────────
                Só o que descreve a mercadoria. Como ela é tributada vem do
                perfil, cadastrado pelo contador em Fiscal > Parametrizacao.
                Campos vazios não impedem operar: impedem apenas emitir nota. */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 inline-flex items-center gap-1">
                Fiscal
                <InfoTip titulo="Classificação fiscal">Preenchida pelo contador — sem ela o produto não entra em nota.</InfoTip>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="inline-flex items-center gap-1">
                    NCM
                    <InfoTip titulo="NCM">Código de 8 dígitos que diz ao fisco o que é a mercadoria.</InfoTip>
                  </Label>
                  <Input value={ncm} onChange={e => setNcm(e.target.value)}
                    placeholder="19022000" maxLength={10} className="mt-1" />
                </div>
                <div>
                  <Label className="inline-flex items-center gap-1">
                    CEST
                    <InfoTip titulo="CEST">Só existe para mercadoria com substituição tributária.</InfoTip>
                  </Label>
                  <Input value={cest} onChange={e => setCest(e.target.value)}
                    maxLength={10} className="mt-1" />
                </div>
                <div>
                  <Label>Origem</Label>
                  <select value={origem} onChange={e => setOrigem(e.target.value)}
                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white">
                    <option value="0">0 — Nacional</option>
                    <option value="1">1 — Importação direta</option>
                    <option value="2">2 — Adquirida no mercado interno, importada</option>
                    <option value="3">3 — Nacional, mais de 40% importado</option>
                    <option value="4">4 — Nacional, processo produtivo básico</option>
                    <option value="5">5 — Nacional, até 40% importado</option>
                    <option value="6">6 — Importação direta, sem similar nacional</option>
                    <option value="7">7 — Mercado interno, sem similar nacional</option>
                    <option value="8">8 — Nacional, mais de 70% importado</option>
                  </select>
                </div>
                <div>
                  <Label className="inline-flex items-center gap-1">
                    Perfil tributário
                    <InfoTip titulo="Perfil tributário">Define CFOP, CSOSN e alíquotas deste produto na nota.</InfoTip>
                  </Label>
                  <select value={perfilTrib} onChange={e => setPerfilTrib(e.target.value)}
                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white">
                    <option value="">— não classificado —</option>
                    {perfisTrib.map((pf: any) => (
                      <option key={pf.perfilTribId} value={pf.perfilTribId}>{pf.nome}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="w-4 h-4 rounded" />
                <span className="text-sm text-gray-700">Produto ativo</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={revenda} onChange={e => setRevenda(e.target.checked)} className="w-4 h-4 rounded" />
                <span className="text-sm text-gray-700 inline-flex items-center gap-1">
                  Produto para revenda
                  <InfoTip titulo="Produto para revenda">
                    Aparece na Compra Rápida e <strong>não</strong> aparece na grade de Produção,
                    porque é comprado pronto. O tipo (ex.: Bebida) é mantido.
                  </InfoTip>
                </span>
              </label>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={insumoAtivo} onChange={e => setInsumoAtivo(e.target.checked)} className="w-4 h-4 rounded" />
              <span className="text-sm text-gray-700 inline-flex items-center gap-1">
                Usar também como insumo em outros produtos
                <InfoTip titulo="Produto usado como insumo">
                  Passa a aparecer na tela de Insumos e nos dropdowns de Ficha Técnica.
                  Ao produzir um produto que o usa, o estoque dele é baixado — os insumos que o
                  compõem só baixam quando você produz este produto.
                </InfoTip>
              </span>
            </label>

            {editando && (
              <AuditoriaInfo
                criadoPor={editando.createdBy}
                criadoEm={editando.createdDt}
                atualizadoPor={editando.updatedBy}
                atualizadoEm={editando.updatedDt}
                className="pt-3 border-t border-gray-100"
              />
            )}

          </div>
        </SidePanel>
      )}

      {/* Ficha técnica — SOMENTE LEITURA.
          A edição (adicionar/remover insumos) fica exclusivamente em
          Cadastros → Fichas Técnicas. */}
      {showFicha && (
        <SidePanel
          titulo="Ficha Técnica"
          subtitulo={`${showFicha.nome} — insumos por unidade produzida`}
          onClose={() => setShowFicha(null)}
          iniciarExpandido
          cabecalho={
            <>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200 rounded-full px-2 py-0.5">
                <Lock size={9} /> somente leitura
              </span>
              <InfoTip titulo="Onde editar">
                Para adicionar, alterar ou remover insumos desta ficha, acesse
                <strong> Cadastros → Fichas Técnicas</strong>.
              </InfoTip>
            </>
          }
          rodape={<Button variant="outline" onClick={() => setShowFicha(null)}>Fechar</Button>}
        >
          <div className="p-6">
            {fichaItens.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                Nenhum insumo na ficha técnica.
              </p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left  text-xs font-medium text-gray-400 px-3 py-2">Insumo</th>
                    <th className="text-right text-xs font-medium text-gray-400 px-3 py-2">Qtd / unidade</th>
                    <th className="text-center text-xs font-medium text-gray-400 px-3 py-2">Unidade</th>
                    <th className="text-right text-xs font-medium text-gray-400 px-3 py-2">Preço Custo</th>
                    <th className="text-right text-xs font-medium text-gray-400 px-3 py-2">Custo da Fração</th>
                  </tr>
                </thead>
                <tbody>
                  {fichaItens.map((item: any) => {
                    const qtd         = parseFloat(String(item.quantidade ?? 0))
                    const precoCustoI = Number(item.precoCusto ?? 0)
                    const custoFracao = qtd * precoCustoI
                    return (
                      <tr key={item.produtoInsumoId ?? item.itemId} className="border-b border-gray-50">
                        <td className="px-3 py-2.5 text-sm font-medium text-gray-900">
                          {item.nomeInsumo ?? item.insumo?.nome ?? `#${item.insumoId}`}
                          {item.ehProduto && <span className="ml-2 text-[10px] bg-gray-100 text-gray-600 border border-gray-200 rounded-full px-1.5 py-0.5">produto</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm text-gray-600">{fmtQtd(item.quantidade)}</td>
                        <td className="px-3 py-2.5 text-center text-sm text-gray-500">{item.unidade}</td>
                        <td className="px-3 py-2.5 text-right text-sm text-gray-600">
                          {precoCustoI ? fmt(precoCustoI) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm font-semibold">
                          {custoFracao > 0 ? <span className="text-gray-700">{fmt(custoFracao)}</span> : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {custoFicha > 0 && (
                  <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                    <tr>
                      <td colSpan={4} className="px-3 py-3 text-sm font-bold text-gray-700 text-right">Custo total / unidade produzida</td>
                      <td className="px-3 py-3 text-right text-base font-bold text-gray-700">{fmt(custoFicha)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}

          </div>
        </SidePanel>
      )}

      {/* Import CSV */}
      {showImport && (
        <ImportacaoModal
          tenantSlug={tenantSlug}
          entidade="produtos"
          queryKey="produtos"
          onClose={() => setShowImport(false)}
        />
      )}

      {/* Confirm desativar */}
      {confirmDelete && (
        <ConfirmModal
          title="Desativar produto"
          message={`Desativar "${confirmDelete.nome}"? O produto some dos formulários mas o histórico de vendas é preservado. Você pode reativar a qualquer momento.`}
          confirmLabel="Desativar"
          danger
          onConfirm={() => { excluirMut.mutate(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}