/**
 * scripts/corrigir-imports.js
 *
 * Conserta imports que foram inseridos DENTRO de um `import { ... }` de várias
 * linhas — erro do padronizar-format.js na primeira versão. O sintoma é:
 *
 *     import {
 *     import { fmtMoeda as fmt } from '@/lib/format'   ← linha intrusa
 *       Gift, ChevronDown, ...
 *     } from 'lucide-react'
 *
 * A linha intrusa é retirada dali e recolocada depois do bloco que ela partiu.
 *
 * Uso:
 *   node scripts/corrigir-imports.js           simulação
 *   node scripts/corrigir-imports.js --apply   aplica
 */

const fs   = require('fs')
const path = require('path')

const RAIZ = process.cwd()
const APLICAR = process.argv.includes('--apply')
const PASTAS = ['app', 'components', 'lib', 'hooks']
const IGNORAR_DIR = new Set(['node_modules', '.next', '.git', 'dist', 'build'])

function listar(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const nome of fs.readdirSync(dir)) {
    if (IGNORAR_DIR.has(nome)) continue
    const p = path.join(dir, nome)
    const st = fs.statSync(p)
    if (st.isDirectory()) listar(p, acc)
    else if (/\.(ts|tsx)$/.test(nome)) acc.push(p)
  }
  return acc
}

// import completo numa linha só: import { a, b } from 'x'
const IMPORT_COMPLETO = /^\s*import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?\s*$/
// abertura de import multilinha: import {   (sem fechar na mesma linha)
const IMPORT_ABRE     = /^\s*import\s*\{\s*$|^\s*import\s*\{(?![^}]*\})/
// fechamento: } from 'x'
const IMPORT_FECHA    = /^\s*\}\s*from\s*['"][^'"]+['"];?\s*$/

let arquivosCorrigidos = 0
const detalhes = []

for (const arquivo of PASTAS.flatMap(p => listar(path.join(RAIZ, p)))) {
  const src = fs.readFileSync(arquivo, 'utf8')
  const quebraCRLF = src.includes('\r\n')
  const linhas = src.split(/\r?\n/)

  const intrusas = []
  let dentro = false

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]

    if (!dentro && IMPORT_ABRE.test(linha) && !IMPORT_COMPLETO.test(linha)) {
      dentro = true
      continue
    }
    if (dentro && IMPORT_FECHA.test(linha)) {
      dentro = false
      continue
    }
    if (dentro && IMPORT_COMPLETO.test(linha)) {
      intrusas.push(i)
    }
  }

  if (intrusas.length === 0) continue

  // Retira as intrusas (de trás para frente, para não bagunçar os índices)
  const textos = []
  for (let k = intrusas.length - 1; k >= 0; k--) {
    textos.unshift(linhas[intrusas[k]].trim())
    linhas.splice(intrusas[k], 1)
  }

  // Recoloca depois do último import (agora contando blocos multilinha direito)
  let fim = -1
  let aberto = false
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
    if (aberto) {
      if (IMPORT_FECHA.test(linha)) { aberto = false; fim = i }
      continue
    }
    if (IMPORT_COMPLETO.test(linha) || /^\s*import\s+[^{].*from\s*['"]/.test(linha)) { fim = i; continue }
    if (IMPORT_ABRE.test(linha)) { aberto = true; continue }
    if (linha.trim() !== '' && fim !== -1) break
  }

  linhas.splice(fim + 1, 0, ...textos)

  arquivosCorrigidos++
  detalhes.push({
    arquivo: path.relative(RAIZ, arquivo).replace(/\\/g, '/'),
    linhas: textos,
  })

  if (APLICAR) {
    fs.writeFileSync(arquivo, linhas.join(quebraCRLF ? '\r\n' : '\n'), 'utf8')
  }
}

console.log(`\n${APLICAR ? '✍️  APLICANDO' : '🔍 SIMULAÇÃO (use --apply para gravar)'}\n`)
console.log(`Arquivos com import fora do lugar: ${arquivosCorrigidos}`)
for (const d of detalhes) {
  console.log(`  ✓ ${d.arquivo}`)
  for (const l of d.linhas) console.log(`      ${l}`)
}
console.log('')