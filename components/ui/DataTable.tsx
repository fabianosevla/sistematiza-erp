'use client'
import type { ReactNode } from 'react'
import { ArrowUpDown } from 'lucide-react'
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
  meta?:          MetaPaginacao | null
  onPageChange?:  (page: number) => void
  onLimitChange?: (limit: number) => void
  ordem?:         Ordem
  onOrdenar?:     (chave: string) => void
  onLinhaClick?:  (item: any) => void
  classeLinha?:   (item: any) => string
  className?:     string
}

const ALINHAMENTO = { left: 'text-left', center: 'text-center', right: 'text-right' }

export function DataTable({
  colunas, itens, chave,
  ferramentas,
  carregando = false,
  usarSkeleton = false,
  vazio = 'Nenhum registro encontrado.',
  acoes, acoesCentro = false,
  meta, onPageChange, onLimitChange,
  ordem, onOrdenar,
  onLinhaClick, classeLinha,
  className = '',
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

      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/70">
            {colunas.map(col => {
              const podeOrdenar = col.ordenavel && onOrdenar
              return (
                <th
                  key={col.chave}
                  onClick={podeOrdenar ? () => onOrdenar!(col.chave) : undefined}
                  className={`${ALINHAMENTO[col.alinhamento ?? 'left']} text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-2.5 ${visibilidade(col)} ${col.largura ?? ''} ${
                    podeOrdenar ? 'cursor-pointer select-none hover:text-gray-700' : ''
                  } ${col.classeCabecalho ?? ''}`}
                >
                  {col.titulo}
                  {col.ordenavel && <IconeOrdem col={col.chave} />}
                </th>
              )
            })}
            {acoes && <th className="px-4 py-2.5 w-24" />}
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

      {/* Paginação: usa o componente que o projeto já tem, para não existirem
          duas paginações diferentes. mt-0 porque aqui ela fica dentro do cartão. */}
      {meta && onPageChange && (
        <Paginacao
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          limit={meta.limit}
          onPage={onPageChange}
          onLimit={onLimitChange}
          className="px-4 mt-0"
        />
      )}
    </div>
  )
}

export default DataTable