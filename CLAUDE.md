# sistematiza.erp

ERP multi-tenant **em produção**. Cliente vivo: fábrica de massas Zaghi Massas
Caseiras, schema `tenant_zaghi_massas_caseiras`. O Fabiano pretende revender o
sistema para outros clientes — por isso decisões de arquitetura são pensadas
para vários tenants, não só para a Zaghi.

Next.js 14 (App Router) · Drizzle ORM · Postgres · Clerk · Vercel.

---

## Ordens permanentes do Fabiano

Estas não são preferências de estilo. São condições de trabalho, e ele já teve
prejuízo com cada uma delas.

- **Só faça o que foi pedido.** Nada de alterar, remover ou implementar por
  conta própria. Encontrou outro problema? Reporte e pergunte.
- **Nunca desfaça algo já feito** sem autorização explícita.
- **O app está em produção.** Não existe "depois eu arrumo".
- **Nunca rode `git` a partir do sandbox** — já corrompeu um `index.lock`.
  Quem executa build, git e deploy é o Fabiano, na máquina dele.
- **O comando de deploy é `npx vercel --prod`.** Não sugira outro.
- **Sem legendas na tela.** Nada de aviso explicando ausência ou mudança de
  endereço. Explicação vai em `InfoTip`, **uma frase**, sem tom informal.
- **Pergunte quando houver dúvida de escopo.** Ele prefere responder a
  retrabalhar.

### Ao entregar código

Termine sempre com os comandos de finalização, nesta ordem:

```powershell
npm run build
git add -A
git commit -m "..."
git push
npx vercel --prod
```

**Confirme que o `npm run build` passou antes do push.** Build quebrado faz o
deploy falhar e produção fica no código velho — aconteceu duas vezes em
09/08/2026 e custou horas.

---

## Limite conhecido da verificação

O sandbox não roda o build do projeto (`tsc` não termina na pasta montada em
OneDrive). O que dá para checar sozinho:

```bash
# parse de TS/TSX
node -e "const ts=require('typescript'),fs=require('fs');const f='ARQUIVO';
const sf=ts.createSourceFile(f,fs.readFileSync(f,'utf8'),ts.ScriptTarget.ESNext,true,ts.ScriptKind.TSX);
console.log((sf.parseDiagnostics||[]).length?'ERRO':'ok')"

node --check scripts/algum-script.js
```

**Isso valida sintaxe, não tipos nem nomes de coluna.** Três erros passaram por
essa checagem em 09/08/2026 e só apareceram no build do Fabiano:

- crase dentro de comentário SQL em template literal (o parser aceita, o SWC não)
- duas propriedades com o mesmo nome no schema do Drizzle
- nome de coluna que não existe na tabela

Se você tiver terminal na máquina dele, **compile antes de entregar**.

---

## Armadilhas específicas deste projeto

**Coluna fantasma no Drizzle.** O Drizzle monta o `INSERT` com *todas* as
colunas declaradas. Declarar uma que não existe na tabela quebra **toda**
inserção, não só quem a usaria. Derrubou o PDV inteiro com erro 42703.

**Coluna que existe e não chega na tela.** O padrão inverso: a coluna entra por
script de migração e alguma das quatro camadas não acompanha — schema do
Drizzle, validação Zod, `SELECT` da API, formulário. O sintoma é campo vazio; o
agravante é que salvar por cima apaga o que existia. Ao mexer em qualquer
coluna, confira as quatro.

**Comentário SQL não pode ter crase** dentro de template literal.

**`t_cliente.documento`**, não `cnpj_cpf` — essa é do fornecedor.

**Dinheiro é inteiro em centavos**, em todo o sistema.

**Data vinda da API é timestamp completo.** Nunca concatene `'T12:00:00'`; use
`fmtData` de `lib/format.ts`.

**`ConfiguracoesService` enxerga menos que `t_configuracoes_tenant`.** Campos
fiscais e de caixa não estão no schema do Drizzle; quem precisa deles usa SQL
cru. Ler por ali devolve `undefined`.

---

## Convenções de tela (valem para toda tela nova)

1. Formulário é **drawer** (`FormModal` / `SidePanel`), nunca modal centralizado
2. Modal só para confirmação Sim/Não
3. O drawer permanece aberto após salvar, limpando os campos
4. Cabeçalho de tabela congelado
5. Explicação em `InfoTip`, uma frase
6. `sem-spinner` em campo de dinheiro e número
7. `created_by` / `updated_by` com o usuário real logado
8. Marca **Sistematiza.ai**, com `.ai` em `#2ecc71`

---

## Fluxo de trabalho com o Trello

Quadro **QA Sistematiza**, workspace "Área de trabalho de Massas Zaghi".
A QA é a Maria Luiza (`@massaszaghi`).

```
BACKLOG BUGS / BACKLOG MELHORIAS / REABERTO
        ↓  (Claude puxa)
     FAZENDO          ← Claude atua aqui
        ↓  (Claude move ao terminar E depois do deploy)
     RETESTE          ← humano testa
        ↓
   DONE  ou  REABERTO
```

- **Reteste é ação humana.** Não mexa nesses cartões.
- Só mova para Reteste **depois que o Fabiano confirmar o deploy** — não
  quando o código ficar pronto.
- Um cartão por vez: puxe, diga o que entendeu do escopo, atue, reporte.
- **O conector não lê comentários nem anexos** — só quadro, lista, cartão e
  checklist. Boa parte do contexto vive nos comentários; peça ao Fabiano que
  cole aqui.

---

## Estado do módulo fiscal (09/08/2026)

Emissão via **Focus NFe**, isolada em `FiscalService`. Configuração carregada de
dados reais pelo `scripts/seed-fiscal-zaghi.js`.

**Pronto:** dados da empresa, CRT 1 (Simples), CNAE 1094-5/00, mensagem
obrigatória com o crédito de 1,25% (Portaria SUTRI 837/2019 – MG), dois perfis
tributários, NCM/CEST de 30 produtos, 9 marcados como insumo.

**Parâmetros deduzidos da NF-e 3.313 do Everest** — a conta bate centavo por
centavo com a DANFE: CFOP 5401, CSOSN 201, MVA 35%, ICMS interno MG 18%.

```
base ST = valor × (1 + MVA)
ST      = base × alíq − valor × alíq
```

**Falta, e depende de terceiros:** certificado A1 (`.pfx`; a Focus não aceita
A3), CSC de homologação **e** de produção (são diferentes), conta na Focus com
**série 2** (deixando a 001 para o Everest, que ainda emite), NCM/CEST de 9
produtos, e a IE + endereço dos clientes contribuintes.

**Para o contador:** CFOP da venda a consumidor final; confirmar a dedução da
ST; três valores suspeitos herdados do Everest (molho branco com NCM de fumo,
Sorrentino com CEST zerado, CST de PIS/COFINS divergente).

`scripts/conferir-payload-fiscal.js` mostra o JSON que iria para a SEFAZ **sem
transmitir** — use antes da primeira emissão.

---

## Onde está o resto

**`docs/backlog.md`** é a fonte da verdade sobre o que ficou pendente. Quando o
Fabiano diz "guarda no backlog", o item entra lá; quando ele pergunta "o que
falta?", a resposta sai de lá — não da memória da conversa.

Não testado em uso real: o novo Financeiro (caixa, pedido → conta a receber →
venda) e a tenantização (nenhum tenant de teste provisionado).
