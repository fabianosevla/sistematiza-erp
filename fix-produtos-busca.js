const fs = require('fs')
let p = fs.readFileSync('components/modules/cadastros/ProdutosView.tsx', 'utf8')

// Remover filtro local - usar CRLF correto
p = p.replace(
  "  const produtos = [...todos]\r\n    .filter((p: any) => p.nome?.toLowerCase().includes(busca.toLowerCase()))\r\n    .sort((a: any, b: any) => {",
  "  const produtos = [...todos]\r\n    .sort((a: any, b: any) => {"
)

// Adicionar useEffect para resetar page ao buscar
if (!p.includes("useEffect(() => { setPage(1) }")) {
  p = p.replace(
    "import { useState } from 'react'",
    "import { useState, useEffect } from 'react'"
  )
  p = p.replace(
    "  const invalidate = () =>",
    "  useEffect(() => { setPage(1) }, [busca])\r\n\r\n  const invalidate = () =>"
  )
}

fs.writeFileSync('components/modules/cadastros/ProdutosView.tsx', p, 'utf8')
console.log('filtro local removido:', !p.includes(".filter((p: any) => p.nome?.toLowerCase"))
console.log('useEffect adicionado:', p.includes("useEffect(() => { setPage(1) }"))