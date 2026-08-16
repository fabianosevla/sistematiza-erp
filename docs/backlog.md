# Backlog — sistematiza.erp

Registro do que ficou combinado e ainda não foi feito. Item aqui não é
promessa de fazer agora; é garantia de não esquecer.

> **Como este arquivo é usado.** Quando o Fabiano diz "guarda no backlog", o
> item entra aqui — e quando ele pergunta "o que temos para fazer?", a resposta
> sai daqui, não da memória da conversa. Este arquivo é a fonte: ele sobrevive
> ao fim da sessão, a conversa não.

---

## Próximos passos combinados (11/08/2026)

Ordem decidida pelo Fabiano — a bola está com ele agora, não é para eu agir
sem ele voltar a pedir:

1. **Focus NFe** — ele mesmo vai configurar a conta pra poder testar
   homologação. É o que está travando o módulo fiscal hoje (ver seção
   "Fiscal — a desenvolver junto com a Zaghi e o contador", acima).
2. **Depois disso**: revisitar **Metas & Simulador** e **Fidelidade** — os
   dois módulos já existem no sistema, mas estão **desabilitados** (flag de
   módulo desligada) e, segundo o Fabiano, "super atrasados" — precisam de
   revisão antes de religar, não é só apertar o interruptor.
3. **Depois de Fidelidade**: novo menu **"Painel do Contador"** (decidido em
   13/08/2026) — ver seção "12. Painel do Contador — plano de contas
   (versão enxuta)", abaixo.
4. **Lá na frente**: lembrar de atualizar a documentação (`Documentação
   Técnica` no Drive — ver [[reference_drive_documentacao]] na memória) pra
   refletir o que mudar no fiscal, Metas, Fidelidade e Painel do Contador.

---

## 0. TESTES PENDENTES — nada disso foi validado em uso real

Três frentes construídas e não testadas. Enquanto ninguém usou, é teoria.

### Novo Financeiro

Caixa, e o fluxo de dinheiro que mudou de lugar.

- Abrir caixa no PDV, vender, sangria, suprimento, fechar conferindo
- Conferir se a diferença calculada bate com a conta feita à mão
- Histórico em Financeiro → Caixa: diferença por turno e por caixa
- Entrega de pedido gera conta a receber e **não** gera venda
- Baixa da conta a receber **gera** a venda, datada no recebimento
- Pagamento de conta a pagar gera a despesa, datada no pagamento
- Venda com e sem nota, e a coluna Nota em Consultas
- **Pendente de decisão:** quebrar Financeiro em 4 submenus
  (Contas a Pagar · Contas a Receber · Despesas · Resultado).
  Adiado de propósito: refatoração de 904 linhas em cima de muita mudança
  não testada esconde a causa quando algo quebra.

### Tenantização — clientes novos

**Atualizado em 11/08/2026.** Já existe plano (`docs/provisionamento.md`),
script (`scripts/provisionar-tenant.js`) e `tenant_modelo` no banco. Rodado
hoje: o modelo tinha ficado 13 colunas fiscais atrás da Zaghi
(`t_nota_fiscal`, `t_pedido` — o módulo fiscal evoluiu depois que o modelo
foi criado). Resincronizado com `criar-schema-modelo.js --recriar` +
`semear-schema-modelo.js`, e `tenant_teste_provisionamento` foi recriado a
partir do modelo corrigido. `comparar-schemas.js` dá **OK limpo** contra a
Zaghi agora: mesma estrutura, zero coluna faltando, zero sequence cruzada.

Recorte da vez: nicho alimentício (bar, restaurante, fábrica de comida) — o
modelo já É esse perfil (clone da Zaghi), e comandas/mesas do PDV já servem
bar/restaurante. Não é construção nova, é validar o que existe.

Pendente:
- Navegar o sistema inteiro pelo `tenant_teste_provisionamento`: PDV,
  pedidos, produção, comandas/mesas, estoque, compras, financeiro, consultas.
  Precisa de um convite real pelo Clerk — o usuário dono foi criado com
  e-mail placeholder (`teste@sistematiza.local`), então pra logar de verdade
  é preciso convidar um e-mail real e ele entrar em
  `/teste-provisionamento`.
