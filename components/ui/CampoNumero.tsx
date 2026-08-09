'use client'
// ESTE ARQUIVO VAI EM: components/ui/CampoNumero.tsx
//
// CAMPO NUMÉRICO QUE DEIXA DIGITAR.
//
// <input type="number"> parece a escolha óbvia e não é. Ele devolve string
// vazia para qualquer conteúdo que o navegador considere inválido — e "1," é
// inválido. Como a vírgula é a tecla decimal do teclado numérico brasileiro,
// o operador digita 1,5 e o campo zera no meio do número.
//
// O segundo defeito é reformatar durante a digitação. Um campo que guarda
// centavos e mostra (valor / 100).toFixed(2) reescreve "1" como "1.00" já no
// primeiro dígito e joga o cursor para o fim: o dígito seguinte cai depois
// dos centavos, e digitar 12,00 vira impossível.
//
// A regra aqui é uma só: enquanto o campo tem foco, quem manda é o que foi
// digitado. O número sai a cada tecla, para o subtotal acompanhar; a
// formatação bonita só volta quando o campo perde o foco.
import { useState, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Valor na unidade que aparece na tela. Para dinheiro, reais — não centavos. */
  valor: number
  onChange: (valor: number) => void
  /** Casas decimais aceitas e exibidas. */
  decimais?: number
  /** Dinheiro: sempre mostra as duas casas. Quantidade: 1 fica "1", não "1,000". */
  fixo?: boolean
}

/** "1.234,56" ou "1234.56" → 1234.56. Vírgula é decimal; ponto vira milhar. */
export function paraNumero(texto: string): number {
  const limpo = String(texto).trim().replace(/\s/g, '')
  if (!limpo) return 0
  const norm = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  const n = parseFloat(norm)
  return Number.isFinite(n) ? n : 0
}

export function CampoNumero({ valor, onChange, decimais = 2, fixo, className, ...resto }: Props) {
  // null = não está sendo digitado; a tela mostra o valor formatado.
  const [rascunho, setRascunho] = useState<string | null>(null)

  const formatado =
    !valor ? '' :
    valor.toLocaleString('pt-BR', {
      minimumFractionDigits: fixo ? decimais : 0,
      maximumFractionDigits: decimais,
    })

  return (
    <input
      {...resto}
      type="text"
      inputMode="decimal"
      value={rascunho ?? formatado}
      onFocus={e => { setRascunho(rascunho ?? formatado); e.currentTarget.select() }}
      onChange={e => {
        // Só o que compõe um número: dígitos, separador e sinal de menos.
        const t = e.target.value.replace(/[^\d.,-]/g, '')
        setRascunho(t)
        onChange(paraNumero(t))
      }}
      onBlur={e => {
        setRascunho(null)
        onChange(paraNumero(e.target.value))
        resto.onBlur?.(e)
      }}
      className={cn('sem-spinner', className)}
    />
  )
}

export default CampoNumero
