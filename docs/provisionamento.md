# Provisionamento de tenant — plano

Documento de desenho. Escrito antes do código, para ser revisado e corrigido
enquanto mudar de ideia ainda é barato.

Decisões já tomadas:

- **Quem cria:** você provisiona e convida. Não há cadastro self-service.
- **Semente:** o schema novo nasce com perfis de acesso, domínios e formas de
  pagamento. Sem produto, cliente ou dado fictício.
- **Plano:** `t_tenant.plan` apenas registra o que foi vendido. Nada trava.
- **Zaghi:** o schema deles não muda de forma nem de dado. Vira **fonte** do
  modelo, nunca alvo.

---

## 1. O problema em uma frase

A estrutura real do sistema existe em um único lugar — dentro do Postgres da
Zaghi — e não em código versionado. Os 56 arquivos de schema do Drizzle são uma
aproximação: já se sabe de colunas que existem na tabela e não estão
declaradas (`mes_competencia`, `ano_competencia` em `t_despesa`).

Qualquer provisionamento que gere DDL a partir do Drizzle vai criar um cliente
sutilmente diferente da Zaghi. E a diferença só aparece semanas depois, numa
tela que quebra para um cliente e funciona para o outro.

**Conclusão:** o modelo tem que ser extraído do banco, não do código.

---

## 1.1 Resultado do levantamento (passo 1, executado)

`node scripts/check-estrutura-tenant.js` contra `tenant_zaghi_massas_caseiras`:

| | |
|---|---|
| Tabelas no banco | **63** |
| Tabelas declaradas no Drizzle | 56 (mais `t_tenant`, que é do schema público) |
| Foreign keys | 2 |
| Triggers, views, funções, tipos próprios, policies de RLS | **0** |
| Colunas autoincremento | 63 — **todas `serial`, nenhuma `IDENTITY`** |
| Índices / check constraints | 99 / 1 — copiados pelo `LIKE` |

**Sete tabelas existem no banco e não estão declaradas no Drizzle:**

```
t_compra              t_compra_item         t_filtro_salvo
t_historico           t_notificacao_lida    t_producao_grade
t_producao_registro
```

Entre elas estão `t_compra` e `t_compra_item` — o módulo de Compra Rápida
inteiro — e `t_producao_grade` e `t_producao_registro`, que são a grade de
produção. Gerar o schema de um cliente novo a partir do Drizzle entregaria um
sistema sem compras e sem produção, e o erro só apareceria quando alguém
clicasse no menu.

Isso confirma a decisão de extrair o modelo do banco. Não era precaução
teórica: são sete tabelas de verdade.

**A ausência de trigger, view, função e RLS é a boa notícia:** o clone não
precisa reconstruir comportamento, só estrutura.

---

## 2. Desenho proposto

### 2.1 Um schema-modelo dentro do próprio banco

Criar `tenant_modelo`: mesma estrutura da Zaghi, zero linhas de dado.

A clonagem usa SQL puro, tabela por tabela:

```sql
CREATE TABLE tenant_modelo.t_venda (LIKE tenant_zaghi_massas_caseiras.t_venda INCLUDING ALL);
```

`INCLUDING ALL` traz tipos, defaults, `NOT NULL`, chaves primárias, índices,
constraints de check e as sequences das colunas serial. É a forma mais fiel de
copiar estrutura sem depender de ferramenta externa.

**Por que não `pg_dump`:** exigiria o binário instalado na máquina de quem
provisiona e uma versão compatível com o servidor. `LIKE INCLUDING ALL` roda
por conexão comum, do mesmo jeito que todos os outros scripts do projeto.

**A limitação, dita na cara:** `LIKE` **não copia foreign keys**. Precisa ser
verificado se este banco usa FK — o `CREATE TABLE` do onboarding atual não
declara nenhuma, e a integridade parece ser mantida em código. Se existirem FKs,
elas entram numa etapa extra que lê `pg_constraint` e recria.