- Cadastrar o mesmo e-mail em duas empresas e conferir a tela de escolha.
- Confirmar que o vínculo Clerk↔schema se faz sozinho no primeiro acesso.
- **Lembrete:** depois de validado, rodar `criar-schema-modelo.js --recriar`
  de novo toda vez que o schema da Zaghi ganhar coluna/tabela nova — senão o
  modelo volta a ficar pra trás, como aconteceu agora.

O passo mais provável de revelar buraco é o cadastro da empresa em
Configurações: a linha de `t_configuracoes_tenant` é montada por inspeção de
colunas, e é a parte do provisionamento com mais chance de ter errado.

### Fiscal — a desenvolver junto com a Zaghi e o contador

Não é teste de tela: é implantação com terceiros.

1. Conta na Focus NFe, com o CNPJ da Zaghi
2. Certificado A1 — **confirmar que não é A3**
3. Tabela A com o contador (8 campos, não depende dos produtos)
4. Emitir em **homologação** pelo módulo Fiscal
5. Só então Tabelas B e C, e produção

O desenho do PDV fiscal — o que fazer quando a nota não sai com o cliente
esperando — fica para depois da primeira emissão em homologação. É lá que se
descobre quanto tempo a autorização demora e o que a SEFAZ devolve quando cai.

**Série diferente do Everest.** Everest na 1, Sistematiza na 2. Mesma série
nos dois sistemas gera duplicidade de numeração.

**Arquitetura de conta Focus NFe, decidida em conversa em 13/08/2026 — para
quando o sistema escalar pra outros clientes.** A API da Focus suporta várias
empresas (CNPJs) cadastradas sob uma única conta administradora (endpoint de
"empresas": criar, listar, alterar, remover) — é isso que permite o Fabiano
logar uma vez só e administrar o certificado/token/emissão de todo cliente,
sem cada um precisar da própria conta na Focus.

- A conta cadastrada hoje com o CNPJ da Zaghi (pra testar homologação) **não
  deve virar a conta-mestre**. É conta de um cliente só, temporária.
- A conta-mestre de revenda de verdade deve ser aberta sob o **CNPJ da
  Sistematiza** (ainda não existe — ver decisão de abertura de empresa,
  abaixo). Quando esse CNPJ sair, migrar a Zaghi pra dentro dela como a
  primeira empresa-filha.
- Ainda não confirmado com a Focus: se existe um plano formal de
  "revenda/parceiro" separado do plano normal, ou se qualquer conta paga já
  suporta múltiplas empresas por padrão. Perguntar direto pelo canal de
  contato deles antes de decidir o plano.

**CNPJ da Sistematiza (empresa de software, separada da Zaghi) — decisão de
13/08/2026:** hoje o Fabiano fatura tudo pelo CNPJ da Zaghi
(`11.327.412/0001-57`, "EDUARDO ZAGHI"), o que mistura a receita da fábrica
com a de revenda de software. Avaliado MEI x SLU:

