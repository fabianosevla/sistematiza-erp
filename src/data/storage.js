const KEYS = {
  config:       'erp_config',
  produtos:     'erp_produtos',
  clientes:     'erp_clientes',
  fornecedores: 'erp_fornecedores',
  vendas:       'erp_vendas',
  movimentos:   'erp_movimentos',
  contas:       'erp_contas',
}

// ── Dados iniciais ──
const produtosIniciais = [
  { id: 1, nome: 'Coca-Cola 2L', codigo: '7891000100103', categoria: 'Bebidas', unidade: 'UN', precoCusto: 6.50, precoVenda: 9.90, estoque: 48, estoqueMinimo: 10 },
  { id: 2, nome: 'Arroz Camil 5kg', codigo: '7896006702516', categoria: 'Mercearia', unidade: 'UN', precoCusto: 18.00, precoVenda: 24.90, estoque: 30, estoqueMinimo: 5 },
  { id: 3, nome: 'Feijão Carioca 1kg', codigo: '7891095100066', categoria: 'Mercearia', unidade: 'UN', precoCusto: 7.00, precoVenda: 10.90, estoque: 3, estoqueMinimo: 10 },
  { id: 4, nome: 'Óleo de Soja 900ml', codigo: '7891080100018', categoria: 'Mercearia', unidade: 'UN', precoCusto: 5.50, precoVenda: 8.50, estoque: 0, estoqueMinimo: 5 },
]

const clientesIniciais = [
  { id: 1, nome: 'João Silva', telefone: '(35) 99999-1111', email: '', cpf: '', saldoDevedor: 0 },
  { id: 2, nome: 'Maria Oliveira', telefone: '(35) 99999-2222', email: '', cpf: '', saldoDevedor: 45.00 },
]

const fornecedoresIniciais = [
  { id: 1, nome: 'Distribuidora Central', telefone: '(35) 3333-1111', cnpj: '', contato: 'Carlos' },
]

// ── Getters / Setters ──
export const getConfig       = () => { const s = localStorage.getItem(KEYS.config);       return s ? JSON.parse(s) : null }
export const saveConfig      = (v) => localStorage.setItem(KEYS.config,       JSON.stringify(v))

export const getProdutos     = () => { const s = localStorage.getItem(KEYS.produtos);     return s ? JSON.parse(s) : produtosIniciais }
export const saveProdutos    = (v) => localStorage.setItem(KEYS.produtos,     JSON.stringify(v))

export const getClientes     = () => { const s = localStorage.getItem(KEYS.clientes);     return s ? JSON.parse(s) : clientesIniciais }
export const saveClientes    = (v) => localStorage.setItem(KEYS.clientes,     JSON.stringify(v))

export const getFornecedores = () => { const s = localStorage.getItem(KEYS.fornecedores); return s ? JSON.parse(s) : fornecedoresIniciais }
export const saveFornecedores= (v) => localStorage.setItem(KEYS.fornecedores, JSON.stringify(v))

export const getVendas       = () => { const s = localStorage.getItem(KEYS.vendas);       return s ? JSON.parse(s) : [] }
export const saveVendas      = (v) => localStorage.setItem(KEYS.vendas,       JSON.stringify(v))

export const getMovimentos   = () => { const s = localStorage.getItem(KEYS.movimentos);   return s ? JSON.parse(s) : [] }
export const saveMovimentos  = (v) => localStorage.setItem(KEYS.movimentos,   JSON.stringify(v))

export const getContas       = () => { const s = localStorage.getItem(KEYS.contas);       return s ? JSON.parse(s) : [] }
export const saveContas      = (v) => localStorage.setItem(KEYS.contas,       JSON.stringify(v))

// ── Helpers ──
export const fmt = (v) => `R$ ${parseFloat(v || 0).toFixed(2).replace('.', ',')}`

export const hoje = () => new Date().toLocaleDateString('pt-BR')

export const categoriasProduto = ['Mercearia', 'Bebidas', 'Hortifruti', 'Limpeza', 'Higiene', 'Frios', 'Padaria', 'Outros']

export const unidades = ['UN', 'KG', 'LT', 'CX', 'DZ', 'PC', 'MT']

export const formasPagamento = ['Dinheiro', 'Pix', 'Cartão de crédito', 'Cartão de débito', 'Fiado']

export const getEstoqueStatus = (produto) => {
  if (produto.estoque === 0) return 'zerado'
  if (produto.estoque <= produto.estoqueMinimo) return 'baixo'
  return 'ok'
}