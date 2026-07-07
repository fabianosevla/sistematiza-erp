const fs = require('fs')
let pdv = fs.readFileSync('app/(dashboard)/[tenant]/pdv/PdvBalcao.tsx', 'utf8')

// O modal esta depois do </div> - precisa estar antes
// Estrutura atual:    ...)\n      )}\n    </div>\n      {showCadastrarCliente...
// Estrutura correta:  ...)\n      )}\n      {showCadastrarCliente...\n    </div>

// Encontrar o bloco do modal
const modalStart = pdv.indexOf('\n      {showCadastrarCliente && (')
const modalEnd = pdv.indexOf('\n      )}', modalStart) + '\n      )}'.length
const modal = pdv.slice(modalStart, modalEnd)

// Remover o modal da posicao atual
pdv = pdv.slice(0, modalStart) + pdv.slice(modalEnd)

// Inserir o modal ANTES do </div> de fechamento
pdv = pdv.replace('\n    </div>\n  )\n}', modal + '\n    </div>\n  )\n}')

fs.writeFileSync('app/(dashboard)/[tenant]/pdv/PdvBalcao.tsx', pdv, 'utf8')

// Verificar
const lines = pdv.split('\n')
const idxDiv = lines.findIndex(l => l === '    </div>')
console.log('Linhas ao redor do </div>:')
lines.slice(idxDiv-3, idxDiv+4).forEach((l, i) => console.log(idxDiv-3+i+':', l))