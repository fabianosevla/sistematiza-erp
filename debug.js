const fs = require('fs')
const e = fs.readFileSync('components/modules/estoque/EstoqueView.tsx', 'utf8')
const lines = e.split('\n')
let opens = 0, closes = 0
for (let i = 0; i < 160; i++) {
  const l = lines[i]
  opens  += (l.match(/\(/g) || []).length
  closes += (l.match(/\)/g) || []).length
}
console.log('Antes do return: opens=', opens, 'closes=', closes, 'diff=', opens-closes)