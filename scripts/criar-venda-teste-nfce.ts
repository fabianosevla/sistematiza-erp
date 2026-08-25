// scripts/criar-venda-teste-nfce.ts
//
// Cria uma venda de teste no PDV (via VendaService.criarDireta), pedindo
// NFC-e — exatamente o que o checkout faria, se já tivesse esse campo na
// tela. Serve só para validar o CFOP/CSOSN corrigidos hoje: a tela do PDV
// ainda não tem opção de pedir nota fiscal, então não dá para gerar esse
// teste clicando no sistema.
//
//   node --import tsx scripts/criar-venda-teste-nfce.ts
require('dotenv').config({ path: '.env.local' })

async function main() {
  const { getDbForTenant } = await import('../lib/db/connection')
  const { VendaService } = await import('../lib/services/vendas/VendaService')

  const { db, release } = await getDbForTenant('tenant_zaghi_massas_caseiras')
  try {
    const venda = new VendaService(db)
    const resultado: any = await venda.criarDireta({
      itens: [{ produtoId: 17, quantidade: 2 }], // Molho ao Sugo
      desconto: 0,
      pagamentos: [{ forma: 'Dinheiro', valor: 4200 }],
      nomeClienteAvulso: 'Teste HML',
      documentoFiscal: 'nfce',
      userId: 1,
    })
    console.log('VENDA CRIADA:', JSON.stringify(resultado, null, 2))
  } finally {
    release()
  }
}
main()
