'use client'
// components/modules/metas/MetasResumoView.tsx
//
// Tela "Metas" — antes era uma aba dentro de MetasView.tsx, agora é rota
// própria (/metas). "Metas por Produto" foi reconstruído do zero aqui: o
// código antigo salvava certinho (confirmado no banco), mas nunca desenhava
// na tela — em vez de caçar o bug num código que já tinha várias camadas de
// estado emaranhadas com as outras 3 abas, foi mais seguro reescrever esta
// tela sozinha, sem herdar nada.
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Target, TrendingUp, TrendingDown, DollarSign, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/Toast'
import { InfoTip } from '@/components/ui/InfoTip'
import { PageHeader } from '@/components/ui/PageHeader'
import { FormModal } from '@/components/ui/FormModal'
import { fmtMoeda as fmt } from '@/lib/format'
import MesNav, { useMesAno } from './MesNav'

interface Props { tenantSlug: string }
interface ItemMeta { _key: string; produtoId: number; nome: string; quantidade: number }

function ProgressBar({ value, max, invertColor = false }: { value: number; max: number; invertColor?: boolean }) {
  if (max <= 0) return null
  const pct = Math.min(100, (value / max) * 100)
  const cor = invertColor ? (pct > 100 ? '#ef4444' : pct > 80 ? '#f59e0b' : '#2ecc71') : (pct >= 100 ? '#2ecc71' : pct >= 70 ? '#f59e0b' : '#ef4444')
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
      <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: cor }} />
    </div>
  )
}

