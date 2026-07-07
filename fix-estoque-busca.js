const fs = require('fs')
let e = fs.readFileSync('components/modules/estoque/EstoqueView.tsx', 'utf8')
const lines = e.split('\n')
lines.slice(29, 55).forEach((l, i) => console.log(29+i+':', JSON.stringify(l.replace('\r',''))))