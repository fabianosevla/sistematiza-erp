// ESTE ARQUIVO VAI EM: lib/fiscal/cfopVenda.ts
//
// CFOP de venda, calculado — não digitado. Antes cada perfil tributário
// guardava cfop_interno/cfop_interestadual como texto livre, e nada
// garantia que batia com o campo "tem substituição tributária" do mesmo
// perfil (dava pra marcar "tem ST" com CFOP da família sem ST, e vice-versa).
//
// A tabela oficial de CFOP segue um padrão fixo pra venda de mercadoria:
//   produção própria, sem ST  → 5101 (interno) / 6101 (interestadual)
//   produção própria, com ST  → 5401 (interno) / 6401 (interestadual)
//   revenda,          sem ST  → 5102 (interno) / 6102 (interestadual)
//   revenda,          com ST  → 5405 (interno) / 6404 (interestadual)
//
// O par 5405/6404 não segue o padrão visual de manter os 3 últimos dígitos
// (é uma particularidade da tabela oficial) — conferido cruzando as duas
// descrições oficiais uma por uma, não é digitação.
export type OrigemMercadoria = 'producao_propria' | 'revenda'

const TABELA: Record<OrigemMercadoria, { semSt: [string, string]; comSt: [string, string] }> = {
  producao_propria: { semSt: ['5101', '6101'], comSt: ['5401', '6401'] },
  revenda:           { semSt: ['5102', '6102'], comSt: ['5405', '6404'] },
}

export function resolverCfopVenda(
  origem: OrigemMercadoria,
  temSt: boolean,
  mesmoEstado: boolean,
): string {
  const [interno, interestadual] = temSt ? TABELA[origem].comSt : TABELA[origem].semSt
  return mesmoEstado ? interno : interestadual
}
