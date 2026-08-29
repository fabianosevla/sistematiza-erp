import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * components/ui/badge.tsx
 *
 * Selo sem borda: fundo claro e texto escuro da mesma família. A borda saiu
 * porque, repetida em toda linha de tabela, ela criava um serrilhado de
 * caixinhas; só o fundo já separa o selo do texto ao lado.
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
  {
    variants: {
      variant: {
        default:     'bg-green-50 text-green-700',
        secondary:   'bg-gray-100 text-gray-600',
        destructive: 'bg-red-50 text-red-600',
        warning:     'bg-amber-50 text-amber-700',
        outline:     'bg-white border border-gray-200 text-gray-500',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
