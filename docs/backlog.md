# Backlog — sistematiza.erp

Registro do que ficou combinado e ainda não foi feito. Item aqui não é
promessa de fazer agora; é garantia de não esquecer.

---

## 1. Provisionamento de tenant e reestruturação do schema

**Por que existe:** hoje é impossível criar uma empresa funcional. A rota
`app/api/onboarding/route.ts` cria **4 tabelas** (`t_usuario`, `t_cliente`,
`t_fornecedor`, `t_produto`). Os schemas do projeto declaram **56 tabelas de
tenant**. Uma empresa criada por ali nasce sem vendas, estoque, produção,
financeiro — o usuário entra e quebra em quase toda tela.

O schema da Zaghi não foi criado por essa rota: foi montado ao longo de meses
por scripts de migração avulsos. Ou seja, a estrutura real do banco existe em
um só lugar — no próprio banco — e não em código versionado.

**É pré-requisito para vender o software.** Sem isso, cada cliente novo seria
uma sessão manual de migração.

**Direção proposta (não decidida):**

- Script de provisionamento que clona a estrutura de um schema de referência
  via `pg_dump --schema-only`, troca o nome do schema e aplica.
  Clonar o banco real, e não gerar pelo Drizzle, é deliberado: existem colunas
  que entraram por scripts avulsos e podem não estar refletidas nos arquivos
  do Drizzle. O dump copia o que **existe**, não o que deveria existir.
- Definir um schema-modelo vazio, e decidir o que vai populado de fábrica:
  domínios, formas de pagamento, perfis de acesso.
- Decidir o fluxo comercial: cliente cria a própria empresa (self-service,
  como hoje) ou o schema é provisionado por você antes de convidar o dono.

---

## 2. Segurança e faxina

- Regenerar a `CLERK_SECRET_KEY` de produção (a chave passou por um chat) e
  atualizar na Vercel. Clerk → Production → Configure → API keys.
- Investigar `malware.txt` na home da HostGator (`/home1/fabi5248/`, 368 bytes,
  4 de agosto).
- Decidir sobre o fallback hardcoded `'https://sistematiza-erp.vercel.app'` em
  `app/api/[tenant]/cadastros/usuarios/route.ts` (linha 45) e
  `.../[id]/reset-senha/route.ts` (linha 29). Com `NEXT_PUBLIC_APP_URL`
  definida ele nunca é usado, mas se a variável sumir o sistema volta a mandar
  convite para o domínio errado em silêncio.

---

## 3. Código morto — verificado, quase tudo resolvido

Varredura feita. Situação real:

**Já excluídos** — `app/(dashboard)/[tenant]/comandas/`,
`components/modules/financeiro/ConciliacaoView.tsx`,
`lib/services/financeiro/ConciliacaoService.ts` e
`app/api/[tenant]/conciliacao/` não existem mais.

**NÃO excluir `components/modules/comandas/ComandasView.tsx`.** Apesar do
caminho sugerir módulo removido, ele é importado por `PdvMesas.tsx` e
`PdvShell.tsx` — é a tela de comandas que vive dentro do PDV, que deve
permanecer. Apagar quebra o PDV.

**Encanamento morto (opcional):** `comandasAtivo` sai do banco
(`t_configuracoes_tenant.comandas_ativo`), passa por
`app/api/[tenant]/configuracoes/route.ts`, `app/(dashboard)/tenant-layout.tsx`
e `components/layout/ClientShell.tsx` — e não é consumido em lugar nenhum
desde que Comandas saiu do menu. Contra-argumento para deixar como está: é o
gancho pronto caso um dia se queira ligar/desligar comandas por cliente.

---

## 4. Correções de dados pendentes

- `node scripts/fix-estoque-canelloni.js --aplicar` — corrige 54 → 44 unidades,
  gravando a movimentação de saída em vez de UPDATE cru no saldo.
- `node scripts/check-produtos-sem-preco.js` — lista produtos vendáveis sem
  preço de venda, que fecham venda em R$ 0,00 no PDV. Correção é digitar o
  preço em Cadastros → Produtos.

---

## 5. Colunas mortas no banco

Nenhuma tem referência em código de aplicação — só existem no Postgres:

- `pedido_id` em `t_entrada_nfe` — a tabela nem está declarada no Drizzle.
- `conciliacao_bancaria_ativo` — citada apenas em
  `scripts/migrate-financeiro-completo.js` e `scripts/check-financeiro-completo.js`.

Coluna sem uso não custa nada e não atrapalha consulta. `DROP COLUMN` em banco
de produção, sim, tem risco. A recomendação é **deixar como estão** e só
remover se um dia houver uma migração de estrutura maior — por exemplo, a do
item 1.

---

## 6. Venda — limitações conhecidas do cancelamento

O cancelamento devolve estoque de produto e de insumo, estorna cashback e
derruba o rascunho fiscal. Duas assimetrias permanecem, e as duas têm a mesma
raiz: **a venda registra os produtos, não os insumos que consumiu.**

- A baixa de insumo usa `Math.max(0, ...)`. Se o estoque estava abaixo do que
  a ficha pedia, baixou menos do que deveria — e a devolução soma o valor
  cheio, então o insumo pode voltar com mais do que saiu.
- A devolução usa a ficha técnica **de agora**. Se a ficha mudou depois da
  venda, recompõe pela receita nova.

A correção é gravar o consumo de insumo por venda, numa tabela de movimentação
ou em `t_venda_item`. Isso resolve as duas de uma vez e, de quebra, faz vendas
aparecerem na consulta de movimentação de estoque — que hoje não as enxerga,
porque a venda decrementa `estoque_atual` direto, sem registrar movimento.

---

## 7. Fluxo pedido → conta a receber → venda

Regra vigente desde a reforma:

1. **Entrega do pedido** — baixa estoque do produto acabado (com movimentação
   registrada), grava `data_entrega` e abre conta a receber. Não gera venda.
   Insumo não sai aqui: saiu no registro de produção.
2. **Baixa da conta a receber** — na quitação total, cria a venda com
   `origem = 'pedido'`, os itens e o pagamento. Não mexe em estoque.
   `t_pedido.venda_id` é a trava contra faturamento duplicado.

Pendente de execução:

- `node scripts/migrate-conta-receber-data-entrega.js --aplicar`
- `node scripts/desfazer-vendas-de-pedido.js --aplicar`

---

## 8. Telas e comportamento

- Chatbot no canto inferior direito.
- Tabela de preço (era item de Comandas, que saiu; decidir onde entra).
- Congelar a taxa da forma de pagamento em `t_venda_pagamento` no momento da
  venda — hoje, se a taxa muda no cadastro, o histórico muda junto.
- Decidir se "Nova Venda" no módulo Vendas sai, já que o PDV cobre o caso.
- Legenda "Configure sua empresa para começar" na tela de onboarding — sobrou
  do padrão antigo de legendas na tela.

---

## Padrões de desenvolvimento (implícitos, não são tarefas)

Valem para toda tela nova, sem precisar ser pedidos:

1. Formulário é drawer (`FormModal` / `SidePanel`), nunca modal centralizado.
2. Modal só para confirmação Sim/Não.
3. O drawer continua aberto após salvar, limpando os campos.
4. Cabeçalho de tabela congelado em todas as listagens.
5. Sem legendas na tela — explicação vai no `InfoTip`, uma frase.
6. `sem-spinner` em campos de dinheiro e número.
7. `created_by` / `updated_by` com o usuário real logado.
8. Marca **Sistematiza.ai** com o logo `/apple-icon.png`, ".ai" em `#2ecc71`.
