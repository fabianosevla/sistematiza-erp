const fs = require('fs')
let f = fs.readFileSync('app/api/[tenant]/cadastros/usuarios/route.ts', 'utf8')

// Substituir a linha de redirectUrl correta
const linhaErrada = "        redirectUrl:  `/`,"
const linhaCorreta = "        redirectUrl:  `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://sistematiza-erp.vercel.app'}/${tenant.slug}`,"

if (f.includes(linhaErrada)) {
  f = f.replace(linhaErrada, linhaCorreta)
  console.log('OK: redirectUrl corrigido para tenant.slug')
} else {
  // Tentar encontrar a linha atual
  const idx = f.indexOf('redirectUrl')
  console.log('Linha atual:', f.substring(idx, idx+120))
}

fs.writeFileSync('app/api/[tenant]/cadastros/usuarios/route.ts', f, 'utf8')