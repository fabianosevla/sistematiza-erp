'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Search, LayoutDashboard, Users, Package, ShoppingCart, DollarSign, Boxes, Factory, FileText, ClipboardList, Target, X, ArrowRight, User } from 'lucide-react'

interface Props { tenantSlug: string; open: boolean; onClose: () => void }

interface ResultItem {
  id:       string
  label:    string
  sub?:     string
  href:     string
  icon:     any
  categoria: string
}

function ROTAS(slug: string): ResultItem[] {
  const base = `/${slug}`
  return [
    { id: 'dash',     label: 'Dashboard',        href: base,                                   icon: LayoutDashboard, categoria: 'Navegação' },
    { id: 'clientes', label: 'Clientes',          href: `${base}/cadastros/clientes`,           icon: Users,           categoria: 'Navegação' },
    { id: 'produtos', label: 'Produtos',          href: `${base}/cadastros/produtos`,           icon: Package,         categoria: 'Navegação' },
    { id: 'insumos',  label: 'Insumos',           href: `${base}/cadastros/insumos`,            icon: Package,         categoria: 'Navegação' },
    { id: 'ficha',    label: 'Fichas Técnicas',   href: `${base}/cadastros/ficha-tecnica`,      icon: FileText,        categoria: 'Navegação' },
    { id: 'dom',      label: 'Domínios',          href: `${base}/cadastros/dominios`,           icon: FileText,        categoria: 'Navegação' },
    { id: 'vendas',   label: 'Vendas',            href: `${base}/vendas`,                      icon: ShoppingCart,    categoria: 'Navegação' },
    { id: 'fin',      label: 'Financeiro',        href: `${base}/financeiro`,                  icon: DollarSign,      categoria: 'Navegação' },
    { id: 'estoque',  label: 'Estoque',           href: `${base}/estoque`,                     icon: Boxes,           categoria: 'Navegação' },
    { id: 'prod',     label: 'Produção',          href: `${base}/producao`,                    icon: Factory,         categoria: 'Navegação' },
    { id: 'pedidos',  label: 'Pedidos',           href: `${base}/pedidos`,                     icon: ClipboardList,   categoria: 'Navegação' },
    { id: 'metas',    label: 'Metas & Simulador', href: `${base}/metas`,                       icon: Target,          categoria: 'Navegação' },
  ]
}

export default function CommandPalette({ tenantSlug, open, onClose }: Props) {
  const router        = useRef(useRouter())
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef      = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) { setQuery(''); setSelected(0); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  const rotas = ROTAS(tenantSlug)

  const { data: produtosData } = useQuery({
    queryKey: ['cmd-produtos', tenantSlug, query],
    queryFn:  async () => {
      if (query.length < 2) return { data: { data: [] } }
      return (await fetch(`/api/${tenantSlug}/cadastros/produtos?busca=${encodeURIComponent(query)}&limit=4`)).json()
    },
    enabled: query.length >= 2,
  })

  const { data: clientesData } = useQuery({
    queryKey: ['cmd-clientes', tenantSlug, query],
    queryFn:  async () => {
      if (query.length < 2) return { data: { data: [] } }
      return (await fetch(`/api/${tenantSlug}/cadastros/clientes?busca=${encodeURIComponent(query)}&limit=4`)).json()
    },
    enabled: query.length >= 2,
  })

  // Filtra rotas por query
  const rotasFiltradas = query
    ? rotas.filter(r => r.label.toLowerCase().includes(query.toLowerCase()))
    : rotas.slice(0, 6)

  const prodFiltrados: ResultItem[] = (
    Array.isArray(produtosData?.data?.data) ? produtosData.data.data
    : Array.isArray(produtosData?.data) ? produtosData.data : []
  ).map((p: any) => ({
    id: `p_${p.produtoId}`, label: p.nome, sub: p.tipo ?? 'Produto',
    href: `/${tenantSlug}/cadastros/produtos`, icon: Package, categoria: 'Produtos',
  }))

  const clientesFiltrados: ResultItem[] = (
    Array.isArray(clientesData?.data?.data) ? clientesData.data.data
    : Array.isArray(clientesData?.data) ? clientesData.data : []
  ).map((c: any) => ({
    id: `c_${c.clienteId}`, label: c.nomeCompleto, sub: c.documento ?? 'Cliente',
    href: `/${tenantSlug}/cadastros/clientes`, icon: User, categoria: 'Clientes',
  }))

  const todosResultados = [...rotasFiltradas, ...prodFiltrados, ...clientesFiltrados]

  function navegar(item: ResultItem) {
    router.current.push(item.href)
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, todosResultados.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
      if (e.key === 'Enter' && todosResultados[selected]) navegar(todosResultados[selected])
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, selected, todosResultados])

  if (!open) return null

  // Agrupa por categoria
  const grupos: Record<string, ResultItem[]> = {}
  for (const item of todosResultados) {
    if (!grupos[item.categoria]) grupos[item.categoria] = []
    grupos[item.categoria].push(item)
  }

  let globalIdx = 0

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center pt-[15vh]" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          <Search size={18} className="text-gray-400 flex-shrink-0" />
          <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setSelected(0) }}
            placeholder="Buscar páginas, produtos, clientes..."
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent" />
          {query && <button onClick={() => setQuery('')} className="text-gray-300 hover:text-gray-500"><X size={15} /></button>}
          <kbd className="hidden sm:flex items-center gap-1 px-2 py-0.5 text-[10px] text-gray-400 bg-gray-100 rounded border border-gray-200">ESC</kbd>
        </div>

        {/* Resultados */}
        <div className="max-h-80 overflow-y-auto py-2">
          {todosResultados.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">Nenhum resultado encontrado</div>
          ) : (
            Object.entries(grupos).map(([cat, itens]) => (
              <div key={cat}>
                <p className="px-4 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{cat}</p>
                {itens.map(item => {
                  const idx = globalIdx++
                  const isActive = selected === idx
                  return (
                    <button key={item.id} onClick={() => navegar(item)}
                      onMouseEnter={() => setSelected(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-green-100' : 'bg-gray-100'}`}>
                        <item.icon size={14} className={isActive ? 'text-green-600' : 'text-gray-500'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isActive ? 'text-green-700' : 'text-gray-800'}`}>{item.label}</p>
                        {item.sub && <p className="text-xs text-gray-400 truncate">{item.sub}</p>}
                      </div>
                      {isActive && <ArrowRight size={14} className="text-green-500 flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
          <span className="text-[10px] text-gray-400 flex items-center gap-1"><kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[9px]">↑↓</kbd> navegar</span>
          <span className="text-[10px] text-gray-400 flex items-center gap-1"><kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[9px]">↵</kbd> abrir</span>
          <span className="text-[10px] text-gray-400 flex items-center gap-1"><kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[9px]">Ctrl K</kbd> toggle</span>
        </div>
      </div>
    </div>
  )
}