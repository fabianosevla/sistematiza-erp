import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * components/ui/button.tsx
 *
 * Botões menores e em tom suave. O padrão do sistema passa a ser o verde
 * claro com texto verde escuro — sólido fica reservado para a ação principal
 * de uma tela (finalizar venda, confirmar entrada), via variant="solid".
 *
 *   <Button>Novo cliente</Button>              → suave (padrão)
 *   <Button variant="solid">Finalizar</Button> → cheio, para o CTA principal
 *   <Button variant="outline">Cancelar</Button>
 *   <Button variant="ghost" size="icon">…</Button>
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-200 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Suave: fundo claro, texto da mesma família, borda discreta
        default:     'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100',
        // Cheio: só para a ação principal da tela
        solid:       'bg-green-500 text-white hover:bg-green-600 font-semibold',
        destructive: 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100',
        outline:     'border border-gray-200 bg-white hover:bg-gray-50 text-gray-600',
        secondary:   'bg-gray-100 text-gray-700 hover:bg-gray-200',
        ghost:       'hover:bg-gray-100 text-gray-600',
        link:        'text-green-600 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-3',
        sm:      'h-7 rounded-md px-2.5 text-xs',
        lg:      'h-9 rounded-lg px-5',
        icon:    'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }