/**
 * scripts/gerar-diagramas.js
 *
 * SOMENTE LEITURA. Gera docs/arquitetura.md com diagramas Mermaid extraídos
 * do código — não de memória, não escritos à mão. Rodando de novo, o documento
 * se atualiza sozinho.
 *
 * O que ele produz:
 *   1. Mapa de módulos (telas por área)
 *   2. Catálogo de rotas de API (método + caminho)
 *   3. Diagrama de classes dos serviços (classDiagram)
 *   4. Modelo de dados por tenant (erDiagram, lido dos schemas Drizzle)
 *
 * Uso:
 *   node scripts/gerar-diagramas.js
 */

const fs   = require('fs')
const path = require('path')

const RAIZ = process.cwd()
const IGNORAR = new Set(['node_modules', '.next', '.git', 'dist', 'build'])

function listar(dir, filtro, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const nome of fs.readdirSync(dir)) {
    if (IGNORAR.has(nome)) continue
    const p = path.join(dir, nome)
    const st = fs.statSync(p)
    if (st.isDirectory()) listar(p, filtro, acc)
    else if (filtro(p)) acc.push(p)
  }
  return acc
}

const rel = p => path.relative(RAIZ, p).replace(/\\/g, '/')

// ── 1. Módulos ──────────────────────────────────────────────────────────────

function mapaDeModulos() {
  const base = path.join(RAIZ, 'components', 'modules')
  if (!fs.existsSync(base)) return { linhas: ['_pasta components/modules não encontrada_'], mermaid: [] }

  const modulos = fs.readdirSync(base).filter(n => fs.statSync(path.join(base, n)).isDirectory())
  const linhas = ['| Módulo | Telas |', '|---|---|']
  const mermaid = ['flowchart LR', '  APP[Sistematiza ERP]']

  for (const m of modulos) {
    const telas = listar(path.join(base, m), p => /\.tsx$/.test(p)).map(p => path.basename(p, '.tsx'))
    linhas.push(`| ${m} | ${telas.join(', ') || '—'} |`)
    const id = m.replace(/[^A-Za-z0-9]/g, '_')
    mermaid.push(`  APP --> ${id}[${m}]`)
  }
  return { linhas, mermaid }
}

// ── 2. Rotas ────────────────────────────────────────────────────────────────

function catalogoDeRotas() {
  const base = path.join(RAIZ, 'app', 'api')
  if (!fs.existsSync(base)) return ['_pasta app/api não encontrada_']

  const arquivos = listar(base, p => /route\.ts$/.test(p))
  const linhas = ['| Método | Rota | Arquivo |', '|---|---|---|']

  for (const arq of arquivos.sort()) {
    const src = fs.readFileSync(arq, 'utf8')
    const metodos = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
      .filter(m => new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}\\b`).test(src))
    const rota = '/' + rel(arq).replace(/^app\//, '').replace(/\/route\.ts$/, '')
    for (const m of metodos) linhas.push(`| ${m} | \`${rota}\` | ${rel(arq)} |`)
    if (metodos.length === 0) linhas.push(`| ? | \`${rota}\` | ${rel(arq)} |`)
  }
  return linhas
}

// ── 3. Serviços ─────────────────────────────────────────────────────────────

