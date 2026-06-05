export type EntidadeImportacao = 'clientes' | 'fornecedores' | 'produtos' | 'insumos'

export const TEMPLATES: Record<EntidadeImportacao, {
  colunas: string[]
  exemplo: Record<string, string>[]
  instrucoes: string
}> = {
  clientes: {
    colunas: ['nome_completo', 'nome_fantasia', 'tipo_pessoa', 'documento', 'email', 'telefone', 'celular', 'cidade', 'uf', 'observacao'],
    exemplo: [
      { nome_completo: 'Maria Silva', nome_fantasia: '', tipo_pessoa: 'PF', documento: '123.456.789-00', email: 'maria@email.com', telefone: '', celular: '(35) 99999-0000', cidade: 'Passos', uf: 'MG', observacao: '' },
      { nome_completo: 'Padaria Central', nome_fantasia: 'Padaria Central', tipo_pessoa: 'PJ', documento: '12.345.678/0001-90', email: 'padaria@email.com', telefone: '(35) 3522-0000', celular: '', cidade: 'Passos', uf: 'MG', observacao: 'Cliente VIP' },
    ],
    instrucoes: 'tipo_pessoa: PF ou PJ | documento: CPF ou CNPJ sem formatação ou com',
  },
  fornecedores: {
    colunas: ['nome_completo', 'nome_fantasia', 'tipo_pessoa', 'cnpj_cpf', 'email', 'telefone', 'celular', 'contato', 'cidade', 'uf', 'observacao'],
    exemplo: [
      { nome_completo: 'Distribuidora ABC Ltda', nome_fantasia: 'ABC', tipo_pessoa: 'PJ', cnpj_cpf: '12.345.678/0001-90', email: 'abc@email.com', telefone: '(11) 3333-0000', celular: '', contato: 'João', cidade: 'São Paulo', uf: 'SP', observacao: '' },
    ],
    instrucoes: 'tipo_pessoa: PF ou PJ | cnpj_cpf: CNPJ ou CPF',
  },
  produtos: {
    colunas: ['nome', 'descricao', 'codigo_barras', 'unidade', 'categoria', 'estoque_atual', 'estoque_minimo', 'preco_custo', 'preco_varejo', 'preco_atacado'],
    exemplo: [
      { nome: 'Macarrão Parafuso 500g', descricao: 'Macarrão tipo parafuso', codigo_barras: '7891234560001', unidade: 'un', categoria: 'Massas', estoque_atual: '100', estoque_minimo: '20', preco_custo: '2.50', preco_varejo: '5.90', preco_atacado: '4.50' },
      { nome: 'Molho de Tomate 340g', descricao: '', codigo_barras: '', unidade: 'un', categoria: 'Molhos', estoque_atual: '50', estoque_minimo: '10', preco_custo: '1.80', preco_varejo: '3.50', preco_atacado: '2.80' },
    ],
    instrucoes: 'unidade: un, kg, g, L, ml, cx, pc | preços em R$ (ex: 5.90 ou 5,90)',
  },
  insumos: {
    colunas: ['nome', 'descricao', 'codigo_barras', 'unidade', 'tipo', 'estoque_atual', 'estoque_minimo', 'preco_custo'],
    exemplo: [
      { nome: 'Farinha de Trigo', descricao: 'Farinha tipo 1', codigo_barras: '', unidade: 'kg', tipo: 'MP', estoque_atual: '200', estoque_minimo: '50', preco_custo: '3.50' },
      { nome: 'Embalagem Bandeja P', descricao: 'Bandeja 250g', codigo_barras: '', unidade: 'un', tipo: 'EMB', estoque_atual: '500', estoque_minimo: '100', preco_custo: '0.25' },
    ],
    instrucoes: 'tipo: MP (Matéria Prima), EMB (Embalagem), OUT (Outros) | unidade: kg, g, L, ml, un | preco_custo em R$',
  },
}

export function gerarCSV(entidade: EntidadeImportacao): string {
  const template = TEMPLATES[entidade]
  const header   = template.colunas.join(',')
  const instrucao = `# INSTRUCOES: ${template.instrucoes}`
  const rows = template.exemplo.map(row =>
    template.colunas.map(col => `"${row[col] ?? ''}"`).join(',')
  )
  return [instrucao, header, ...rows].join('\n')
}

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'))
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').replace(/^"|"$/g, '').trim() })
    return row
  }).filter(row => Object.values(row).some(v => v !== ''))
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}