/**
 * Corrige problemas de escaping nos arquivos gerados
 * Rodar: node scripts/fix.js
 */
const fs = require('fs')
const path = require('path')

const files = [
  'components/layout/Sidebar.tsx',
  'components/modules/cadastros/ClientesView.tsx',
  'app/api/onboarding/route.ts',
  'lib/services/cadastros/ClienteService.ts',
  'app/page.tsx',
]

let fixed = 0
files.forEach(file => {
  if (!fs.existsSync(file)) {
    console.log(`Não encontrado: ${file}`)
    return
  }
  let content = fs.readFileSync(file, 'utf8')
  const original = content
  content = content.replace(/\\`/g, '`')
  content = content.replace(/\\\$\{/g, '${')
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8')
    console.log(`✓ Corrigido: ${file}`)
    fixed++
  } else {
    console.log(`  OK: ${file}`)
  }
})
console.log(`\nTotal corrigido: ${fixed} arquivo(s)`)
