const fs = require('fs')
let h = fs.readFileSync('components/layout/Header.tsx', 'utf8')
const lines = h.split('\n')
// Linha 141: span PDV
// Linha 142: )} ERRADO - deve vir depois do </a>
// Linha 143: </a> DEVE ser antes do )}
// Trocar linhas 142 e 143
const tmp = lines[142]
lines[142] = lines[143]
lines[143] = tmp
fs.writeFileSync('components/layout/Header.tsx', lines.join('\n'), 'utf8')
console.log('Linha 141:', lines[141])
console.log('Linha 142:', lines[142])
console.log('Linha 143:', lines[143])