export default function MetasResumoView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/metas`
  const { mes, ano, navMes } = useMesAno()

  const [showEditMeta, setShowEditMeta] = useState(false)
  const [fReceita, setFReceita] = useState('')
  const [fDespesa, setFDespesa] = useState('')
  const [fLucro, setFLucro]     = useState('')

  const [showEditMetaProduto, setShowEditMetaProduto] = useState(false)
  const [metaProdutoItens, setMetaProdutoItens] = useState<ItemMeta[]>([])

  const { data: dadosRaw } = useQuery({
    queryKey: ['metas', tenantSlug, mes, ano],
    queryFn:  async () => (await fetch(`${api}?mes=${mes}&ano=${ano}`)).json(),
  })

  const { data: metaProdutosRaw, isLoading: carregandoMetaProdutos, isError: erroMetaProdutos } = useQuery({
    queryKey: ['meta-produtos', tenantSlug, mes, ano],
    queryFn:  async () => {
      const res = await fetch(`${api}?tipo=metaProdutos&mes=${mes}&ano=${ano}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message ?? 'Erro ao buscar metas por produto')
      return json
    },
  })

  const { data: produtosRaw } = useQuery({
    queryKey: ['produtos-metas', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/produtos?limit=500`)).json(),
  })

  const dados    = dadosRaw?.data
  const meta     = dados?.meta
  const real     = dados?.real
  const produtos = Array.isArray(produtosRaw?.data?.data) ? produtosRaw.data.data : Array.isArray(produtosRaw?.data) ? produtosRaw.data : []

  // A API devolve um array puro em `data` (ok(lista) → {status, data: lista}).
  const metaProdutos: any[] = Array.isArray(metaProdutosRaw?.data) ? metaProdutosRaw.data : []

  const salvarMetaMut = useMutation({
    mutationFn: () => fetch(api, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mes, ano,
        metaReceita:       fReceita ? Math.round(parseFloat(fReceita.replace(',', '.'))  * 100) : 0,
        metaDespesaMaxima: fDespesa ? Math.round(parseFloat(fDespesa.replace(',', '.'))  * 100) : 0,
        metaLucro:         fLucro   ? Math.round(parseFloat(fLucro.replace(',', '.'))    * 100) : 0,
      }),
    }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['metas', tenantSlug] }); setShowEditMeta(false); toast('Meta salva!') },
    onError:   () => toast('Erro ao salvar meta.', 'error'),
  })

  const salvarMetaProdutoMut = useMutation({
    mutationFn: async () => {
      const itens = metaProdutoItens.filter(i => i.produtoId > 0).map(i => ({ produtoId: i.produtoId, quantidadeMeta: i.quantidade }))
      const res = await fetch(api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'metaProdutos', mes, ano, itens }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message ?? 'Erro ao salvar metas por produto')
      return json
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['meta-produtos', tenantSlug] })
      await qc.refetchQueries({ queryKey: ['meta-produtos', tenantSlug, mes, ano] })
      setShowEditMetaProduto(false)
      toast('Metas por produto salvas!')
    },
    onError: (e: any) => toast(e?.message ?? 'Erro ao salvar metas por produto.', 'error'),
  })

  return (
    <div>
      <PageHeader titulo="Metas" subtitulo={<MesNav mes={mes} ano={ano} onNav={navMes} />} />

      <div className="space-y-4">
        {real && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Receita',  real: real.receita, metaVal: meta?.metaReceita ?? 0,       icon: TrendingUp,   corReal: 'text-green-600', invertColor: false, labelMeta: 'Meta' },
              { label: 'Despesas', real: real.despesa, metaVal: meta?.metaDespesaMaxima ?? 0, icon: TrendingDown, corReal: 'text-red-600',   invertColor: true,  labelMeta: 'Máximo' },
              { label: 'Lucro',    real: real.lucro,   metaVal: meta?.metaLucro ?? 0,         icon: DollarSign,   corReal: real.lucro >= 0 ? 'text-green-600' : 'text-red-600', invertColor: false, labelMeta: 'Meta' },
            ].map((card, i) => {
              const pct = card.metaVal > 0 ? Math.min(100, (card.real / card.metaVal) * 100) : null
              return (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2"><card.icon size={16} className={card.corReal} /><p className="text-sm font-medium text-gray-700">{card.label}</p></div>
                    {pct !== null && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${(!card.invertColor && pct >= 100) || (card.invertColor && pct <= 80) ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{pct.toFixed(0)}%</span>}
                  </div>
                  <p className={`text-2xl font-bold ${card.corReal}`}>{fmt(card.real)}</p>
                  {card.metaVal > 0 ? (
                    <>
                      <p className="text-xs text-gray-400 mt-1">
                        {card.labelMeta}: {fmt(card.metaVal)}
                        {!card.invertColor && card.real < card.metaVal && <span className="ml-2 text-amber-600">faltam {fmt(card.metaVal - card.real)}</span>}
                        {card.invertColor && card.real > card.metaVal && <span className="ml-2 text-red-600">excedido em {fmt(card.real - card.metaVal)}</span>}
                      </p>
                      <ProgressBar value={card.real} max={card.metaVal} invertColor={card.invertColor} />
                    </>
                  ) : <p className="text-xs text-gray-300 mt-2">Meta não definida</p>}
                </div>
              )
            })}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Metas por Produto</p>

          {carregandoMetaProdutos ? (
            <p className="text-sm text-gray-400">Carregando...</p>
          ) : erroMetaProdutos ? (
            <p className="text-sm text-red-500">Não foi possível carregar as metas por produto.</p>
          ) : metaProdutos.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma meta por produto definida para {mes}/{ano}.</p>
          ) : (
            <div className="space-y-3">
              {metaProdutos.map((mp) => {
                const pct = mp.quantidadeMeta > 0 ? Math.min(100, (mp.realizado / mp.quantidadeMeta) * 100) : null
                return (
                  <div key={mp.produtoId}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">{mp.nome}</span>
                      <span className="text-gray-500">{mp.realizado} / {mp.quantidadeMeta} un{pct !== null && <span className={`ml-2 font-bold ${pct >= 100 ? 'text-green-600' : pct >= 70 ? 'text-amber-600' : 'text-red-500'}`}>({pct.toFixed(0)}%)</span>}</span>
                    </div>
                    <ProgressBar value={mp.realizado} max={mp.quantidadeMeta} />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end items-center gap-2">
          <InfoTip titulo="Para que servem as metas">
            Com metas definidas, os cartões acima mostram o quanto do mês já foi cumprido.
            O <strong>Simulador</strong> projeta receita e lucro antes de fechar o mês, e a
            <strong> Previsão de Produção</strong> calcula quanto produzir no próximo.
          </InfoTip>
          <Button variant="outline" onClick={() => {
            setMetaProdutoItens(
              metaProdutos.length > 0
                ? metaProdutos.map((mp) => ({ _key: String(mp.produtoId), produtoId: mp.produtoId, nome: mp.nome, quantidade: mp.quantidadeMeta }))
                : [{ _key: '1', produtoId: 0, nome: '', quantidade: 1 }]
            )
            setShowEditMetaProduto(true)
          }}><Plus size={14} className="mr-1.5" /> Metas por Produto</Button>
          <Button onClick={() => {
            setFReceita(meta?.metaReceita ? (meta.metaReceita / 100).toFixed(2) : '')
            setFDespesa(meta?.metaDespesaMaxima ? (meta.metaDespesaMaxima / 100).toFixed(2) : '')
            setFLucro(meta?.metaLucro ? (meta.metaLucro / 100).toFixed(2) : '')
            setShowEditMeta(true)
          }}><Target size={14} className="mr-1.5" /> Definir Metas</Button>
        </div>
      </div>

      {showEditMeta && (
        <FormModal
          titulo={`Metas de ${mes}/${ano}`}
          onClose={() => setShowEditMeta(false)}
          largura="max-w-sm"
          cabecalho={
            <InfoTip titulo="Campos opcionais">
              Deixe em branco a meta que você não quer monitorar — ela deixa de aparecer
              nos cartões de acompanhamento.
            </InfoTip>
          }
        >
          <div className="p-6 space-y-4">
            <div><Label>Meta de Receita (R$)</Label><Input type="number" min="0" step="0.01" value={fReceita} onChange={e => setFReceita(e.target.value)} className="mt-1" placeholder="Ex: 30000,00" autoFocus /></div>
            <div><Label>Despesa Máxima (R$)</Label><Input type="number" min="0" step="0.01" value={fDespesa} onChange={e => setFDespesa(e.target.value)} className="mt-1" placeholder="Ex: 8000,00" /></div>
            <div><Label>Meta de Lucro (R$)</Label><Input type="number" min="0" step="0.01" value={fLucro} onChange={e => setFLucro(e.target.value)} className="mt-1" placeholder="Ex: 15000,00" /></div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowEditMeta(false)}>Cancelar</Button>
              <Button onClick={() => salvarMetaMut.mutate()} disabled={salvarMetaMut.isPending}>{salvarMetaMut.isPending ? 'Salvando...' : 'Salvar Metas'}</Button>
            </div>
          </div>
        </FormModal>
      )}

      {showEditMetaProduto && (
        <FormModal
          titulo={`Metas por Produto — ${mes}/${ano}`}
          onClose={() => setShowEditMetaProduto(false)}
          largura="max-w-md"
          cabecalho={
            <InfoTip titulo="Como funciona">
              Defina quantas unidades de cada produto você quer vender no mês. Deixar em
              0 remove o produto do acompanhamento.
            </InfoTip>
          }
        >
          <div className="p-6 space-y-4">
            <div className="space-y-2.5">
              {metaProdutoItens.map(item => (
                <div key={item._key} className="flex items-center gap-2">
                  <select value={item.produtoId}
                    onChange={e => { const p = produtos.find((p: any) => p.produtoId === Number(e.target.value)); setMetaProdutoItens(prev => prev.map(it => it._key === item._key ? { ...it, produtoId: Number(e.target.value), nome: p?.nome ?? '' } : it)) }}
                    className="flex-1 h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                    <option value={0}>Selecionar produto...</option>
                    {produtos.map((p: any) => <option key={p.produtoId} value={p.produtoId}>{p.nome}</option>)}
                  </select>
                  <Input type="number" min="0" value={item.quantidade}
                    onChange={e => setMetaProdutoItens(prev => prev.map(it => it._key === item._key ? { ...it, quantidade: Number(e.target.value) || 0 } : it))}
                    className="h-9 text-sm text-center w-20" placeholder="Qtd" />
                  <button onClick={() => setMetaProdutoItens(prev => prev.filter(it => it._key !== item._key))} className="text-gray-300 hover:text-red-500">×</button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => setMetaProdutoItens(prev => [...prev, { _key: Date.now().toString(), produtoId: 0, nome: '', quantidade: 1 }])}>
              <Plus size={13} className="mr-1" /> Produto
            </Button>
            {metaProdutoItens.some(i => i.produtoId === 0) && (
              <p className="text-xs text-amber-600">
                Tem linha sem produto selecionado — ela não é salva. Escolha um produto no dropdown ou remova a linha.
              </p>
            )}
            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <Button variant="outline" onClick={() => setShowEditMetaProduto(false)}>Cancelar</Button>
              <Button onClick={() => salvarMetaProdutoMut.mutate()} disabled={salvarMetaProdutoMut.isPending}>{salvarMetaProdutoMut.isPending ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </div>
        </FormModal>
      )}
    </div>
  )
}
