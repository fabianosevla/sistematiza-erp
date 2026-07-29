/**
 * scripts/padronizar-format.js
 *
 * Remove as cópias locais de formatadores e conversores, e passa a importar
 * de lib/format.ts e lib/unidades.ts.
 *
 * A troca é feita por APELIDO no import:
 *
 *     function fmt(c) { ... }                     ← removido
 *     import { fmtMoeda as fmt } from '@/lib/format'   ← adicionado
 *
 * Assim NENHUMA chamada muda: quem escrevia fmt(x) continua escrevendo fmt(x).
 * O diff fica pequeno e o comportamento, idêntico.
 *
 * Segurança:
 *  - só remove definições cujo corpo bate com o padrão conhecido
 *  - qualquer variação diferente é apenas REPORTADA, nunca tocada
 *  - datas são sempre reportadas (as versões locais divergem entre si)
 *  - roda em modo simulação por padrão
 *
 * Uso:
 *   node scripts/padronizar-format.js            (simulação: não escreve nada)
 *   node scripts/padronizar-format.js --apply    (aplica)
 */

const fs   = require('fs')
const path = require('path')

// v3 — extrator conta (), {} e [] e ignora strings; import entra depois do
//      último bloco de import, nunca dentro dele.
const VERSAO = 'v3'

const RAIZ  = process.cwd()
const APLICAR = process.argv.includes('--apply')

const PASTAS = ['app', 'components', 'lib', 'hooks']
const IGNORAR_DIR = new Set(['node_modules', '.next', '.git', 'dist', 'build'])

// Arquivos que ninguém toca automaticamente
const IGNORAR_ARQUIVO = [
  'middleware.ts',
  path.join('app', 'page.tsx'),
  path.join('app', 'onboarding', 'page.tsx'),
  'tenant-layout.tsx',
  path.join('lib', 'format.ts'),
  path.join('lib', 'unidades.ts'),
]

