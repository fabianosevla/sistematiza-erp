import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * components/ui/badge.tsx
 *
 * Alinhado ao Tag: fundo claro, borda da mesma família, texto pequeno.
 * Serve para status e classificações dentro de tabelas e cartões.
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
  {
    variants: {
      variant: {
        default:     'bg-green-50 text-green-700 border-green-200',
        secondary:   'bg-gray-50 text-gray-600 border-gray-200',
        destructive: 'bg-red-50 text-red-600 border-red-200',
        warning:     'bg-amber-50 text-amber-700 border-amber-200',
        outline:     'bg-white border-gray-200 text-gray-500',
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