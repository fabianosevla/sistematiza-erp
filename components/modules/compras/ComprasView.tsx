'use client'
// ESTE ARQUIVO VAI EM: components/modules/compras/ComprasView.tsx
//
// COMPRAS TEM DUAS FRENTES (cartão QA #123).
//
// Toda compra da loja passa por aqui: o presunto e a caixinha (insumos, que
// entram no estoque) e a fita crepe do dia a dia (despesa, que não entra).
// Antes a despesa só podia ser lançada no Financeiro, e quem comprava tinha
// que saber em qual tela cada coisa morava. A aba Despesas é a mesma tela
// que existia no Financeiro, trazida para cá; o Financeiro ficou com DRE,
// gastos fixos, contas a pagar/receber e caixa.
import { useState } from 'react'
import CompraRapidaView from '@/components/modules/compras/CompraRapidaView'
import FinanceiroView from '@/components/modules/financeiro/FinanceiroView'

interface Props { tenantSlug: string }

type Aba = 'insumos' | 'despesas'

const ABAS: { key: Aba; label: string }[] = [
  { key: 'insumos',  label: 'Compras de insumos'  },
  { key: 'despesas', label: 'Compras de despesas' },
]

export default function ComprasView({ tenantSlug }: Props) {
  const [aba, setAba] = useState<Aba>('insumos')

  return (
    <div>
      <div className="border-b border-gray-100 mb-6 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {ABAS.map(a => (
            <button key={a.key} onClick={() => setAba(a.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                aba === a.key ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {aba === 'insumos'
        ? <CompraRapidaView tenantSlug={tenantSlug} />
        : <FinanceiroView tenantSlug={tenantSlug} somenteDespesas />}
    </div>
  )
}