// nome local → { modulo, exportado, valida(corpo) }
const MAPA = {
  fmt: {
    modulo: '@/lib/format', exportado: 'fmtMoeda',
    valida: b => /toLocaleString\(\s*['"]pt-BR['"]/.test(b) && /currency/.test(b) && /100/.test(b),
  },
  formatCents: {
    modulo: '@/lib/format', exportado: 'fmtMoeda',
    valida: b => /toLocaleString\(\s*['"]pt-BR['"]/.test(b) && /currency/.test(b) && /100/.test(b),
  },
  fmtInput: {
    modulo: '@/lib/format', exportado: 'fmtMoedaInput',
    valida: b => /toFixed\(\s*2\s*\)/.test(b) && /100/.test(b),
  },
  converterUnidade: {
    modulo: '@/lib/unidades', exportado: 'converterUnidade',
    valida: b => /kg/.test(b) && /1000/.test(b),
  },
  unidadesCompativeis: {
    modulo: '@/lib/unidades', exportado: 'unidadesCompativeis',
    valida: b => /['"]kg['"]/.test(b) && /['"]g['"]/.test(b),
  },
}

// Nomes de data: só reportados. As versões locais divergem (uma mostra só
// dia/mês, outra concatena 'T00:00:00'), então trocar em lote mudaria a tela.
const APENAS_REPORTAR = ['fmtDate', 'fmtDateHora', 'fmtData', 'fmtDataHora', 'fmtDataCurta', 'fmtQtd', 'fmtDataInput', 'toInputDate']

const relatorio = { trocados: [], revisar: [], arquivos: 0 }

// ── util ────────────────────────────────────────────────────────────────────

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

/**
 * Acha o bloco completo da definição de `nome`.
 * Devolve { inicio, fim, texto } em índices de caractere, ou null.
 */
function acharDefinicao(src, nome) {
  const padroes = [
    new RegExp(`^[ \\t]*(?:export\\s+)?function\\s+${nome}\\s*\\(`, 'm'),
    new RegExp(`^[ \\t]*(?:export\\s+)?const\\s+${nome}\\s*=\\s*`, 'm'),
  ]
  for (const re of padroes) {
    const m = re.exec(src)
    if (!m) continue
    const inicio = m.index

    // Percorre a partir do início da definição contando (), {} e [].
    // A definição termina na primeira quebra de linha em que TODOS os
    // delimitadores estão fechados. Isso cobre os três formatos:
    //   function f() { ... }
    //   const f = (x) => { ... }
    //   const f = (x) => (
    //     ...várias linhas...
    //   )
    // A primeira versão deste script cortava só a primeira linha do terceiro
    // caso e deixava um ')' órfão — foi o que quebrou FidelidadeView e
    // FinanceiroView.
    let nivel = 0
    let viuAbertura = false
    let emTexto = null   // ' " ` quando dentro de string

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
        const fim = i + 1
        return { inicio, fim, texto: src.slice(inicio, fim) }
      }
    }
    return { inicio, fim: src.length, texto: src.slice(inicio) }
  }
  return null
}

/** Insere (ou funde) o import com os apelidos necessários. */
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

    // Acha o FIM do último import, respeitando imports de várias linhas
    // (`import {` ... `} from 'x'`). Inserir no meio de um desses blocos
    // quebra a sintaxe — foi o bug da primeira versão deste script.
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
    if (idx === -1) {
      // sem imports: entra depois do 'use client', se houver
      idx = /^['"]use client['"]/.test(linhas[0]) ? 0 : -1
    }
    linhas.splice(idx + 1, 0, linha)
    src = linhas.join('\n')
  }
  return src
}

// ── processamento ───────────────────────────────────────────────────────────

const arquivos = PASTAS.flatMap(p => listarArquivos(path.join(RAIZ, p)))

for (const arquivo of arquivos) {
  if (ignorado(arquivo)) continue

  let src = fs.readFileSync(arquivo, 'utf8')
  const original = src
  const rel = path.relative(RAIZ, arquivo)
  const porModulo = {}
  const removidos = []

  // 1. definições que podem ser trocadas com segurança
  for (const [nome, cfg] of Object.entries(MAPA)) {
    const def = acharDefinicao(src, nome)
    if (!def) continue

    // exportada por outro módulo? não mexe (alguém pode importar de lá)
    if (/^\s*export\s/.test(def.texto)) {
      relatorio.revisar.push({ arquivo: rel, nome, motivo: 'definição exportada — pode ter quem importe dela' })
      continue
    }
    if (!cfg.valida(def.texto)) {
      relatorio.revisar.push({ arquivo: rel, nome, motivo: 'corpo diferente do padrão', corpo: def.texto.trim().slice(0, 160) })
      continue
    }

    src = src.slice(0, def.inicio) + src.slice(def.fim)
    ;(porModulo[cfg.modulo] ||= []).push({ local: nome, exportado: cfg.exportado })
    removidos.push(`${nome} → ${cfg.exportado}`)
  }

  // 2. datas e afins: só relatório
  for (const nome of APENAS_REPORTAR) {
    const def = acharDefinicao(src, nome)
    if (def) relatorio.revisar.push({ arquivo: rel, nome, motivo: 'data/quantidade — migrar à mão', corpo: def.texto.trim().slice(0, 160) })
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

// ── saída ───────────────────────────────────────────────────────────────────

console.log(`\npadronizar-format ${VERSAO} — ${APLICAR ? '✍️  APLICANDO' : '🔍 SIMULAÇÃO (nada foi escrito — use --apply)'}\n`)

console.log(`Arquivos alterados: ${relatorio.arquivos}`)
for (const t of relatorio.trocados) {
  console.log(`  ✓ ${t.arquivo}`)
  for (const r of t.removidos) console.log(`      ${r}`)
}

if (relatorio.revisar.length) {
  console.log(`\nPara revisar à mão (${relatorio.revisar.length}):`)
  for (const r of relatorio.revisar) {
    console.log(`  • ${r.arquivo} — ${r.nome}: ${r.motivo}`)
    if (r.corpo) console.log(`      ${r.corpo.replace(/\s+/g, ' ')}`)
  }
}

console.log('')