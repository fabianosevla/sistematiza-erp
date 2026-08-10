'use client'
import { useState, useRef, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Filter, X as XIcon, ArrowUpDown } from 'lucide-react'
import Paginacao from '@/components/ui/Paginacao'
import { TableSkeleton } from '@/components/ui/Skeleton'

/**
 * components/ui/DataTable.tsx
 *
 * Tabela de listagem padrão. Toda a marcação foi extraída das telas existentes
 * (Fornecedores, Clientes, Insumos): mesmo cartão, mesmo cabeçalho, mesma linha
 * com hover, mesma ordenação, mesma paginação. Trocar uma tela por este
 * componente não muda um pixel.
 *
 *   const colunas: Coluna[] = [
 *     { chave: 'nome', titulo: 'Nome', principal: true, ordenavel: true },
 *     { chave: 'tipo', titulo: 'Tipo', esconderAte: 'md',
 *       render: i => <Badge variant="secondary">{i.tipo}</Badge> },
 *   ]
 *
 *   <DataTable
 *     colunas={colunas}
 *     itens={itens}
 *     chave={i => i.id}
 *     carregando={isLoading}
 *     usarSkeleton
 *     vazio={<EmptyState ... />}
 *     ordem={{ chave: sortKey, dir: sortDir }}
 *     onOrdenar={toggleSort}
 *     acoes={i => <>...</>}
 *     meta={meta}
 *     onPageChange={setPage}
 *     onLimitChange={setLimit}
 *   />
 */

export interface Coluna {
  chave:            string
  titulo:           string
  /** primeira coluna: texto escuro e semibold */
  principal?:       boolean
  /** esconde abaixo do breakpoint (hidden md:table-cell) */
  esconderAte?:     'md' | 'lg' | 'xl'
  alinhamento?:     'left' | 'center' | 'right'
  largura?:         string
  /** habilita clique no cabeçalho para ordenar */
  ordenavel?:       boolean
  /** classes extras da célula (sobrescreve o padrão de cor/tamanho) */
  classeCelula?:    string
  classeCabecalho?: string
  /** conteúdo ao lado do título — normalmente um InfoTip explicando a coluna */
  cabecalho?:       ReactNode
  /** mostra o funil no cabeçalho e abre a busca de valores daquela coluna */
  filtravel?:       boolean
  /** conteúdo customizado; sem isso, mostra item[chave] ou travessão */
  render?:          (item: any) => ReactNode
}

export interface MetaPaginacao {
  page:       number
  totalPages: number
  total:      number
  limit:      number
}

export interface Ordem {
  chave: string
  dir:   'asc' | 'desc'
}

interface Props {
  colunas:        Coluna[]
  itens:          any[]
  chave:          (item: any) => string | number
  /** barra fina acima da tabela: filtros, ordenação, exportar */
  ferramentas?:   ReactNode
  carregando?:    boolean
  /** usa TableSkeleton no lugar do texto "Carregando..." */
  usarSkeleton?:  boolean
  /** texto ou componente (ex.: <EmptyState/>) quando não há itens */
  vazio?:         ReactNode
  acoes?:         (item: any) => ReactNode
  /** alinhamento da coluna de ações: à direita (padrão) ou centro */
  acoesCentro?:   boolean
  /** valor ativo de cada filtro de coluna: { chave: valor } */
  filtros?:       Record<string, string>
  /** chamado ao escolher ou limpar um filtro; valor vazio significa limpar */
  onFiltrar?:     (chave: string, valor: string) => void
  /** valores disponíveis por coluna, calculados sobre o conjunto SEM filtro */
  opcoesFiltro?:  Record<string, string[]>
  meta?:          MetaPaginacao | null
  onPageChange?:  (page: number) => void
  onLimitChange?: (limit: number) => void
  ordem?:         Ordem
  onOrdenar?:     (chave: string) => void
  onLinhaClick?:  (item: any) => void
  classeLinha?:   (item: any) => string
  className?:     string
  /**
   * Altura maxima da area que rola. O desconto cobre cabecalho da pagina,
   * busca e paginacao. Telas com mais coisas acima da grade podem aumentar.
   */
  alturaMax?:     string
}

/**
 * FILTRO DE COLUNA.
 *
 * O funil aparece no cabeçalho da coluna marcada como `filtravel`. Abre uma
 * caixinha com busca livre e a lista de valores que existem de fato naquela
 * coluna — o operador digita ou clica, sem precisar saber a grafia exata.
 *
 * As opções vêm do conjunto SEM filtro (via `opcoesFiltro`). Se viessem dos
 * itens já filtrados, escolher "PIX" apagaria as outras formas da lista e não
 * daria mais para trocar de escolha sem limpar antes.
 */