**Verificação obrigatória antes de qualquer coisa:** contar FKs, triggers e
views no schema da Zaghi. Se houver, o plano muda.

### 2.2 A semente

Depois de criar as tabelas vazias, popular:

| Tabela | Conteúdo |
|---|---|
| `t_perfil_acesso` | Administrador e Vendedor, com as flags de acesso |
| `t_dominio` / `t_dominio_valor` | tipo de entrega, categorias |
| `t_forma_pagamento` | Dinheiro, PIX, Débito, Crédito |
| `t_configuracoes_tenant` | uma linha com os padrões |

A semente é copiada da Zaghi também — são os mesmos valores que já provaram
funcionar em operação real — mas fica declarada em arquivo, porque semente é
decisão de produto e precisa ser lida sem abrir o banco.

### 2.3 O script de provisionamento

```
node scripts/provisionar-tenant.js --slug padaria-bela --nome "Padaria Bela" --email dono@padaria.com
```

O que faz, em uma transação:

1. valida o slug (`^[a-z0-9-]+$`, ainda não usado em `t_tenant`)
2. cria `tenant_padaria_bela` clonando `tenant_modelo`
3. copia a semente
4. insere a linha em `public.t_tenant` com `plan` informado
5. insere o dono em `t_usuario` com `clerk_id = 'pending_<email>'` e perfil admin
6. imprime o passo seguinte: convidar aquele e-mail pelo painel do Clerk

Como todo script do projeto: **simula por padrão, grava com `--aplicar`.**

### 2.4 Por que o passo 5 basta

O `resolveTenant` autoriza pelo `t_usuario` quando o `publicMetadata` do Clerk
vem vazio, e grava o vínculo na primeira requisição. Então o dono aceita o
convite, entra, e o sistema liga a conta ao schema sozinho — sem ninguém editar
metadata à mão no painel.

Isso não era verdade até hoje de manhã. Passou a ser.

---

## 3. Controle de migração

Hoje são 50 scripts que varrem `information_schema` e decidem sozinhos se já
rodaram. Com um cliente isso se administra de cabeça. Com dez, um script que
falhou no meio deixa schemas divergentes e ninguém descobre até a tela quebrar.

Proposta: `public.t_migracao` com `(nome_script, schema_name, aplicado_em)`.
Cada script consulta antes e registra depois. Quem quiser saber o estado de um
cliente faz uma consulta, não uma arqueologia.

Isso **não** é pré-requisito para o primeiro cliente novo. É pré-requisito para
o terceiro.

---

## 4. Ordem de execução

1. **Verificar FKs, triggers e views** no schema da Zaghi — pode mudar o plano
2. Criar `tenant_modelo` a partir da Zaghi, sem dados
3. Declarar e aplicar a semente
4. Escrever `provisionar-tenant.js`
5. Provisionar um `tenant_teste` e navegar o sistema inteiro por ele
6. Só então oferecer para cliente de verdade
7. Depois, e separadamente: `t_migracao`
8. Depois, e separadamente: painel interno chamando a mesma lógica

O passo 5 não é formalidade. É o único jeito de descobrir o que o schema-modelo
esqueceu, e é barato: um schema de teste se apaga.

---

## 5. O que este plano deliberadamente não faz

- **Não migra a Zaghi para nada.** O schema deles é lido, nunca escrito.
- **Não troca schema-por-tenant por `tenant_id` compartilhado.** Schema por
  cliente aguenta centenas de clientes e é o que já está de pé. Revisitar essa
  decisão só se justifica com dezenas de clientes pagando.
- **Não mexe nas 226 chamadas de `resolveTenant`** nem no `SET search_path`.
  É a mudança mais invasiva e a menos urgente.
- **Não remove os 54 `@ts-nocheck`.** Isso vai acontecendo por rota tocada.
- **Não trata o teto do pool de conexões** (`max: 20` por instância). É o que
  limita carga, não número de clientes — e vira problema depois dos clientes,
  não antes.