- **MEI descartado** — nenhuma ocupação encontrada no portal do MEI descreve
  "desenvolver e licenciar software" (a mais próxima achada foi "instalador
  de redes de computadores", que não bate com a atividade real).
- **Caminho decidido**: abrir **SLU** (Sociedade Limitada Unipessoal) com
  contador, CNAE `62.02-3-00` (desenvolvimento e licenciamento de programas
  de computador), quando o faturamento da revenda justificar o custo do
  contador.
- **Solução transitória, até lá**: cadastro de **autônomo na prefeitura**
  (CPF, Inscrição Municipal) + **NFS-e Avulsa**, pra já poder emitir nota de
  serviço de software sem precisar abrir CNPJ agora. Isso não gera CNPJ —
  fica em CPF até a SLU sair de fato.

---

## 0.1 Scripts pendentes de execução

Cada um simula por padrão e só grava com `--aplicar`. **Rode a simulação e leia
a saída antes de aplicar.** Estrutura antes de dado.

```
# Estrutura
node scripts/migrate-conta-receber-ajustes.js
node scripts/migrate-conta-receber-data-entrega.js
node scripts/migrate-fiscal-parametrizacao.js
node scripts/migrate-turno-caixa.js
node scripts/migrate-caixa-e-fiscal.js

# Dado
node scripts/migrate-despesa-de-conta-pagar.js
node scripts/fix-estoque-canelloni.js
node scripts/desfazer-vendas-de-pedido.js
```

**`desfazer-vendas-de-pedido` por último.** Ele inativa as vendas geradas pela
regra antiga de entrega. O faturamento de meses passados cai e volta conforme
as contas a receber forem baixadas. Não é perda de dado — é a régua nova
aplicada ao histórico. Você já inativou manualmente parte desses pedidos.

**`migrate-despesa-de-conta-pagar` piora o DRE passado.** Compra a prazo nunca
virava despesa; agora vira, datada no pagamento. O lucro que aparecia estava
otimista.

---

## 0.1 Bloqueado em terceiros — fiscal

Nada disso depende de código. É o que trava a primeira nota:

- Conta na Focus NFe, com o CNPJ da Zaghi cadastrado
- Certificado A1 da Zaghi carregado no painel da Focus
  (**confirmar que não é A3** — token USB não serve)
- Tabela A preenchida pelo contador — 8 campos, não depende dos produtos
- Tabelas B e C — perfis e NCM por produto

Ver `docs/Kit-Fiscal-Contador.pdf` e `docs/Primeira-Nota-Fiscal.pdf`.

**Série diferente do Everest.** Os dois sistemas não podem emitir na mesma
série: disputam o mesmo número e a SEFAZ rejeita por duplicidade. Everest na 1,
Sistematiza na 2.

---

## 0.2 Backend — observabilidade e contrato

**O diagnóstico, em uma frase:** o backend não está bagunçado no sentido de
faltar separação — cada rota já é uma função isolada. O que falta é o que torna
essa separação utilizável: **documentação, endereços previsíveis e um
identificador de requisição.**

Nasceu de uma dificuldade concreta: abrir o DevTools para descobrir por que uma
venda não voltava em Consultas, e não conseguir achar a resposta no meio das
chamadas.

**O que NÃO é problema:** cada rota já é uma função isolada. São 90 arquivos
`route.ts`, e cada um vira uma serverless function na Vercel. O modelo de "uma
chamada, uma função" já existe.

**O que enche o DevTools:** 13 telas com `refetchInterval`. O PDV recarrega a
cada 5 e 10 segundos; Comandas a cada 5; Contas a pagar e receber a cada 30.
É decisão de tela, não do backend — mas torna a aba Network ilegível.
Paliativo imediato: filtrar por **Fetch/XHR** no DevTools.

### O que precisa ser feito

**1. Documentar a API.** 90 rotas, nenhum contrato escrito. Para saber o que
uma devolve é preciso abrir o arquivo. Solução: OpenAPI gerado a partir dos
schemas Zod que já existem em `lib/validations/`.

**2. Padronizar `?action=` para caminho próprio.** Dez rotas decidem o que
fazer por parâmetro de query:

```
fiscal · caixa · compras · consultas · contas-pagar
contas-receber · financeiro · metas · vendas · fidelidade/movimentos
```

`/api/x/fiscal?action=emitir` deveria ser `/api/x/fiscal/notas/[id]/emitir`.
Uma coisa, um endereço, uma resposta — que é o que permite depurar olhando a
URL. **Parte disso é dívida nova:** a rota de caixa foi escrita hoje seguindo
o padrão existente em vez de corrigi-lo.

**3. Rastreio de requisição.** Não há identificador para correlacionar o que o
usuário viu com o que o servidor registrou. Um `x-request-id` gerado no
middleware, devolvido no header e impresso no log resolve — e é o que faltou
no dia em que isto foi anotado.

**4. Reduzir os 59 `@ts-nocheck`.** Verificação de tipo desligada justamente na
fronteira onde os dados entram. Por rota tocada, nunca em bloco.

**5. Revisar os intervalos de recarga.** Cinco segundos no PDV é agressivo para
dado que muda a cada minuto. Cada recarga é uma conexão do pool — e o pool tem
teto de 20 por instância.

Nada disso é urgente. Mas os itens 1 e 3 são o que separa "depurar abrindo
arquivo" de "depurar olhando a resposta".

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

### 1.1 Cadastro na Focus NFe como etapa do provisionamento

**Só para quem contratar o módulo fiscal.** Cliente sem fiscal não precisa de
nada disso, e não deve pagar por isso.

O modelo da Focus casa com o nosso: **uma conta** (da Sistematiza) contendo
**várias empresas**, uma por CNPJ, cada uma com **token próprio**. É exatamente
o desenho de `t_configuracoes_tenant.focus_nfe_token`, que já é por tenant.

Hoje isso seria manual a cada cliente: criar a empresa no painel, subir o
certificado, definir a série, copiar o token, colar em Configurações → Fiscal.

**A automatizar**, usando a API de empresas da Focus
(`doc.focusnfe.com.br/reference/empresas` — criar, listar, atualizar, excluir):

- No provisionamento, se o plano incluir fiscal: criar a empresa na Focus com
  CNPJ, IE, endereço e regime tributário do tenant, e gravar o token devolvido
  direto na configuração do tenant.
- Upload do certificado A1 continua sendo passo manual e consciente — é
  documento do cliente, com senha, e não deve trafegar por automação sem que
  alguém tenha decidido isso explicitamente.
- Série: usar sempre uma série nova por cliente, nunca a 1, para conviver com
  o sistema fiscal que ele já usa durante a migração.
- Ao desativar um tenant, decidir o que fazer com a empresa na Focus: manter
  (obrigação de guarda dos XMLs) ou excluir. Provavelmente manter.

**Ponto contratual, não técnico:** o certificado é do cliente e responde pelo
CNPJ dele, mesmo hospedado na sua conta. Isso precisa estar escrito no contrato
antes do primeiro cliente pago.

---

## 1.2 Varredura de "coluna existe, mas não chega na tela"

Feita em 09/08/2026, depois que os campos fiscais do produto apareceram
vazios. O padrão é sempre o mesmo: a coluna entrou por script de migração e
alguma das quatro camadas não foi atualizada junto — schema do Drizzle,
validação, SELECT da API, formulário.

**Corrigido na varredura:**

- `t_produto`: o SELECT de `cadastros/produtos` não trazia `ncm`, `cest`,
  `origem`, `unidade_tributavel`, `perfil_trib_id`. O formulário abria vazio e
  **salvar por cima apagava** o que o seed fiscal tinha preenchido.
- `t_produto.preco_atacado`: a coluna única de atacado, anterior às cinco
  faixas, também não era selecionada. `precoNaTabela` a usa como reserva
  quando a faixa do cliente está vazia — reserva que nunca funcionou.
- `t_cliente`: `inscricao_estadual` e `indicador_ie` existiam desde
  `migrate-fiscal-parametrizacao.js` e faltavam nas quatro camadas. Toda NF-e
  sairia com o comprador como não contribuinte.

**Coluna fantasma — o caso mais grave da varredura (09/08/2026):**

`dbVenda` declarava `regime_turno`, que não existe em `t_venda` — o regime é da
empresa e vive em `t_configuracoes_tenant`. Entrou junto com `turno_id` e
`numero_caixa` no trabalho de controle de caixa.

**O Drizzle monta o INSERT com TODAS as colunas declaradas**, usando `DEFAULT`
para as que não foram passadas. Uma coluna que não existe no banco quebra
portanto **toda inserção na tabela**, não só quem tentasse usá-la. O PDV
inteiro devolvia 500 (`42703`), e o erro só aparecia no log do servidor porque
`serverError` esconde a mensagem na resposta.

É o inverso do outro padrão: ali a coluna existia e não chegava na tela; aqui
ela não existia e derrubava a escrita.

**Pendente:**

- **`ConfiguracoesService` enxerga menos que a tabela.** O schema do Drizzle
  declara um subconjunto de `t_configuracoes_tenant`; `crt`, `cnae`,
  `mensagem_fiscal`, `serie_nfe`, `serie_nfce`, `credenciado_nfce`,
  `credenciado_nfe`, `qtd_caixas` e `regime_turno` ficam de fora. Não há bug
  hoje porque quem precisa delas usa SQL cru, e o `update()` do serviço não é
  chamado por ninguém. É armadilha, não defeito. Decidir: completar o schema
  do Drizzle ou remover o serviço e deixar só a rota.
- **`t_cliente.consumidor_final`** existe no banco e nada lê nem escreve.
  Provavelmente redundante com `indicador_ie = 9`. Candidata a coluna morta.
- Falta um teste que compare, para cada tabela, as colunas do banco com as
  quatro camadas. Enquanto for varredura manual, o padrão volta.

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

O espelho, do lado da despesa:

3. **Compra à vista** — grava `t_despesa` na data da compra, como sempre.
4. **Compra a prazo** — abre conta a pagar. A despesa nasce na **quitação**,
   datada no dia do pagamento. `t_despesa.conta_pagar_id` é a trava contra
   duplicar. Resolve o caso do cartão: comprou em agosto, vence em setembro, o
   custo cai em setembro.

Regra geral das duas pontas: **dinheiro entrou, receita; dinheiro saiu,
despesa.** A movimentação de estoque continua acontecendo na entrega e na
compra, independente do caixa.

Pendente de execução:

- `node scripts/migrate-conta-receber-data-entrega.js --aplicar`
- `node scripts/desfazer-vendas-de-pedido.js --aplicar`
- `node scripts/migrate-despesa-de-conta-pagar.js --aplicar`

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

## 9. Generalização para outros ramos — indústria, comércio, revenda

Levantado em 10/08/2026 a partir de uma pergunta direta: o sistema hoje foi
moldado em cima da Zaghi (massas). Serviria pra um restaurante, um bar, uma
fábrica de roupas, uma loja de parafusos? Objetivo declarado: para toda
indústria/comércio o sistema deveria funcionar, como qualquer ERP escalável.

**Mais pronto do que parece, em três pontos:**

- Módulos já ligam/desligam por tenant (`producaoAtivo`, `estoqueAtivo`,
  `fiscalAtivo`, `comandasAtivo`, `comprasAtivo`, `multiplosLocaisAtivo` em
  `t_configuracoes_tenant`) — já dá pra montar comércio puro ou indústria só
  configurando flags.
- Comandas e mesas (`PdvMesas.tsx`) já existem, prontas pra restaurante/bar.
- Categorias (`tipo_insumo` etc.) já vêm de domínio configurável
  (`t_dominio`), não são fixas no código.

**Três buracos concretos, cada um virou cartão próprio no Trello (BACKLOG
MELHORIAS #89, #90, #91):**

1. **Variação de produto (grade cor × tamanho).** `t_produto` é uma linha =
   um SKU. Sem isso, têxtil/vestuário cadastra manualmente cada combinação.
2. **Conversão de unidade compra↔uso/venda.** Compra em caixa/fardo, usa ou
   vende fracionado. Generaliza o card #27 "Dúvidas sobre o brócolis" — é o
   mesmo problema de qualquer ramo (parafuso por caixa, tecido por metro).
3. **Lote e validade.** Não existe hoje em `t_produto` nem `t_insumo`. Risco
   de compliance para qualquer cliente de alimentos, não só a Zaghi.

**Ainda não existe, e é construção nova:** um seletor de "perfil de negócio"
(indústria/comércio/indústria e comércio/revenda × ramo × abrangência
fiscal-ou-gerencial) que configure o tenant com poucos cliques. Não é caro de
montar — a escolha indústria/comércio é só orquestrar as flags que já
existem; a escolha por ramo (alimentos/têxtil/siderurgia) é principalmente
curadoria de dados (kit fiscal NCM/CFOP/CST por ramo, com um contador),
parecido com o que já foi feito pra Zaghi, só que generalizado.

**Pré-requisito de tudo isso:** nada disso importa sem o item 1
(provisionamento de tenant) funcionando — hoje não dá pra criar uma empresa
nova funcional, de nenhum ramo.

---

## 10. Lacunas frente ao mercado (revenda)

Levantado em 11/08/2026, comparando o sistema com concorrentes de ERP/PDV
para pequena indústria alimentícia, a pedido do Fabiano ("o que o mercado tem
que meu sistema ainda não tem"). Nenhum destes tem prazo — é mapa, não fila.

- **Variação de produto (grade cor × tamanho).** Já apontado no item 9
  (#89/#90/#91 no Trello) — repetido aqui porque apareceu de novo na
  comparação de mercado.
- **Conversão de unidade compra↔uso/venda.** Compra em caixa/fardo, usa ou
  vende fracionado. Mesmo ponto do item 9 (card #27 "Dúvidas sobre o
  brócolis").
- **Lote e validade.** Não existe em `t_produto` nem `t_insumo`. Para
  alimentício é risco de compliance, não luxo — junta-se ao item 9.
- **Multicanal** (marketplace, e-commerce, catálogo por WhatsApp). Não
  existe. É onde Bling e Tiny vivem — não é o carro-chefe deste sistema, mas
  é o que mais aparece como ausência ao comparar com ERPs genéricos.
- **NF-e de compra automatizada / leitura de XML de entrada.** Existe
  "entrada NFe" no sistema; grau de automação real não foi conferido — falta
  olhar o código antes de decidir se é lacuna de verdade ou só falta de
  documentação.
- **App mobile / PDV offline.** Nada disso existe hoje. PDV que cai sem
  internet é o tipo de coisa que barra venda para varejo físico — bar e
  restaurante em especial sentem isso na hora do rush.

---

## 11. Cardápio online — piloto Zaghi (implementado em 12/08/2026)

Preenche o item "Multicanal" acima, ao menos a parte de link/QR Code de
pedidos. Página pública (`app/cardapio/[tenant]`), sem login, no estilo
Saipos/Goomer. Pedido feito ali vira `t_pedido` de verdade, com cliente
criado/casado em `t_cliente` — não é WhatsApp nem catálogo solto.

**O que tem:** liga/desliga por tenant (`cardapio_ativo` em
`t_configuracoes_tenant`, só a Zaghi ligada), produto com foto (Vercel Blob)
e checkbox "disponível no cardápio" em Cadastros → Produtos, link + QR Code
em Configurações → Cardápio online, preço sempre recalculado no servidor
(nunca confia no que o navegador manda), forma de pagamento vinda do cadastro
real (`t_forma_pagamento`).

**Testado em produção (dev local, DB real da Zaghi) em 12/08:** página
pública abre, lista produto marcado, carrinho e formulário funcionam. Não
testado: o POST de fechamento do pedido de fato (criação de cliente + pedido)
— parei antes de gravar um pedido fake nos dados reais da Zaghi. Falta esse
teste ponta a ponta antes de divulgar o link pra clientes de verdade.

**Pendente:**
- Marcar produtos de verdade como disponíveis e subir fotos — hoje nenhum
  produto aparece no link (fica desligado até o Fabiano escolher o quê).
- Testar o fechamento de pedido de ponta a ponta (com dado de teste combinado
  antes, não um cliente inventado direto na base real).
- Rate limiting / anti-spam no POST público — inexistente hoje.
- Pagamento online — cliente só declara a forma, não paga pelo link.
- Provisionamento de tenant novo (item 1) ainda não liga `cardapio_ativo` nem
  pergunta se o cliente quer o módulo — hoje é ajuste manual por tenant.

---

## 12. Painel do Contador — plano de contas (versão enxuta)

Combinado com o Fabiano em 13/08/2026, na fila logo depois de Fidelidade (ver
"Próximos passos combinados", acima). Menu novo, separado de Financeiro —
visão técnica pra quem entende partida dobrada, não pro dono do negócio mexer
no dia a dia.

**Decisão de escopo (definida em conversa, não é ainda um requisito técnico
detalhado):** versão enxuta, não um motor de contabilidade completo.

- **Não é isto:** livro-razão com partida dobrada de verdade, fechamento
  contábil formal, GL (General Ledger) que substitui o trabalho do contador.
  Isso seria um projeto de outra ordem de grandeza — não é o que foi pedido.
- **É isto:** cadastro de **plano de contas** (estrutura hierárquica tipo
  Ativo/Passivo/Receita/Despesa, editável pelo tenant ou pré-carregado num
  padrão genérico) + uma regra de "de-para" que classifica automaticamente
  cada lançamento que o Financeiro já grava (venda, compra, baixa de conta a
  pagar/receber, despesa) numa conta desse plano. O contador exporta e
  confere — o sistema não declara nada sozinho.

**Ainda não definido (perguntar ao Fabiano antes de implementar):**
- Estrutura do plano de contas padrão — usa um genérico (tipo o exemplo que
  foi discutido: Ativo Circulante, Passivo Circulante, Receita de Vendas,
  Despesas Administrativas etc.) ou o Fabiano/contador da Zaghi já tem um
  plano de contas específico pra importar?
- A regra de-para é fixa no código (cada tipo de lançamento do Financeiro
  sempre cai na mesma conta) ou configurável por tenant?
- Formato de exportação esperado pelo contador (xlsx, CSV, algum padrão que
  o contador já usa no software dele)?
- Entra como módulo habilitável (como Metas/Fidelidade) ou fixo pra todo
  tenant?

**Depende de:** Financeiro já grava os eventos-fonte (venda, despesa, conta a
pagar/receber) — não precisa de dado novo pra começar, só do mapeamento pra
conta contábil.

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