function FiltroColuna({
  titulo, valor, opcoes, onEscolher,
}: {
  titulo: string
  valor: string
  opcoes: string[]
  onEscolher: (v: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca]   = useState('')
  const [pos, setPos]       = useState<{ top: number; left: number } | null>(null)
  const btnRef   = useRef<HTMLButtonElement>(null)
  const painelRef = useRef<HTMLDivElement>(null)

  // POR QUE PORTAL, E NÃO UM DIV ABSOLUTO AO LADO DO BOTÃO.
  //
  // O cabeçalho vive dentro do contêiner que rola (é o que faz o `sticky top-0`
  // funcionar). Um popover posicionado por `absolute` fica preso a esse
  // contêiner: com a tabela baixa, ele era cortado na borda e o "Limpar filtro"
  // sumia embaixo. Renderizando no body com `position: fixed`, a caixa flutua
  // sobre a página inteira e não depende da altura da grade.
  function abrir() {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const largura = 240
    // Não deixa passar da borda direita da janela.
    const left = Math.min(r.left, window.innerWidth - largura - 12)
    setPos({ top: r.bottom + 6, left: Math.max(12, left) })
    setAberto(true)
  }

  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      const alvo = e.target as Node
      if (painelRef.current?.contains(alvo) || btnRef.current?.contains(alvo)) return
      setAberto(false)
    }
    function esc(e: KeyboardEvent) { if (e.key === 'Escape') setAberto(false) }
    function fecha() { setAberto(false) }

    // ROLAR A PÁGINA FECHA. ROLAR A LISTA, NÃO.
    //
    // A caixa é `fixed` e posicionada a partir do botão: se a página rolar,
    // o botão sai do lugar e ela ficaria flutuando solta. Daí o ouvinte.
    //
    // Mas ele estava em modo de captura, e capturava também a rolagem DE
    // DENTRO da própria lista — descer a barra para achar o produto fechava
    // o filtro na cara de quem estava escolhendo. Era o bug reaberto pela QA.
    //
    // Agora a origem do evento decide: veio de dentro do painel, é navegação
    // na lista e não se mexe.
    function aoRolar(e: Event) {
      if (painelRef.current?.contains(e.target as Node)) return
      setAberto(false)
    }

    document.addEventListener('mousedown', fora)
    window.addEventListener('keydown', esc)
    window.addEventListener('resize', fecha)
    window.addEventListener('scroll', aoRolar, true)
    return () => {
      document.removeEventListener('mousedown', fora)
      window.removeEventListener('keydown', esc)
      window.removeEventListener('resize', fecha)
      window.removeEventListener('scroll', aoRolar, true)
    }
  }, [aberto])

  const ativo = !!valor
  const lista = opcoes
    .filter(o => o.toLowerCase().includes(busca.trim().toLowerCase()))
    .slice(0, 100)

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={e => { e.stopPropagation(); aberto ? setAberto(false) : abrir() }}
        title={ativo ? `Filtrando por "${valor}"` : `Filtrar ${titulo}`}
        className={`ml-1 inline-flex items-center justify-center w-5 h-5 rounded transition-colors align-middle ${
          ativo ? 'bg-green-100 text-green-700' : 'text-gray-300 hover:text-gray-600 hover:bg-gray-100'
        }`}
      >
        <Filter size={11} />
      </button>

      {aberto && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={painelRef}
          onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 240 }}
          className="z-[100] bg-white rounded-xl border border-gray-200 shadow-xl normal-case tracking-normal"
        >
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={busca}
              onChange={e => setBusca(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && busca.trim()) { onEscolher(busca.trim()); setAberto(false) }
              }}
              placeholder={`Buscar ${titulo.toLowerCase()}...`}
              className="w-full h-8 px-2 rounded-lg border border-gray-200 text-[13px] font-normal text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-200"
            />
            {/* Limpar fica NO TOPO, junto do campo. Antes vivia no rodapé da
                lista: com muitos valores era preciso rolar até o fim para
                achar a saída. */}
            {ativo && (
              <button
                onClick={() => { onEscolher(''); setBusca(''); setAberto(false) }}
                className="mt-1.5 w-full h-7 flex items-center justify-center gap-1 rounded-lg text-[12px] font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <XIcon size={11} /> Limpar filtro
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto p-1">
            {lista.length === 0 ? (
              <p className="px-2 py-3 text-[12px] font-normal text-gray-400 text-center">Nenhum valor</p>
            ) : lista.map(o => (
              <button
                key={o}
                onClick={() => { onEscolher(o); setAberto(false) }}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-[13px] font-normal truncate transition-colors ${
                  o === valor ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

const ALINHAMENTO = { left: 'text-left', center: 'text-center', right: 'text-right' }

export function DataTable({
  colunas, itens, chave,
  ferramentas,
  carregando = false,
  usarSkeleton = false,
  vazio = 'Nenhum registro encontrado.',
  acoes, acoesCentro = false,
  filtros, onFiltrar, opcoesFiltro,
  meta, onPageChange, onLimitChange,
  ordem, onOrdenar,
  onLinhaClick, classeLinha,
  className = '',
  alturaMax = 'calc(100vh - 330px)',
}: Props) {
  const totalColunas = colunas.length + (acoes ? 1 : 0)

  function visibilidade(col: Coluna) {
    return col.esconderAte ? `hidden ${col.esconderAte}:table-cell` : ''
  }

  function IconeOrdem({ col }: { col: string }) {
    if (!ordem || ordem.chave !== col) {
      return <ArrowUpDown size={11} className="ml-1 text-gray-300 inline" />
    }
    return <span className="ml-1 text-green-500 text-[11px] inline">{ordem.dir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${className}`}>
      {/* Barra fina de ferramentas — filtros e ordenação ficam aqui, acima da grade */}
      {ferramentas && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100">
          {ferramentas}
        </div>
      )}

      {/* CABECALHO CONGELADO
          A rolagem vertical acontece AQUI DENTRO, nao na pagina. E isso que
          faz o `sticky top-0` funcionar: ele gruda no conteiner que rola. Se
          quem rolasse fosse a janela, o cabecalho subiria com as linhas.
          A linha de baixo e sombra, nao borda: borda em celula fixa some ao
          rolar em alguns navegadores. */}
      <div className="overflow-auto" style={{ maxHeight: alturaMax, minHeight: '160px' }}>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50">
            {colunas.map(col => {
              const podeOrdenar = col.ordenavel && onOrdenar
              return (
                <th
                  key={col.chave}
                  onClick={podeOrdenar ? () => onOrdenar!(col.chave) : undefined}
                  className={`sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] ${ALINHAMENTO[col.alinhamento ?? 'left']} text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-2.5 ${visibilidade(col)} ${col.largura ?? ''} ${
                    podeOrdenar ? 'cursor-pointer select-none hover:text-gray-700' : ''
                  } ${col.classeCabecalho ?? ''}`}
                >
                  {col.titulo}
                  {col.cabecalho && (
                    <span className="ml-1 inline-block align-middle normal-case tracking-normal font-normal">
                      {col.cabecalho}
                    </span>
                  )}
                  {col.ordenavel && <IconeOrdem col={col.chave} />}
                  {col.filtravel && onFiltrar && (
                    <FiltroColuna
                      titulo={col.titulo}
                      valor={filtros?.[col.chave] ?? ''}
                      opcoes={opcoesFiltro?.[col.chave] ?? []}
                      onEscolher={v => onFiltrar(col.chave, v)}
                    />
                  )}
                </th>
              )
            })}
            {acoes && <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] px-4 py-2.5 w-24" />}
          </tr>
        </thead>

        <tbody>
          {carregando ? (
            usarSkeleton ? (
              <TableSkeleton rows={6} cols={totalColunas} />
            ) : (
              <tr>
                <td colSpan={totalColunas} className="px-4 py-12 text-center text-sm text-gray-400">
                  Carregando...
                </td>
              </tr>
            )
          ) : itens.length === 0 ? (
            <tr>
              <td colSpan={totalColunas} className={typeof vazio === 'string' ? 'px-4 py-12 text-center text-sm text-gray-400' : ''}>
                {vazio}
              </td>
            </tr>
          ) : itens.map((item: any) => (
            <tr
              key={chave(item)}
              onClick={onLinhaClick ? () => onLinhaClick(item) : undefined}
              className={`group border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${
                onLinhaClick ? 'cursor-pointer' : ''
              } ${classeLinha ? classeLinha(item) : ''}`}
            >
              {colunas.map(col => (
                <td
                  key={col.chave}
                  className={col.classeCelula ?? `px-4 py-3 ${ALINHAMENTO[col.alinhamento ?? 'left']} ${
                    col.principal ? 'text-sm font-medium text-gray-900' : 'text-sm text-gray-500'
                  } ${visibilidade(col)}`}
                >
                  {col.render ? col.render(item) : (item?.[col.chave] ?? '—')}
                </td>
              ))}
              {acoes && (
                <td className="px-4 py-3">
                  <div className={`flex items-center ${acoesCentro ? 'justify-center' : 'justify-end'} gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                    {acoes(item)}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        </table>
      </div>

      {/* Paginação fica FORA da area que rola: sumir ao rolar seria perder a
          referencia de quantos registros existem. */}
      {meta && onPageChange && (
        <Paginacao
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          limit={meta.limit}
          onPage={onPageChange}
          onLimit={onLimitChange}
          className="px-4 mt-0 border-t border-gray-100"
        />
      )}
    </div>
  )
}

export default DataTable