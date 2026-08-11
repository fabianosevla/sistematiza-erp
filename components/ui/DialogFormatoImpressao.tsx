'use client'
// ESTE ARQUIVO VAI EM: components/ui/DialogFormatoImpressao.tsx
//
// Escolha de formato para documentos que podem sair tanto em A4 quanto na
// térmica do PDV — hoje só o descritivo de fechamento de caixa. O cupom de
// venda não usa isto: ele imprime direto, sem pergunta.
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { FormatoImpressaoCaixa } from '@/lib/print/fechamentoCaixa'

interface Props {
  titulo: string
  subtitulo?: string
  onEscolher: (formato: FormatoImpressaoCaixa) => void
  onFechar: () => void
  rotuloFechar?: string
}

export function DialogFormatoImpressao({ titulo, subtitulo, onEscolher, onFechar, rotuloFechar = 'Não' }: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 text-center">
        <Printer size={28} className="mx-auto text-gray-400 mb-2" />
        <p className="text-base font-semibold text-gray-900 mb-1">{titulo}</p>
        {subtitulo && <p className="text-sm text-gray-500 mb-5">{subtitulo}</p>}
        <div className="flex flex-col gap-2 mt-5">
          <Button onClick={() => onEscolher('termica')}>Impressora térmica</Button>
          <Button variant="outline" onClick={() => onEscolher('a4')}>Folha A4</Button>
          <Button variant="ghost" className="text-gray-400" onClick={onFechar}>{rotuloFechar}</Button>
        </div>
      </div>
    </div>
  )
}
