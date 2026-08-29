import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * components/ui/input.tsx
 *
 * Campo hairline: borda clara, fundo branco, foco em anel fino verde.
 * Altura acompanha o botão padrão (h-8) para que formulário e barra de ações
 * fiquem alinhados.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-8 w-full rounded-lg border border-gray-200 bg-white px-3 py-1 text-[13px] text-gray-900 placeholder:text-gray-400',
          'focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-50',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
