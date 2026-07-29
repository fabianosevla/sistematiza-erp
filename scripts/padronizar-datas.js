/**
 * scripts/padronizar-datas.js
 *
 * Segunda rodada da padronização: datas e quantidade.
 * Mesma mecânica do padronizar-format.js — remove a definição local e importa
 * com apelido, sem tocar em nenhuma chamada.
 *
 * O QUE ELE TROCA (equivalência verificada caso a caso):
 *
 *   fmtQtd  →  fmtQtd        corpo idêntico ao de lib/format.ts
 *   fmtDate →  fmtData       versões com 'T12:00:00' / 'T00:00:00' e a
 *                            versão por regex: todas produzem dd/mm/aaaa
 *                            sem deslocamento de fuso
 *   fmtDate →  fmtDataCurta  versão que mostra só dia/mês
 *   toInputDate → toInputDate
 *
 * O QUE ELE NÃO TROCA (fica no relatório, para decisão sua):
 *
 *   qualquer new Date(x) aplicado a TIMESTAMP — Vendas, Consultas, Fidelidade.
 *   Nesses, a versão atual mostra a data no fuso do navegador e a nova lê a
 *   data como veio do banco. Perto da meia-noite os dois resultados divergem
 *   em um dia, então a escolha é sua, tela por tela.
 *
 * Uso:
 *   node scripts/padronizar-datas.js            simulação
 *   node scripts/padronizar-datas.js --apply    aplica
 */

const fs   = require('fs')
const path = require('path')

const VERSAO = 'v2'
const RAIZ = process.cwd()
const APLICAR = process.argv.includes('--apply')

const PASTAS = ['app', 'components', 'lib', 'hooks']
const IGNORAR_DIR = new Set(['node_modules', '.next', '.git', 'dist', 'build'])
const IGNORAR_ARQUIVO = [
  'middleware.ts',
  path.join('app', 'page.tsx'),
  path.join('app', 'onboarding', 'page.tsx'),
  'tenant-layout.tsx',
  path.join('lib', 'format.ts'),
  path.join('lib', 'unidades.ts'),
]