function diagramaDeServicos() {
  const base = path.join(RAIZ, 'lib', 'services')
  if (!fs.existsSync(base)) return { mermaid: ['classDiagram'], tabela: ['_pasta lib/services não encontrada_'] }

  const arquivos = listar(base, p => /\.ts$/.test(p))
  const mermaid = ['classDiagram']
  const tabela  = ['| Serviço | Métodos públicos | Arquivo |', '|---|---|---|']

  for (const arq of arquivos.sort()) {
    const src = fs.readFileSync(arq, 'utf8')
    const mClasse = /export\s+class\s+(\w+)/.exec(src)
    if (!mClasse) continue
    const classe = mClasse[1]

    const metodos = []
    const re = /^\s{2}(?:public\s+)?(?:async\s+)?(\w+)\s*\(/gm
    let m
    while ((m = re.exec(src)) !== null) {
      const nome = m[1]
      if (['constructor', 'if', 'for', 'while', 'switch', 'catch', 'return'].includes(nome)) continue
      if (new RegExp(`private\\s+(?:async\\s+)?${nome}\\s*\\(`).test(src)) continue
      if (!metodos.includes(nome)) metodos.push(nome)
    }

    mermaid.push(`  class ${classe} {`)
    for (const met of metodos) mermaid.push(`    +${met}()`)
    mermaid.push('  }')

    // dependências: outros serviços instanciados dentro
    const deps = [...src.matchAll(/new\s+(\w+Service)\s*\(/g)].map(x => x[1])
    for (const d of [...new Set(deps)]) if (d !== classe) mermaid.push(`  ${classe} ..> ${d}`)

    tabela.push(`| ${classe} | ${metodos.join(', ') || '—'} | ${rel(arq)} |`)
  }
  return { mermaid, tabela }
}

// ── 4. Modelo de dados ──────────────────────────────────────────────────────

function modeloDeDados() {
  const base = path.join(RAIZ, 'lib', 'db', 'schemas')
  if (!fs.existsSync(base)) return ['erDiagram', '  %% pasta lib/db/schemas não encontrada']

  const arquivos = listar(base, p => /\.ts$/.test(p))
  const mermaid = ['erDiagram']
  const relacoes = []

  // variável Drizzle (dbVenda) → nome real da tabela (t_venda), para que as
  // relações saiam com o nome do banco e não com o do código
  const tabelaDaVar = {}
  for (const arq of arquivos) {
    const src = fs.readFileSync(arq, 'utf8')
    const re = /export\s+const\s+(\w+)\s*=\s*\w+\(\s*['"]([^'"]+)['"]/g
    let m
    while ((m = re.exec(src)) !== null) tabelaDaVar[m[1]] = m[2]
  }

  const tabelas = []   // { nome, campos, pk }

  for (const arq of arquivos.sort()) {
    const src = fs.readFileSync(arq, 'utf8')
    const reTabela = /export\s+const\s+(\w+)\s*=\s*\w+\(\s*['"]([^'"]+)['"]\s*,\s*\{([\s\S]*?)\n\}\)/g
    let t
    while ((t = reTabela.exec(src)) !== null) {
      const [, , nomeTabela, corpo] = t
      const campos = []
      const reCampo = /(\w+)\s*:\s*(\w+)\(\s*['"]([^'"]+)['"]([^,\n]*)/g
      let c
      while ((c = reCampo.exec(corpo)) !== null) {
        campos.push({ tipo: c[2], coluna: c[3], pk: /primaryKey/.test(c[4] ?? '') })
      }
      const pk = campos.find(x => x.pk)?.coluna ?? null
      tabelas.push({ nome: nomeTabela, campos, pk })

      mermaid.push(`  ${nomeTabela} {`)
      for (const campo of campos.slice(0, 18)) {
        mermaid.push(`    ${campo.tipo} ${campo.coluna}${campo.pk ? ' PK' : ''}`)
      }
      if (campos.length > 18) mermaid.push(`    _ mais_${campos.length - 18}_colunas`)
      mermaid.push('  }')

      // relações declaradas explicitamente
      const reRef = /references\(\s*\(\)\s*=>\s*(\w+)\.(\w+)/g
      let r
      while ((r = reRef.exec(corpo)) !== null) {
        const pai = tabelaDaVar[r[1]] ?? r[1]
        relacoes.push(`  ${pai} ||--o{ ${nomeTabela} : "tem"`)
      }
    }
  }

  // Relações inferidas pela convenção de nomes: a coluna `venda_id` em
  // t_venda_item aponta para a tabela cuja chave primária é `venda_id`.
  // Necessário porque os schemas não declaram .references().
  const donoDaPk = {}
  for (const t of tabelas) if (t.pk) donoDaPk[t.pk] = t.nome

  for (const t of tabelas) {
    for (const campo of t.campos) {
      if (!/_id$/.test(campo.coluna)) continue
      if (campo.pk) continue
      const pai = donoDaPk[campo.coluna]
      if (!pai || pai === t.nome) continue
      relacoes.push(`  ${pai} ||--o{ ${t.nome} : "${campo.coluna}"`)
    }
  }

  return [...mermaid, ...[...new Set(relacoes)]]
}

// ── montagem ────────────────────────────────────────────────────────────────

const modulos  = mapaDeModulos()
const rotas    = catalogoDeRotas()
const servicos = diagramaDeServicos()
const dados    = modeloDeDados()

const doc = []
doc.push('# Arquitetura — Sistematiza ERP\n')
doc.push(`> Documento gerado por \`scripts/gerar-diagramas.js\` em ${new Date().toLocaleString('pt-BR')}.`)
doc.push('> Não edite à mão: rode o script de novo depois de mudar o código.\n')

doc.push('## 1. Visão de contexto\n')
doc.push('```mermaid')
doc.push('flowchart TB')
doc.push('  Operador[Operador de loja] --> App')
doc.push('  Gestor[Gestor] --> App')
doc.push('  App[Sistematiza ERP<br/>Next.js App Router] --> Clerk[Clerk<br/>autenticação]')
doc.push('  App --> PG[(PostgreSQL<br/>um schema por tenant)]')
doc.push('  App --> Vercel[Vercel<br/>hospedagem e build]')
doc.push('```\n')

doc.push('## 2. Módulos e telas\n')
doc.push(...modulos.linhas)
doc.push('\n```mermaid')
doc.push(...modulos.mermaid)
doc.push('```\n')

doc.push('## 3. Rotas de API\n')
doc.push(...rotas)
doc.push('')

doc.push('## 4. Serviços de domínio\n')
doc.push(...servicos.tabela)
doc.push('\n```mermaid')
doc.push(...servicos.mermaid)
doc.push('```\n')

doc.push('## 5. Modelo de dados (schema de tenant)\n')
doc.push('```mermaid')
doc.push(...dados)
doc.push('```\n')

doc.push('## 6. Convenções que o diagrama não mostra\n')
doc.push('- Multi-tenant por schema: todo acesso passa por `resolveTenant` e `SET search_path`')
doc.push('- Dinheiro é inteiro em centavos; formatação só na exibição (`lib/format.ts`)')
doc.push('- Exclusão é lógica (`active_flg = false`), nunca `DELETE`')
doc.push('- Concorrência por `modification_num` (optimistic locking)')
doc.push('- Em `t_produto_insumo`, `insumo_id < 0` referencia um produto usado como insumo (ver `lib/constants.ts`)')
doc.push('- Migrations são scripts idempotentes em `scripts/*.js`, rodados à mão\n')

const destino = path.join(RAIZ, 'docs')
if (!fs.existsSync(destino)) fs.mkdirSync(destino)
fs.writeFileSync(path.join(destino, 'arquitetura.md'), doc.join('\n'), 'utf8')

console.log('\n📄 docs/arquitetura.md gerado.')
console.log(`   módulos: ${modulos.linhas.length - 2}`)
console.log(`   rotas:   ${rotas.length - 2}`)
console.log(`   serviços:${servicos.tabela.length - 2}`)
console.log('')