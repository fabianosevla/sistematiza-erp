const fs = require('fs')
let h = fs.readFileSync('components/layout/Header.tsx', 'utf8')
const lines = h.split('\n')
lines.slice(130, 155).forEach((l, i) => console.log(130+i+':', JSON.stringify(l)))