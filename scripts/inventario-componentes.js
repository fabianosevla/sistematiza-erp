/**
 * scripts/inventario-componentes.js
 *
 * SOMENTE LEITURA. Não altera nenhum arquivo.
 *
 * Varre as telas e responde, por arquivo:
 *   - o que já usa componente compartilhado
 *   - o que reimplementou na mão (e portanto é candidato à padronização)
 *
 * Uso:
 *   node scripts/inventario-componentes.js            imprime no terminal
 *   node scripts/inventario-componentes.js --md       grava docs/inventario-componentes.md
 */

const fs   = require('fs')
const path = require('path')

const RAIZ = process.cwd()
const GERAR_MD = process.argv.includes('--md')
const PASTAS = ['app', 'components']
const IGNORAR_DIR = new Set(['node_modules', '.next', '.git', 'ui'])

// nome → { usa: regex de adoção do componente, mao: regex de implementação local }
const CHECAGENS = {
  'Paginação': {
    usa: /from\s+['"]@\/components\/ui\/Paginacao['"]|<Paginacao/,
    mao: /totalPages|Anterior|Próxima|Proxima/,
  },
  'Estado vazio': {
    usa: /<EmptyState/,
    mao: /Nenhum\s|Nada encontrado|não encontrad/i,
  },
  'Carregando': {
    usa: /<TableSkeleton|<Skeleton/,
    mao: /animate-spin|Carregando\.\.\.|isLoading \?/,
  },
  'Confirmação': {
    usa: /<ConfirmModal/,
    mao: /window\.confirm|confirm\(/,
  },
  'Modal': {
    usa: /<FormModal/,
    mao: /fixed inset-0 z-50/,
  },
  'Tabela': {
    usa: /<DataTable/,
    mao: /<table/,
  },
  'Busca': {
    usa: /<Toolbar|<SearchInput/,
    mao: /placeholder=["'][^"']*(Buscar|Pesquisar)/i,
  },
  'Badge de status': {
    usa: /<StatusBadge/,
    mao: /rounded-full[^"']*px-|<Badge/,
  },
  'Aviso inline': {
    usa: /<Alert/,
    mao: /bg-(amber|yellow|red|blue)-50[^"']*border/,
  },
  'Toast': {
    usa: /useToast/,
    mao: /alert\(/,
  },
}

function listar(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const nome of fs.readdirSync(dir)) {
    if (IGNORAR_DIR.has(nome)) continue
    const p = path.join(dir, nome)
    const st = fs.statSync(p)
    if (st.isDirectory()) listar(p, acc)
    else if (/\.tsx$/.test(nome) && !/\.d\.tsx$/.test(nome)) acc.push(p)
  }
  return acc
}

const arquivos = PASTAS.flatMap(p => listar(path.join(RAIZ, p)))
  .filter(f => {
    const src = fs.readFileSync(f, 'utf8')
    // só telas de verdade: precisam renderizar algo e ter mais de 80 linhas
    return src.split('\n').length > 80
  })

const linhas = []
const totais = {}
for (const nome of Object.keys(CHECAGENS)) totais[nome] = { adotado: 0, mao: 0 }

for (const arquivo of arquivos) {
  const src = fs.readFileSync(arquivo, 'utf8')
  const rel = path.relative(RAIZ, arquivo).replace(/\\/g, '/')
  const resultado = { arquivo: rel, itens: {}, pendencias: 0 }

  for (const [nome, chk] of Object.entries(CHECAGENS)) {
    const usa = chk.usa.test(src)
    const mao = chk.mao.test(src)
    let estado = '—'
    if (usa && !mao)      { estado = 'ok';       totais[nome].adotado++ }
    else if (usa && mao)  { estado = 'misto';    totais[nome].adotado++; totais[nome].mao++; resultado.pendencias++ }
    else if (mao)         { estado = 'na mão';   totais[nome].mao++;     resultado.pendencias++ }
    resultado.itens[nome] = estado
  }

  if (Object.values(resultado.itens).some(v => v !== '—')) linhas.push(resultado)
}

linhas.sort((a, b) => b.pendencias - a.pendencias)

// ── saída ───────────────────────────────────────────────────────────────────

const nomes = Object.keys(CHECAGENS)

console.log(`\nTelas analisadas: ${linhas.length}\n`)
console.log('Resumo por componente (quantas telas):')
for (const nome of nomes) {
  const t = totais[nome]
  console.log(`  ${nome.padEnd(18)} adotado: ${String(t.adotado).padStart(2)}   na mão: ${String(t.mao).padStart(2)}`)
}

console.log('\nTelas com mais pendências:')
for (const l of linhas.slice(0, 20)) {
  const pend = nomes.filter(n => l.itens[n] === 'na mão' || l.itens[n] === 'misto')
  console.log(`  ${String(l.pendencias).padStart(2)}  ${l.arquivo}`)
  console.log(`      ${pend.join(', ')}`)
}

if (GERAR_MD) {
  const md = []
  md.push('# Inventário de componentes\n')
  md.push(`Gerado em ${new Date().toLocaleString('pt-BR')} — ${linhas.length} telas.\n`)
  md.push('Legenda: `ok` usa componente compartilhado · `na mão` reimplementado na tela · `misto` os dois no mesmo arquivo.\n')
  md.push('## Resumo\n')
  md.push('| Componente | Telas que adotam | Telas na mão |')
  md.push('|---|---|---|')
  for (const nome of nomes) md.push(`| ${nome} | ${totais[nome].adotado} | ${totais[nome].mao} |`)
  md.push('\n## Por tela\n')
  md.push(`| Tela | ${nomes.join(' | ')} |`)
  md.push(`|---|${nomes.map(() => '---').join('|')}|`)
  for (const l of linhas) md.push(`| ${l.arquivo} | ${nomes.map(n => l.itens[n]).join(' | ')} |`)

  const destino = path.join(RAIZ, 'docs')
  if (!fs.existsSync(destino)) fs.mkdirSync(destino)
  fs.writeFileSync(path.join(destino, 'inventario-componentes.md'), md.join('\n') + '\n', 'utf8')
  console.log('\n📄 docs/inventario-componentes.md gravado.')
}

console.log('')