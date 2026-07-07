const fs = require('fs')
let p = fs.readFileSync('components/modules/cadastros/ProdutosView.tsx', 'utf8')

// Remover duplicatas usando regex
p = p.replace(/(const \[page, setPage\]\s*=\s*useState\(1\)[\r\n]+\s*const \[limit, setLimit\]\s*=\s*useState\(20\))([\r\n]+\s*const \[page, setPage\]\s*=\s*useState\(1\)[\r\n]+\s*const \[limit, setLimit\]\s*=\s*useState\(20\))/g, '$1')

const countPage = (p.match(/const \[page, setPage\]/g) || []).length
const countLimit = (p.match(/const \[limit, setLimit\]/g) || []).length
console.log('Apos limpeza - page:', countPage, '| limit:', countLimit)

fs.writeFileSync('components/modules/cadastros/ProdutosView.tsx', p, 'utf8')