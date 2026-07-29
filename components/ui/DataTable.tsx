'use client'
import type { ReactNode } from 'react'
import Paginacao from '@/components/ui/Paginacao'

/**
 * components/ui/DataTable.tsx
 *
 * Tabela de listagem padrão. Toda a marcação foi extraída do FornecedoresView:
 * mesmo cartão externo, mesmo cabeçalho, mesma linha com hover, mesmo bloco de
 * paginação. Trocar uma tela por este componente não muda um pixel.
 *
 *   const colunas: Coluna[] = [
 *     { chave: 'nomeCompleto', titulo: 'Nome', principal: true },
 *     { chave: 'tipoPessoa',   titulo: 'Tipo', esconderAte: 'md',
 *       render: i => <Badge variant="secondary">{i.tipoPessoa}</Badge> },
 *     { chave: 'email',        titulo: 'E-mail', esconderAte: 'lg' },
 *   ]
 *
 *   <DataTable
 *     colunas={colunas}
 *     itens={items}
 *     chave={i => i.fornecedorId}
 *     carregando={isLoading}
 *     vazio="Nenhum fornecedor encontrado."
 *     acoes={i => <>...</>}
 *     meta={meta}
 *     onPageChange={setPage}
 *   />
 */

export interface Coluna {
  chave:        string
  titulo:       string
  /** primeira coluna: texto escuro e semibold, como nas telas atuais */
  principal?:   boolean
  /** esconde a coluna abaixo do breakpoint (hidden md:table-cell) */
  esconderAte?: 'md' | 'lg' | 'xl'
  alinhamento?: 'left' | 'center' | 'right'
  largura?:     string
  /** conteúdo customizado da célula; sem isso, mostra item[chave] ou travessão */
  render?:      (item: any) => ReactNode
}

export interface MetaPaginacao {
  page:       number
  totalPages: number
  total:      number
  limit:      number
}

interface Props {
  colunas:       Coluna[]
  itens:         any[]
  chave:         (item: any) => string | number
  carregando?:   boolean
  vazio?:        string
  acoes?:        (item: any) => ReactNode
  meta?:         MetaPaginacao | null
  onPageChange?: (page: number) => void
  /** opcional: com ele, aparece o seletor de registros por página */
  onLimitChange?: (limit: number) => void
  onLinhaClick?: (item: any) => void
  className?:    string
}

const ALINHAMENTO = { left: 'text-left', center: 'text-center', right: 'text-right' }

export function DataTable({
  colunas, itens, chave,
  carregando = false,
  vazio = 'Nenhum registro encontrado.',
  acoes, meta, onPageChange, onLimitChange, onLinhaClick,
  className = '',
}: Props) {
  const totalColunas = colunas.length + (acoes ? 1 : 0)

  function classeVisibilidade(col: Coluna) {
    if (!col.esconderAte) return ''
    return `hidden ${col.esconderAte}:table-cell`
  }

  return (
    <div className={`bg-white rounded-xl border border-gray-100 overflow-hidden ${className}`}>
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100">
            {colunas.map(col => (
              <th
                key={col.chave}
                className={`${ALINHAMENTO[col.alinhamento ?? 'left']} text-xs font-medium text-gray-400 px-4 py-3 ${classeVisibilidade(col)} ${col.largura ?? ''}`}
              >
                {col.titulo}
              </th>
            ))}
            {acoes && <th className="px-4 py-3 w-24" />}
          </tr>
        </thead>

        <tbody>
          {carregando ? (
            <tr>
              <td colSpan={totalColunas} className="px-4 py-12 text-center text-sm text-gray-400">
                Carregando...
              </td>
            </tr>
          ) : itens.length === 0 ? (
            <tr>
              <td colSpan={totalColunas} className="px-4 py-12 text-center text-sm text-gray-400">
                {vazio}
              </td>
            </tr>
          ) : itens.map((item: any) => (
            <tr
              key={chave(item)}
              onClick={onLinhaClick ? () => onLinhaClick(item) : undefined}
              className={`group border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${onLinhaClick ? 'cursor-pointer' : ''}`}
            >
              {colunas.map(col => (
                <td
                  key={col.chave}
                  className={`px-4 py-3 ${ALINHAMENTO[col.alinhamento ?? 'left']} ${
                    col.principal ? 'text-sm font-medium text-gray-900' : 'text-sm text-gray-500'
                  } ${classeVisibilidade(col)}`}
                >
                  {col.render ? col.render(item) : (item?.[col.chave] ?? '—')}
                </td>
              ))}
              {acoes && (
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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