'use client'
// ESTE ARQUIVO VAI EM: components/ui/MarcaEndereco.tsx
//
// DE ONDE VEIO ESTE ENDEREÇO.
//
// O endereço de entrega nasce preenchido com o do cadastro do cliente, e o
// campo é livre. Só que quem entrega não tem como saber se aquilo é o endereço
// da pessoa ou um avulso — "manda para a casa da minha mãe" é rotina — e, uma
// vez sobrescrito, o original se perdia: não havia como voltar sem abrir o
// cadastro em outra aba.
//
// Esta marca resolve os dois: diz a origem e devolve o original em um clique.
// Nada trava e nada exige clique a mais na venda comum.
import { RotateCcw } from 'lucide-react'

interface Props {
  /** Endereço montado a partir do cadastro do cliente. Vazio = sem cadastro. */
  cadastro: string
  /** O que está no campo agora. */
  atual: string
  onRestaurar: (endereco: string) => void
}

/** Monta o endereço do cliente no formato usado em venda, pedido e PDV. */
export function enderecoDoCadastro(c: any): string {
  if (!c?.endereco) return ''
  const numero = c.numero ? `, ${c.numero}` : ''
  const cidade = c.cidade ? ` — ${c.cidade}${c.uf ? '/' + c.uf : ''}` : ''
  return `${c.endereco}${numero}${cidade}`
}

export function MarcaEndereco({ cadastro, atual, onRestaurar }: Props) {
  // Sem cliente, ou cliente sem endereço cadastrado: não há o que comparar.
  if (!cadastro.trim()) return null

  const igual = atual.trim() === cadastro.trim()

  return (
    <p className="mt-1 text-[11px] flex items-center gap-1.5">
      {igual ? (
        <span className="text-gray-400">Endereço do cadastro</span>
      ) : (
        <>
          <span className="font-medium text-amber-600">Endereço avulso</span>
          <button
            type="button"
            onClick={() => onRestaurar(cadastro)}
            title={cadastro}
            className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900 underline underline-offset-2">
            <RotateCcw size={10} /> usar o do cadastro
          </button>
        </>
      )}
    </p>
  )
}

export default MarcaEndereco