// Regras na ordem de tentativa. A primeira cujo corpo bater é aplicada.
const REGRAS = [
  {
    nome: 'fmtQtd', exportado: 'fmtQtd', modulo: '@/lib/format',
    valida: b => /toFixed\(\s*6\s*\)/.test(b) && /padEnd\(\s*3/.test(b),
    porque: 'corpo idêntico ao de lib/format.ts',
  },
  {
    nome: 'fmtDate', exportado: 'fmtData', modulo: '@/lib/format',
    valida: b => /T12:00:00|T00:00:00/.test(b),
    porque: "concatena hora fixa só para escapar do fuso — fmtData faz isso lendo a data direto",
  },
  {
    nome: 'fmtDate', exportado: 'fmtData', modulo: '@/lib/format',
    valida: b => /match\(/.test(b) && /\\d\{4\}/.test(b),
    porque: 'já lê a data por regex, igual ao fmtData',
  },
  {
    nome: 'fmtDate', exportado: 'fmtDataCurta', modulo: '@/lib/format',
    valida: b => /day:\s*'2-digit'/.test(b) && /month:\s*'2-digit'/.test(b) && !/year/.test(b) && !/hour/.test(b),
    porque: 'mostra apenas dia/mês',
  },
  {
    nome: 'toInputDate', exportado: 'toInputDate', modulo: '@/lib/format',
    valida: b => /match\(/.test(b) && /\\d\{4\}-\\d\{2\}-\\d\{2\}/.test(b),
    porque: 'idêntico ao toInputDate de lib/format.ts',
  },

  // ── MOMENTOS (timestamp) ────────────────────────────────────────────────
  // Estas regras vêm por último de propósito: só pegam o que não bateu com
  // nenhuma das anteriores, ou seja, new Date() aplicado a timestamp.
  // Mantêm o fuso do navegador, que é o correto para "quando aconteceu".
  ...['fmtDate', 'fmtDateHora', 'fmtData', 'fmtDataCurta'].flatMap(nome => ([
    {
      nome, exportado: 'fmtDataHoraLocal', modulo: '@/lib/format',
      valida: b => /new Date\(/.test(b) && /hour/.test(b),
      porque: 'momento com hora — segue no fuso do navegador',
    },
    {
      nome, exportado: 'fmtDataLocal', modulo: '@/lib/format',
      valida: b => /new Date\(/.test(b) && /toLocaleDateString/.test(b) && !/hour/.test(b),
      porque: 'data de um momento — segue no fuso do navegador',
    },
  ])),
]

const relatorio = { trocados: [], revisar: [], arquivos: 0 }

// ── util (mesma engine do padronizar-format.js v3) ──────────────────────────

function listarArquivos(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const nome of fs.readdirSync(dir)) {
    if (IGNORAR_DIR.has(nome)) continue
    const p = path.join(dir, nome)
    const st = fs.statSync(p)
    if (st.isDirectory()) listarArquivos(p, acc)
    else if (/\.(ts|tsx)$/.test(nome)) acc.push(p)
  }
  return acc
}

function ignorado(arquivo) {
  const rel = path.relative(RAIZ, arquivo)
  return IGNORAR_ARQUIVO.some(x => rel === x || rel.endsWith(path.sep + x) || rel.endsWith(x))
}

function acharDefinicao(src, nome) {
  const padroes = [
    new RegExp(`^[ \\t]*(?:export\\s+)?function\\s+${nome}\\s*\\(`, 'm'),
    new RegExp(`^[ \\t]*(?:export\\s+)?const\\s+${nome}\\s*=\\s*`, 'm'),
  ]
  for (const re of padroes) {
    const m = re.exec(src)
    if (!m) continue
    const inicio = m.index
    let nivel = 0
    let viuAbertura = false
    let emTexto = null

    for (let i = inicio; i < src.length; i++) {
      const c = src[i]
      const anterior = src[i - 1]
      if (emTexto) {
        if (c === emTexto && anterior !== '\\') emTexto = null
        continue
      }
      if (c === "'" || c === '"' || c === '`') { emTexto = c; continue }
      if (c === '(' || c === '{' || c === '[') { nivel++; viuAbertura = true }
      else if (c === ')' || c === '}' || c === ']') nivel--
      else if (c === '\n' && viuAbertura && nivel <= 0) {
        return { inicio, fim: i + 1, texto: src.slice(inicio, i + 1) }
      }
    }
    return { inicio, fim: src.length, texto: src.slice(inicio) }
  }
  return null
}

function inserirImports(src, porModulo) {
  for (const [modulo, apelidos] of Object.entries(porModulo)) {
    const nomes = apelidos.map(a => a.exportado === a.local ? a.exportado : `${a.exportado} as ${a.local}`)

    const reExistente = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${modulo.replace('/', '\\/')}['"]`)
    const existente = reExistente.exec(src)
    if (existente) {
      const atuais = existente[1].split(',').map(s => s.trim()).filter(Boolean)
      const todos  = [...new Set([...atuais, ...nomes])]
      src = src.replace(existente[0], `import { ${todos.join(', ')} } from '${modulo}'`)
      continue
    }

    const linha = `import { ${nomes.join(', ')} } from '${modulo}'`
    const linhas = src.split('\n')
    const COMPLETO = /^\s*import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?\s*$/
    const SIMPLES  = /^\s*import\s+[^{].*from\s*['"][^'"]+['"];?\s*$/
    const ABRE     = /^\s*import\s*\{(?![^}]*\})/
    const FECHA    = /^\s*\}\s*from\s*['"][^'"]+['"];?\s*$/

    let idx = -1
    let aberto = false
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i]
      if (aberto) {
        if (FECHA.test(l)) { aberto = false; idx = i }
        continue
      }
      if (COMPLETO.test(l) || SIMPLES.test(l)) { idx = i; continue }
      if (ABRE.test(l)) { aberto = true; continue }
      if (l.trim() !== '' && idx !== -1) break
    }
    if (idx === -1) idx = /^['"]use client['"]/.test(linhas[0]) ? 0 : -1
    linhas.splice(idx + 1, 0, linha)
    src = linhas.join('\n')
  }
  return src
}

// ── processamento ───────────────────────────────────────────────────────────

for (const arquivo of PASTAS.flatMap(p => listarArquivos(path.join(RAIZ, p)))) {
  if (ignorado(arquivo)) continue

  let src = fs.readFileSync(arquivo, 'utf8')
  const original = src
  const rel = path.relative(RAIZ, arquivo).replace(/\\/g, '/')
  const porModulo = {}
  const removidos = []
  const jaVistos = new Set()

  for (const regra of REGRAS) {
    if (jaVistos.has(regra.nome)) continue
    const def = acharDefinicao(src, regra.nome)
    if (!def) continue
    if (/^\s*export\s/.test(def.texto)) {
      relatorio.revisar.push({ arquivo: rel, nome: regra.nome, motivo: 'definição exportada' })
      jaVistos.add(regra.nome)
      continue
    }
    if (!regra.valida(def.texto)) continue

    src = src.slice(0, def.inicio) + src.slice(def.fim)
    ;(porModulo[regra.modulo] ||= []).push({ local: regra.nome, exportado: regra.exportado })
    removidos.push(`${regra.nome} → ${regra.exportado}  (${regra.porque})`)
    jaVistos.add(regra.nome)
  }

  // o que sobrou com esses nomes vai para o relatório
  for (const nome of ['fmtDate', 'fmtDateHora', 'fmtData', 'fmtDataCurta', 'fmtQtd', 'toInputDate']) {
    if (jaVistos.has(nome)) continue
    const def = acharDefinicao(src, nome)
    if (def) {
      relatorio.revisar.push({
        arquivo: rel, nome,
        motivo: 'usa new Date() sobre timestamp — decidir tela a tela',
        corpo: def.texto.trim().slice(0, 150),
      })
    }
  }

  if (removidos.length === 0) continue

  src = inserirImports(src, porModulo)
  src = src.replace(/\n{3,}/g, '\n\n')

  if (src !== original) {
    relatorio.arquivos++
    relatorio.trocados.push({ arquivo: rel, removidos })
    if (APLICAR) fs.writeFileSync(arquivo, src, 'utf8')
  }
}

console.log(`\npadronizar-datas ${VERSAO} — ${APLICAR ? '✍️  APLICANDO' : '🔍 SIMULAÇÃO (nada foi escrito — use --apply)'}\n`)
console.log(`Arquivos alterados: ${relatorio.arquivos}`)
for (const t of relatorio.trocados) {
  console.log(`  ✓ ${t.arquivo}`)
  for (const r of t.removidos) console.log(`      ${r}`)
}
if (relatorio.revisar.length) {
  console.log(`\nDecisão manual (${relatorio.revisar.length}):`)
  for (const r of relatorio.revisar) {
    console.log(`  • ${r.arquivo} — ${r.nome}: ${r.motivo}`)
    if (r.corpo) console.log(`      ${r.corpo.replace(/\s+/g, ' ')}`)
  }
}
console.log('')