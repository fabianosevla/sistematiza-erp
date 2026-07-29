/**
 * scripts/achar-textos.js
 *
 * SOMENTE LEITURA. Encontra todo texto explicativo solto na interface —
 * legendas abaixo de campos, avisos em caixinha colorida, parágrafos de ajuda.
 * É o backlog para trocar tudo por InfoTip.
 *
 * Não pega: placeholder de campo, rótulo (Label), título de tela, mensagem de
 * erro de validação e texto de botão.
 *
 * Uso:
 *   node scripts/achar-textos.js            imprime no terminal
 *   node scripts/achar-textos.js --md       grava docs/textos-explicativos.md
 */

const fs   = require('fs')
const path = require('path')

const RAIZ = process.cwd()
const GERAR_MD = process.argv.includes('--md')
const PASTAS = ['app', 'components']
const IGNORAR_DIR = new Set(['node_modules', '.next', '.git'])

// <p> ou <span> pequeno e cinza logo abaixo de um campo
const PADROES = [
  {
    nome: 'legenda de campo',
    re: /<p[^>]*className="[^"]*text-(?:\[10px\]|\[11px\]|xs)[^"]*text-gray-(?:400|500)[^"]*"[^>]*>([^<][^]*?)<\/p>/g,
  },
  {
    nome: 'caixa de aviso colorida',
    re: /<p[^>]*className="[^"]*(?:bg-(?:blue|purple|amber|yellow|green|red)-50)[^"]*"[^>]*>([^<][^]*?)<\/p>/g,
  },
  {
    nome: 'parágrafo de ajuda',
    re: /<p[^>]*className="[^"]*text-(?:xs|sm)[^"]*text-(?:blue|purple|amber|gray)-(?:600|700)[^"]*"[^>]*>([^<][^]*?)<\/p>/g,
  },
]

function listar(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const nome of fs.readdirSync(dir)) {
    if (IGNORAR_DIR.has(nome)) continue
    const p = path.join(dir, nome)
    const st = fs.statSync(p)
    if (st.isDirectory()) listar(p, acc)
    else if (/\.tsx$/.test(nome)) acc.push(p)
  }
  return acc
}

function linhaDo(src, index) {
  return src.slice(0, index).split('\n').length
}

function limpar(txt) {
  return txt
    .replace(/<[^>]+>/g, ' ')      // tags internas (strong, span…)
    .replace(/\{[^}]*\}/g, '…')    // expressões JSX
    .replace(/\s+/g, ' ')
    .trim()
}

const achados = []

for (const arquivo of PASTAS.flatMap(p => listar(path.join(RAIZ, p)))) {
  const src = fs.readFileSync(arquivo, 'utf8')
  const rel = path.relative(RAIZ, arquivo).replace(/\\/g, '/')

  for (const { nome, re } of PADROES) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(src)) !== null) {
      const texto = limpar(m[1])
      // ignora o que é claramente dado, não explicação
      if (texto.length < 25) continue
      if (/^…$/.test(texto)) continue
      achados.push({ arquivo: rel, linha: linhaDo(src, m.index), tipo: nome, texto })
    }
  }
}

// agrupa por arquivo
const porArquivo = {}
for (const a of achados) (porArquivo[a.arquivo] ||= []).push(a)

const arquivosOrdenados = Object.keys(porArquivo).sort(
  (x, y) => porArquivo[y].length - porArquivo[x].length
)

console.log(`\nTextos explicativos encontrados: ${achados.length} em ${arquivosOrdenados.length} telas\n`)
for (const arq of arquivosOrdenados) {
  console.log(`${String(porArquivo[arq].length).padStart(3)}  ${arq}`)
  for (const a of porArquivo[arq]) {
    console.log(`      L${a.linha} · ${a.texto.slice(0, 110)}${a.texto.length > 110 ? '…' : ''}`)
  }
}

if (GERAR_MD) {
  const md = ['# Textos explicativos a virar InfoTip\n']
  md.push(`Gerado em ${new Date().toLocaleString('pt-BR')} — ${achados.length} ocorrências.\n`)
  md.push('| Tela | Linha | Tipo | Texto |')
  md.push('|---|---|---|---|')
  for (const arq of arquivosOrdenados) {
    for (const a of porArquivo[arq]) {
      md.push(`| ${arq} | ${a.linha} | ${a.tipo} | ${a.texto.replace(/\|/g, '\\|')} |`)
    }
  }
  const destino = path.join(RAIZ, 'docs')
  if (!fs.existsSync(destino)) fs.mkdirSync(destino)
  fs.writeFileSync(path.join(destino, 'textos-explicativos.md'), md.join('\n') + '\n', 'utf8')
  console.log('\n📄 docs/textos-explicativos.md gravado.')
}

console.log('')