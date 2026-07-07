const fs = require('fs')
let p = fs.readFileSync('components/modules/cadastros/ProdutosView.tsx', 'utf8')
const idx = p.indexOf('setShowFicha(p)')
console.log('Contexto setShowFicha:', p.substring(idx-200, idx+100))