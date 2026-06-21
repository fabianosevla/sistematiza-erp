// Estoque Avançado foi unificado dentro de Estoque (abas Locais, Perdas,
// Contagem, Entrada NF-e). Esta rota só existe para não quebrar links ou
// favoritos antigos.
import { redirect } from 'next/navigation'

interface Props { params: { tenant: string } }

export default function EstoqueAvancadoRedirect({ params }: Props) {
  redirect(`/${params.tenant}/estoque`)
}