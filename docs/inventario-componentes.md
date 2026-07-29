# Inventário de componentes

Gerado em 29/07/2026, 10:05:50 — 43 telas.

Legenda: `ok` usa componente compartilhado · `na mão` reimplementado na tela · `misto` os dois no mesmo arquivo.

## Resumo

| Componente | Telas que adotam | Telas na mão |
|---|---|---|
| Paginação | 3 | 9 |
| Estado vazio | 2 | 24 |
| Carregando | 3 | 36 |
| Confirmação | 14 | 5 |
| Modal | 0 | 31 |
| Tabela | 0 | 30 |
| Busca | 0 | 20 |
| Badge de status | 0 | 16 |
| Aviso inline | 9 | 15 |
| Toast | 28 | 1 |

## Por tela

| Tela | Paginação | Estado vazio | Carregando | Confirmação | Modal | Tabela | Busca | Badge de status | Aviso inline | Toast |
|---|---|---|---|---|---|---|---|---|---|---|
| components/modules/cadastros/ClientesView.tsx | na mão | na mão | na mão | ok | na mão | na mão | na mão | na mão | na mão | — |
| components/modules/cadastros/ProdutosView.tsx | misto | misto | misto | ok | na mão | na mão | na mão | na mão | na mão | ok |
| components/modules/comandas/ComandasView.tsx | — | na mão | na mão | na mão | na mão | na mão | na mão | na mão | — | na mão |
| components/modules/cadastros/FornecedoresView.tsx | na mão | na mão | na mão | ok | na mão | na mão | na mão | na mão | — | ok |
| components/modules/cadastros/InsumosView.tsx | misto | misto | misto | ok | na mão | na mão | na mão | na mão | — | ok |
| components/modules/estoque/EstoqueView.tsx | misto | na mão | na mão | — | na mão | na mão | na mão | — | misto | — |
| components/modules/fidelidade/FidelidadeView.tsx | na mão | na mão | na mão | — | — | na mão | na mão | na mão | misto | — |
| components/modules/fiscal/FiscalView.tsx | — | na mão | na mão | na mão | na mão | na mão | — | na mão | misto | — |
| components/modules/pedidos/PedidosView.tsx | — | na mão | na mão | na mão | na mão | — | na mão | na mão | — | ok |
| components/modules/plano_acao/PlanoAcaoView.tsx | — | — | na mão | na mão | na mão | na mão | na mão | na mão | — | — |
| app/(dashboard)/[tenant]/pdv/PdvBalcao.tsx | — | na mão | na mão | ok | na mão | na mão | — | — | na mão | ok |
| components/modules/cadastros/UsuariosView.tsx | — | na mão | na mão | ok | na mão | na mão | — | na mão | — | ok |
| components/modules/compras/CompraRapidaView.tsx | — | na mão | na mão | ok | na mão | na mão | — | — | na mão | ok |
| components/modules/consultas/ConsultasView.tsx | na mão | na mão | na mão | — | — | na mão | — | na mão | — | — |
| components/modules/financeiro/ContasPagarView.tsx | — | na mão | na mão | ok | na mão | na mão | na mão | — | — | ok |
| components/modules/financeiro/ContasReceberView.tsx | — | na mão | na mão | ok | na mão | na mão | na mão | — | — | ok |
| components/modules/perfis/PerfisView.tsx | — | na mão | na mão | ok | na mão | — | — | na mão | na mão | ok |
| components/modules/vendas/VendasView.tsx | na mão | — | misto | ok | na mão | na mão | na mão | — | — | ok |
| app/(dashboard)/[tenant]/pdv/PdvClient.tsx | — | na mão | na mão | — | — | — | na mão | — | misto | — |
| components/modules/cadastros/DominiosView.tsx | — | na mão | na mão | ok | na mão | — | — | na mão | — | ok |
| components/modules/cadastros/FichaTecnicaView.tsx | — | — | — | ok | — | na mão | na mão | na mão | misto | ok |
| components/modules/cadastros/FormasPagamentoView.tsx | — | — | na mão | na mão | na mão | na mão | — | — | — | — |
| components/modules/compras/PedidosTab.tsx | — | na mão | na mão | — | na mão | — | na mão | — | — | ok |
| components/modules/compras/RequisicoesTab.tsx | — | — | na mão | — | na mão | — | na mão | na mão | — | — |
| components/modules/estoque/LocaisTab.tsx | — | — | na mão | — | na mão | na mão | na mão | — | — | ok |
| components/modules/estoque/PerdasTab.tsx | — | — | na mão | — | na mão | na mão | na mão | — | — | ok |
| components/modules/financeiro/ConciliacaoView.tsx | — | na mão | na mão | — | na mão | na mão | — | — | — | ok |
| components/modules/financeiro/FinanceiroView.tsx | na mão | — | na mão | ok | na mão | na mão | — | — | — | ok |
| components/modules/producao/ProducaoView.tsx | — | na mão | — | — | na mão | na mão | — | — | misto | — |
| app/(dashboard)/[tenant]/pdv/PdvMesas.tsx | — | — | na mão | — | na mão | — | — | — | na mão | ok |
| components/modules/compras/ConferenciaTab.tsx | — | na mão | na mão | — | — | na mão | — | — | ok | ok |
| components/modules/estoque/ContagemTab.tsx | — | — | na mão | — | na mão | na mão | — | — | — | ok |
| components/modules/fiscal/NovaNotaModal.tsx | — | — | na mão | — | na mão | — | na mão | — | — | ok |
| components/modules/importacao/ImportacaoModal.tsx | — | — | — | — | na mão | na mão | — | — | misto | — |
| components/modules/metas/MetasView.tsx | — | — | — | — | na mão | na mão | — | — | na mão | ok |
| components/modules/vendas/VendaDetalheView.tsx | — | na mão | na mão | — | — | na mão | — | — | — | — |
| components/layout/Header.tsx | — | — | — | — | na mão | — | — | na mão | — | ok |
| components/modules/compras/ListasTab.tsx | — | — | na mão | — | — | na mão | — | — | — | ok |
| components/modules/compras/MrpTab.tsx | — | — | na mão | — | — | na mão | — | — | ok | ok |
| components/modules/estoque/EntradaNfeTab.tsx | — | — | na mão | — | — | — | na mão | — | — | ok |
| app/(dashboard)/[tenant]/selecionar-modulo/SelecionarModuloClient.tsx | — | na mão | — | — | — | — | — | — | — | — |
| components/modules/compras/CotacaoTab.tsx | — | — | na mão | — | — | — | — | — | — | ok |
| components/modules/dashboard/DashboardHome.tsx | — | — | — | — | — | — | — | — | na mão | — |
