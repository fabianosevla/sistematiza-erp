'use client'
import type { ReactNode } from 'react'

/**
 * components/ui/PageHeader.tsx
 *
 * Cabeçalho de tela. Título em 21px semibold com tracking negativo, etiqueta
 * opcional ao lado, ações pequenas à direita. Mesma assinatura de props.
 *
 *   <PageHeader
 *     titulo="Fornecedores"
 *     tag={<Tag>46</Tag>}
 *     acoes={<Button size="sm">Novo</Button>}
 *   />
 *
 * A prop `subtitulo` continua existindo para casos em que ela carrega
 * controle (o navegador de mês do Metas, por exemplo) — não para texto
 * explicativo, que agora vive em InfoTip.
 */
interface Props {
  titulo:     string
  tag?:       ReactNode
  subtitulo?: ReactNode
  acoes?:     ReactNode
  className?: string
}

export function PageHeader({ titulo, tag, subtitulo, acoes, className = '' }: Props) {
  return (
    <div className={`flex items-start justify-between gap-4 mb-5 ${className}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-[21px] font-semibold text-gray-900 tracking-tighter">{titulo}</h1>
          {tag}
        </div>
        {subtitulo !== undefined && subtitulo !== null && subtitulo !== '' && (
          <div className="mt-1.5">{subtitulo}</div>
        )}
      </div>
      {acoes && <div className="flex items-center gap-2 flex-shrink-0">{acoes}</div>}
    </div>
  )
}

export default PageHeader
