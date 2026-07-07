const fs = require('fs')
let pdv = fs.readFileSync('app/(dashboard)/[tenant]/pdv/PdvBalcao.tsx', 'utf8')

// 1. Mover campo Cliente para fora do showExtras
// Remover o bloco do cliente de dentro do showExtras
const clienteBlock = `                <div>
                  <Label className="text-xs">Cliente</Label>
                  {clienteId && clienteNomeDisplay ? (
                    <div className="mt-1 flex items-center justify-between px-2 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                      <span className="text-xs font-medium text-green-800 truncate">{clienteNomeDisplay}</span>
                      <button onClick={() => { setClienteId(''); setClienteNomeDisplay(''); setBuscaCliente('') }} className="text-green-400 hover:text-green-600 ml-1 flex-shrink-0"><X size={12} /></button>
                    </div>
                  ) : (
                    <div className="relative mt-1">
                      <Input value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)}
                        placeholder="Nome ou CPF..." className="h-9 text-xs" />
                      {buscaCliente.length > 1 && clientes.length > 0 && (
                        <div className="absolute z-20 w-full mt-0.5 bg-white border border-gray-100 rounded-lg shadow-lg overflow-hidden">
                          <button onClick={() => { setClienteId(''); setClienteNomeDisplay(''); setBuscaCliente('') }}
                            className="w-full px-3 py-2 text-left text-xs text-gray-400 hover:bg-gray-50 border-b border-gray-50">
                            Consumidor Final
                          </button>
                          {clientes.map((c: any) => (
                            <button key={c.clienteId} onClick={() => {
                              setClienteId(String(c.clienteId))
                              setClienteNomeDisplay(c.nomeCompleto)
                              setBuscaCliente('')
                              if (c.endereco) setEnderecoEntrega(\`\${c.endereco}\${c.numero ? ', ' + c.numero : ''} — \${c.cidade}/\${c.uf}\`)
                            }} className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left">
                              <span className="text-xs font-medium text-gray-900">{c.nomeCompleto}</span>
                              <span className="text-[10px] text-gray-400">{c.cpfCnpj ?? ''}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>`

// Novo bloco de cliente com botão cadastrar — fora do showExtras
const clienteBlockNovo = `            {/* Cliente — sempre visível */}
            <div>
              <Label className="text-xs">Cliente</Label>
              {clienteId && clienteNomeDisplay ? (
                <div className="mt-1 flex items-center justify-between px-2 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                  <span className="text-xs font-medium text-green-800 truncate">{clienteNomeDisplay}</span>
                  <button onClick={() => { setClienteId(''); setClienteNomeDisplay(''); setBuscaCliente('') }} className="text-green-400 hover:text-green-600 ml-1 flex-shrink-0"><X size={12} /></button>
                </div>
              ) : (
                <div className="relative mt-1">
                  <Input value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)}
                    placeholder="Nome ou CPF..." className="h-9 text-xs" />
                  {buscaCliente.length > 1 && clientes.length > 0 && (
                    <div className="absolute z-20 w-full mt-0.5 bg-white border border-gray-100 rounded-lg shadow-lg overflow-hidden">
                      {clientes.map((c: any) => (
                        <button key={c.clienteId} onClick={() => {
                          setClienteId(String(c.clienteId))
                          setClienteNomeDisplay(c.nomeCompleto)
                          setBuscaCliente('')
                          if (c.endereco) setEnderecoEntrega(\`\${c.endereco}\${c.numero ? ', ' + c.numero : ''} — \${c.cidade}/\${c.uf}\`)
                        }} className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left">
                          <span className="text-xs font-medium text-gray-900">{c.nomeCompleto}</span>
                          <span className="text-[10px] text-gray-400">{c.cpfCnpj ?? ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setShowCadastrarCliente(true)}
                    className="mt-1.5 w-full text-xs text-green-600 hover:text-green-700 text-left flex items-center gap-1">
                    <Plus size={11} /> Cadastrar novo cliente
                  </button>
                </div>
              )}
            </div>`

