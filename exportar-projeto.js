// exportar-projeto.js — gera um dump completo do código-fonte do projeto
// Uso: node exportar-projeto.js
// Saída: projeto-completo.txt na raiz

const fs = require('fs')
const path = require('path')

const RAIZ = process.cwd()
const SAIDA = path.join(RAIZ, 'projeto-completo.txt')

// Pastas e arquivos a IGNORAR
const IGNORAR_DIRS = new Set([
  'node_modules', '.next', '.git', 'dist', 'build',
  '.vercel', 'coverage', '.turbo', 'out',
])
const IGNORAR_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.map', '.lock',
  '.mp4', '.webm', '.pdf', '.zip',
])
const IGNORAR_ARQUIVOS = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'projeto-completo.txt', 'exportar-projeto.js',
  '.env', '.env.local', '.env.production',
])

// Extensões que valem a pena exportar
const INCLUIR_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss',
  '.md', '.mjs', '.cjs', '.sql', '.prisma', '.txt',
])

let arquivos = []
let totalLinhas = 0
let totalArquivos = 0

function percorrer(dir) {
  const itens = fs.readdirSync(dir, { withFileTypes: true })
  for (const item of itens) {
    const caminhoCompleto = path.join(dir, item.name)
    const rel = path.relative(RAIZ, caminhoCompleto)

    if (item.isDirectory()) {
      if (IGNORAR_DIRS.has(item.name)) continue
      if (item.name.startsWith('.') && item.name !== '.') continue
      percorrer(caminhoCompleto)
    } else {
      const ext = path.extname(item.name).toLowerCase()
      if (IGNORAR_ARQUIVOS.has(item.name)) continue
      if (IGNORAR_EXT.has(ext)) continue
      if (!INCLUIR_EXT.has(ext)) continue
      // Ignorar arquivos temporarios de patch/fix
      if (/^(fix-|patch-|debug-|aplicar-|check-).*\.js$/.test(item.name)) continue

      arquivos.push({ rel, caminhoCompleto })
    }
  }
}

percorrer(RAIZ)

// Ordenar por caminho para organização
arquivos.sort((a, b) => a.rel.localeCompare(b.rel))

// Montar o dump
let saida = []
saida.push('='.repeat(80))
saida.push('DUMP COMPLETO DO PROJETO — sistematiza.erp')
saida.push('Gerado em: ' + new Date().toISOString())
saida.push('='.repeat(80))
saida.push('')

// Árvore de arquivos primeiro
saida.push('ÁRVORE DE ARQUIVOS:')
saida.push('-'.repeat(80))
for (const arq of arquivos) {
  saida.push('  ' + arq.rel)
}
saida.push('')
saida.push('='.repeat(80))
saida.push('')

// Conteúdo de cada arquivo
for (const arq of arquivos) {
  let conteudo
  try {
    conteudo = fs.readFileSync(arq.caminhoCompleto, 'utf8')
  } catch (e) {
    conteudo = '[ERRO AO LER: ' + e.message + ']'
  }
  const linhas = conteudo.split('\n').length
  totalLinhas += linhas
  totalArquivos++

  saida.push('')
  saida.push('┌' + '─'.repeat(78))
  saida.push('│ ARQUIVO: ' + arq.rel)
  saida.push('│ LINHAS: ' + linhas)
  saida.push('└' + '─'.repeat(78))
  saida.push(conteudo)
  saida.push('')
}

saida.push('')
saida.push('='.repeat(80))
saida.push('FIM DO DUMP — ' + totalArquivos + ' arquivos, ' + totalLinhas + ' linhas')
saida.push('='.repeat(80))

fs.writeFileSync(SAIDA, saida.join('\n'), 'utf8')

const tamanhoKB = (fs.statSync(SAIDA).size / 1024).toFixed(0)
console.log('✓ Exportação concluída!')
console.log('  Arquivo: projeto-completo.txt')
console.log('  Total: ' + totalArquivos + ' arquivos, ' + totalLinhas + ' linhas, ' + tamanhoKB + ' KB')
console.log('')
console.log('Se o arquivo ficar muito grande (>1MB), considere dividir por pasta.')