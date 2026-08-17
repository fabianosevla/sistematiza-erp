'use client'
// Cabeçalho de navegação de mês, compartilhado pelas 4 telas de Metas &
// Simulador (Metas, Simulador, Previsão de Produção, Evolução) — cada uma
// é sua própria rota agora, então cada uma tem seu próprio estado de mês.
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

interface Props {
  mes: number
  ano: number
  onNav: (delta: number) => void
}

export default function MesNav({ mes, ano, onNav }: Props) {
  const now = new Date()
  const eMesAtual = mes === now.getMonth() + 1 && ano === now.getFullYear()
  return (
    <span className="flex items-center gap-2">
      <button onClick={() => onNav(-1)} className="p-0.5 text-gray-400 hover:text-gray-700"><ChevronLeft size={16} /></button>
      <span className="text-sm font-semibold text-gray-700 min-w-36 text-center">
        {MESES[mes - 1]} {ano}
        {eMesAtual && <span className="ml-2 text-xs font-normal text-green-600 bg-green-50 px-1.5 py-0.5 rounded">mês atual</span>}
      </span>
      <button onClick={() => onNav(1)} className="p-0.5 text-gray-400 hover:text-gray-700"><ChevronRight size={16} /></button>
    </span>
  )
}

export { MESES }

export function useMesAno() {
  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [ano, setAno] = useState(now.getFullYear())
  function navMes(d: number) {
    let m = mes + d, a = ano
    if (m > 12) { m = 1; a++ }
    if (m < 1)  { m = 12; a-- }
    setMes(m); setAno(a)
  }
  return { mes, ano, navMes }
}