// Remover cliente de dentro do showExtras
if (pdv.includes(clienteBlock)) {
  pdv = pdv.replace(clienteBlock, '')
  console.log('OK: cliente removido do showExtras')
} else {
  console.log('AVISO: padrao cliente nao encontrado — verificar indentacao')
}

// Adicionar cliente antes do bloco de desconto (sempre visível)
const beforeDesconto = `            {/* Desconto */}
            <div>`
const comCliente = clienteBlockNovo + '\r\n            {/* Desconto */}\r\n            <div>'

if (pdv.includes(beforeDesconto) && !pdv.includes('Cadastrar novo cliente')) {
  pdv = pdv.replace(beforeDesconto, comCliente)
  console.log('OK: cliente adicionado antes do desconto')
}

// 2. Adicionar state showCadastrarCliente
if (!pdv.includes('showCadastrarCliente')) {
  pdv = pdv.replace(
    "  const [clienteNomeDisplay, setClienteNomeDisplay] = useState('')",
    "  const [clienteNomeDisplay, setClienteNomeDisplay] = useState('')\r\n  const [showCadastrarCliente, setShowCadastrarCliente] = useState(false)\r\n  const [novoClienteNome, setNovoClienteNome] = useState('')\r\n  const [novoClienteTel, setNovoClienteTel]   = useState('')"
  )
}

// 3. Adicionar mutation de criar cliente
if (!pdv.includes('criarClienteMut')) {
  pdv = pdv.replace(
    "  const venderMut = useMutation({",
    `  const criarClienteMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(\`/api/\${tenantSlug}/cadastros/clientes\`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomeCompleto: novoClienteNome.trim(), telefone: novoClienteTel.trim() || undefined }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message ?? 'Erro ao criar cliente')
      return d
    },
    onSuccess: (d) => {
      const cli = d?.data
      if (cli?.clienteId) {
        setClienteId(String(cli.clienteId))
        setClienteNomeDisplay(novoClienteNome.trim())
      }
      setShowCadastrarCliente(false)
      setNovoClienteNome('')
      setNovoClienteTel('')
    },
  })

  const venderMut = useMutation({`
  )
  console.log('OK: criarClienteMut adicionado')
}

// 4. Adicionar modal de cadastrar cliente antes do fechamento do return
const modalCadastrarCliente = `
      {/* Modal Cadastrar Cliente rápido */}
      {showCadastrarCliente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Cadastrar cliente</h3>
              <button onClick={() => setShowCadastrarCliente(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div>
              <Label className="text-xs">Nome completo *</Label>
              <Input value={novoClienteNome} onChange={e => setNovoClienteNome(e.target.value)} className="mt-1 h-9 text-sm" placeholder="Nome do cliente" autoFocus />
            </div>
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input value={novoClienteTel} onChange={e => setNovoClienteTel(e.target.value)} className="mt-1 h-9 text-sm" placeholder="(00) 00000-0000" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowCadastrarCliente(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={() => criarClienteMut.mutate()} disabled={!novoClienteNome.trim() || criarClienteMut.isPending}
                className="flex-1 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: '#2ecc71' }}>
                {criarClienteMut.isPending ? 'Salvando...' : 'Salvar e usar'}
              </button>
            </div>
          </div>
        </div>
      )}`

if (!pdv.includes('showCadastrarCliente &&') && pdv.includes('showCadastrarCliente')) {
  // Adicionar antes do último fechamento do return
  pdv = pdv.replace(/(\s*\)\s*\}\s*)$/, modalCadastrarCliente + '\n  )\n}\n')
  console.log('OK: modal cadastrar cliente adicionado')
}

fs.writeFileSync('app/(dashboard)/[tenant]/pdv/PdvBalcao.tsx', pdv, 'utf8')
console.log('PdvBalcao salvo!')
console.log('  tem Cadastrar novo cliente:', pdv.includes('Cadastrar novo cliente') ? 'OK' : 'FALHOU')
console.log('  tem modal:', pdv.includes('showCadastrarCliente &&') ? 'OK' : 'FALHOU')