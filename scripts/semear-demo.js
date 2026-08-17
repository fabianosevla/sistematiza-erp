// scripts/semear-demo.js
//
// POPULA UM TENANT COM DADOS FICTICIOS PARA DEMONSTRACAO.
//
// Empresa fictícia: uma pequena indústria que produz e também vende no balcão.
// Serve para gravar telas, treinar e testar o sistema sem tocar em cliente real.
//
//   node scripts/semear-demo.js --slug demo
//   node scripts/semear-demo.js --slug demo --aplicar
//
// Opcional: --limpar   apaga os dados do tenant antes de semear (nunca a estrutura)
//
// ─── PRE-REQUISITO ──────────────────────────────────────────────────────────
//
// O tenant precisa existir. Crie antes:
//   node scripts/provisionar-tenant.js --slug demo --nome "Bela Vista Industria e Comercio" \
//        --email seu-email-real@dominio.com --aplicar
//
// ─── TRAVAS DE SEGURANCA ────────────────────────────────────────────────────
//
//   1. Recusa qualquer schema cujo nome contenha "zaghi"
//   2. Recusa tenant que ja tenha produto cadastrado, a menos que use --limpar
//   3. Simula por padrao; so grava com --aplicar
//   4. Tudo em uma transacao: qualquer falha desfaz tudo
//
// ─── POR QUE AS COLUNAS SAO DESCOBERTAS EM TEMPO DE EXECUCAO ────────────────
//
// A estrutura real do banco tem colunas que entraram por scripts de migracao e
// nem sempre estao declaradas no Drizzle. Um INSERT com nome de coluna fixo
// quebra quando a tabela do tenant esta um passo atras ou a frente.
//
// Aqui cada INSERT e montado por inspecao de information_schema: o que existe
// entra, o que nao existe e ignorado com aviso, e coluna NOT NULL sem default
// que ninguem preencheu recebe um valor neutro do tipo certo.
//
// ─── DINHEIRO ──────────────────────────────────────────────────────────────
//
// Todo valor monetario e INTEIRO EM CENTAVOS, como no resto do sistema.
// R$ 12,90 => 1290
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

function arg(nome) {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const APLICAR = process.argv.includes('--aplicar')
const LIMPAR  = process.argv.includes('--limpar')
const SLUG    = (arg('slug') ?? '').trim().toLowerCase()

function conexao() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL }
  const host = process.env.DB_HOST
  if (!host) throw new Error('Defina DATABASE_URL ou DB_HOST/... no .env.local')
  const local = /^(localhost|127\.0\.0\.1)$/.test(host)
  return {
    host,
    port:     Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl:      local ? false : { rejectUnauthorized: false },
  }
}

// ─── Utilidades ─────────────────────────────────────────────────────────────

const R = (v) => 'R$ ' + (v / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Gerador pseudoaleatorio com semente fixa: rodar duas vezes produz os mesmos
// numeros, entao a tela printada hoje e igual a de amanha.
let _s = 20260817
function rnd() { _s = (_s * 1103515245 + 12345) % 2147483648; return _s / 2147483648 }
const inteiro = (min, max) => Math.floor(rnd() * (max - min + 1)) + min
const escolher = (arr) => arr[Math.floor(rnd() * arr.length)]

const HOJE = new Date()
function diasAtras(n, hora = 12, minuto = 0) {
  const d = new Date(HOJE)
  d.setDate(d.getDate() - n)
  d.setHours(hora, minuto, 0, 0)
  return d
}
const soData = (d) => d.toISOString().slice(0, 10)
function mesAno(deltaMeses) {
  const d = new Date(HOJE.getFullYear(), HOJE.getMonth() - deltaMeses, 1)
  return { mes: d.getMonth() + 1, ano: d.getFullYear() }
}

// ─── Camada de insercao com inspecao de colunas ─────────────────────────────

const cacheCols = new Map()
const avisos = new Set()

async function colunasDe(c, schema, tabela) {
  const chave = `${schema}.${tabela}`
  if (cacheCols.has(chave)) return cacheCols.get(chave)
  const r = await c.query(`
    SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
  `, [schema, tabela])
  const mapa = new Map(r.rows.map(x => [x.column_name, x]))
  cacheCols.set(chave, mapa)
  return mapa
}

async function existeTabela(c, schema, tabela) {
  const r = await c.query(`
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = $1 AND table_name = $2 AND table_type = 'BASE TABLE'
  `, [schema, tabela])
  return r.rows.length > 0
}

function neutro(tipo) {
  if (tipo === 'boolean') return false
  if (/int|numeric|double|real/.test(tipo)) return 0
  if (tipo.includes('timestamp') || tipo === 'date') return new Date()
  return ''
}

// Insere uma linha montando o comando pelas colunas que realmente existem.
// Devolve a chave primaria gerada, quando houver.
async function inserir(c, schema, tabela, dados, usuarioId = 1) {
  const cols = await colunasDe(c, schema, tabela)
  if (cols.size === 0) throw new Error(`Tabela ${schema}.${tabela} nao existe`)

  const nomes = []
  const vals  = []
  const push = (col, val) => { nomes.push(`"${col}"`); vals.push(val) }

  // Campos de auditoria, quando a tabela os tiver
  const auditoria = {
    modification_num: 0,
    created_dt: dados.__data ?? new Date(),
    updated_dt: dados.__data ?? new Date(),
    created_by: usuarioId,
    updated_by: usuarioId,
    active_flg: true,
  }

  for (const [col, val] of Object.entries(dados)) {
    if (col.startsWith('__')) continue
    if (!cols.has(col)) { avisos.add(`${tabela}.${col} nao existe — ignorado`); continue }
    push(col, val)
  }
  for (const [col, val] of Object.entries(auditoria)) {
    if (cols.has(col) && !(col in dados)) push(col, val)
  }
  // Colunas obrigatorias que ninguem preencheu recebem valor neutro
  for (const [col, meta] of cols) {
    if (nomes.includes(`"${col}"`)) continue
    if (meta.is_nullable === 'NO' && !meta.column_default) push(col, neutro(meta.data_type))
  }

  // Descobre a chave primaria para devolver o id
  const pk = await pkDe(c, schema, tabela)
  const ph = vals.map((_, i) => `$${i + 1}`).join(', ')
  const sql = `INSERT INTO "${schema}"."${tabela}" (${nomes.join(', ')}) VALUES (${ph})`
             + (pk ? ` RETURNING "${pk}"` : '')
  const r = await c.query(sql, vals)
  return pk ? r.rows[0][pk] : null
}

async function pkDe(c, schema, tabela) {
  const r = await c.query(`
    SELECT a.attname
      FROM pg_index i
      JOIN pg_class cl     ON cl.oid = i.indrelid
      JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      JOIN pg_attribute a  ON a.attrelid = cl.oid AND a.attnum = ANY(i.indkey)
     WHERE ns.nspname = $1 AND cl.relname = $2 AND i.indisprimary
     LIMIT 1
  `, [schema, tabela])
  return r.rows[0]?.attname ?? null
}

// ─── Os dados ficticios ─────────────────────────────────────────────────────

const EMPRESA = {
  nome:      'Bela Vista Industria e Comercio',
  fantasia:  'Bela Vista',
  cnpj:      '12345678000199',
  ie:        '0011223344',
  telefone:  '(35) 3521-0000',
  email:     'contato@belavista.exemplo',
  cep:       '37900-000',
  endereco:  'Rua das Industrias',
  numero:    '450',
  bairro:    'Distrito Industrial',
  cidade:    'Passos',
  uf:        'MG',
}

const FORNECEDORES = [
  { nome: 'Moinho Sao Jorge Ltda',         fant: 'Moinho Sao Jorge',  doc: '11222333000144', cid: 'Passos',        uf: 'MG' },
  { nome: 'Laticinios Vale Verde SA',      fant: 'Vale Verde',        doc: '22333444000155', cid: 'Piumhi',        uf: 'MG' },
  { nome: 'Embalagens Prisma Ltda',        fant: 'Prisma Embalagens', doc: '33444555000166', cid: 'Ribeirao Preto',uf: 'SP' },
  { nome: 'Distribuidora Boa Safra Ltda',  fant: 'Boa Safra',         doc: '44555666000177', cid: 'Franca',        uf: 'SP' },
  { nome: 'Comercial Tres Irmaos Ltda',    fant: 'Tres Irmaos',       doc: '55666777000188', cid: 'Passos',        uf: 'MG' },
  { nome: 'Bebidas Serra Azul Ltda',       fant: 'Serra Azul',        doc: '66777888000199', cid: 'Alfenas',       uf: 'MG' },
]

// preco em centavos por unidade de compra
const INSUMOS = [
  { nome: 'Farinha de trigo especial',  un: 'kg', tipo: 'Matéria Prima', custo:   540, est:  380, min: 100, forn: 0 },
  { nome: 'Acucar cristal',             un: 'kg', tipo: 'Matéria Prima', custo:   420, est:  260, min:  80, forn: 3 },
  { nome: 'Ovo pasteurizado',           un: 'kg', tipo: 'Matéria Prima', custo:  1890, est:   64, min:  40, forn: 1 },
  { nome: 'Manteiga sem sal',           un: 'kg', tipo: 'Matéria Prima', custo:  4250, est:   38, min:  25, forn: 1 },
  { nome: 'Leite integral',             un: 'L',  tipo: 'Matéria Prima', custo:   520, est:  190, min:  60, forn: 1 },
  { nome: 'Queijo muçarela',            un: 'kg', tipo: 'Matéria Prima', custo:  3690, est:   12, min:  30, forn: 1 },
  { nome: 'Fermento biologico',         un: 'kg', tipo: 'Matéria Prima', custo:  2780, est:    9, min:   5, forn: 0 },
  { nome: 'Sal refinado',               un: 'kg', tipo: 'Matéria Prima', custo:   210, est:   88, min:  20, forn: 3 },
  { nome: 'Oleo de soja',               un: 'L',  tipo: 'Matéria Prima', custo:   790, est:   45, min:  20, forn: 3 },
  { nome: 'Chocolate em po 50%',        un: 'kg', tipo: 'Matéria Prima', custo:  3980, est:    0, min:  15, forn: 3 },
  { nome: 'Goiabada cascao',            un: 'kg', tipo: 'Matéria Prima', custo:  1640, est:   28, min:  10, forn: 4 },
  { nome: 'Embalagem PET 500ml',        un: 'un', tipo: 'Embalagem',     custo:    95, est: 1400, min: 400, forn: 2 },
  { nome: 'Caixa papelao pequena',      un: 'un', tipo: 'Embalagem',     custo:   135, est:  620, min: 300, forn: 2 },
  { nome: 'Etiqueta adesiva',           un: 'un', tipo: 'Embalagem',     custo:    12, est: 3200, min: 800, forn: 2 },
]

// Produtos fabricados. ficha: [indice do insumo, quantidade por unidade]
const FABRICADOS = [
  { nome: 'Pao caseiro tradicional 500g', cat: 'Panificados', un: 'un', varejo:  1290, ncm: '19052090', est:  48, min: 20,
    ficha: [[0, 0.320], [6, 0.006], [7, 0.008], [8, 0.020], [13, 1]] },
  { nome: 'Pao de queijo congelado 1kg',  cat: 'Congelados',  un: 'un', varejo:  3490, ncm: '19059090', est:  32, min: 15,
    ficha: [[5, 0.380], [2, 0.120], [8, 0.060], [7, 0.010], [12, 1], [13, 1]] },
  { nome: 'Bolo de chocolate 800g',       cat: 'Confeitaria', un: 'un', varejo:  4200, ncm: '19059090', est:  14, min: 10,
    ficha: [[0, 0.280], [1, 0.220], [2, 0.180], [3, 0.120], [9, 0.090], [12, 1], [13, 1]] },
  { nome: 'Bolo de fuba 700g',            cat: 'Confeitaria', un: 'un', varejo:  3200, ncm: '19059090', est:  18, min: 10,
    ficha: [[0, 0.240], [1, 0.190], [2, 0.150], [4, 0.180], [12, 1], [13, 1]] },
  { nome: 'Biscoito amanteigado 400g',    cat: 'Biscoitos',   un: 'un', varejo:  2290, ncm: '19053100', est:  56, min: 25,
    ficha: [[0, 0.260], [1, 0.140], [3, 0.110], [2, 0.060], [12, 1], [13, 1]] },
  { nome: 'Rosca de goiabada 600g',       cat: 'Panificados', un: 'un', varejo:  2790, ncm: '19052090', est:  22, min: 12,
    ficha: [[0, 0.290], [10, 0.180], [1, 0.080], [6, 0.005], [12, 1], [13, 1]] },
  { nome: 'Pizza congelada muçarela',     cat: 'Congelados',  un: 'un', varejo:  2690, ncm: '19059090', est:   9, min: 15,
    ficha: [[0, 0.210], [5, 0.180], [8, 0.030], [6, 0.004], [12, 1], [13, 1]] },
  { nome: 'Doce de leite pastoso 400g',   cat: 'Doces',       un: 'un', varejo:  1990, ncm: '19019020', est:  40, min: 18,
    ficha: [[4, 0.900], [1, 0.240], [11, 1], [13, 1]] },
  { nome: 'Brownie tradicional 300g',     cat: 'Confeitaria', un: 'un', varejo:  1890, ncm: '19059090', est:  26, min: 12,
    ficha: [[9, 0.110], [1, 0.130], [3, 0.090], [2, 0.080], [0, 0.070], [12, 1], [13, 1]] },
  { nome: 'Torta salgada de frango 1kg',  cat: 'Salgados',    un: 'un', varejo:  5490, ncm: '19059090', est:  11, min:  8,
    ficha: [[0, 0.340], [3, 0.130], [2, 0.140], [4, 0.150], [7, 0.010], [12, 1], [13, 1]] },
  { nome: 'Sequilho de polvilho 350g',    cat: 'Biscoitos',   un: 'un', varejo:  1690, ncm: '19053100', est:  62, min: 25,
    ficha: [[0, 0.190], [1, 0.110], [8, 0.070], [2, 0.050], [12, 1], [13, 1]] },
  { nome: 'Cuca de banana 700g',          cat: 'Confeitaria', un: 'un', varejo:  3090, ncm: '19059090', est:  16, min: 10,
    ficha: [[0, 0.270], [1, 0.160], [3, 0.100], [4, 0.120], [12, 1], [13, 1]] },
]

// Produtos de revenda: comprados prontos, sem ficha tecnica
const REVENDA = [
  { nome: 'Refrigerante cola 2L',      cat: 'Bebidas',  un: 'un', custo:  590, varejo:  990, ncm: '22021000', est:  72, min: 24 },
  { nome: 'Suco de uva integral 1L',   cat: 'Bebidas',  un: 'un', custo:  980, varejo: 1690, ncm: '20096100', est:  48, min: 20 },
  { nome: 'Agua mineral 500ml',        cat: 'Bebidas',  un: 'un', custo:  110, varejo:  350, ncm: '22011000', est: 140, min: 60 },
  { nome: 'Cafe torrado e moido 500g',  cat: 'Mercearia',un: 'un', custo: 1490, varejo: 2390, ncm: '09012100', est:  36, min: 15 },
  { nome: 'Achocolatado em po 400g',   cat: 'Mercearia',un: 'un', custo:  890, varejo: 1490, ncm: '18069000', est:   4, min: 12 },
  { nome: 'Requeijao cremoso 200g',    cat: 'Frios',    un: 'un', custo:  740, varejo: 1290, ncm: '04061010', est:  28, min: 12 },
]

const CLIENTES_PJ = [
  { nome: 'Mercado Bom Preco Ltda',      fant: 'Bom Preco',      doc: '77888999000100', tab: 'atacado_a', ie: '1122334455' },
  { nome: 'Padaria Estrela Ltda',        fant: 'Padaria Estrela',doc: '88999000000111', tab: 'atacado_a', ie: '2233445566' },
  { nome: 'Rede Super Economico SA',     fant: 'Super Economico',doc: '99000111000122', tab: 'atacado_c', ie: '3344556677' },
  { nome: 'Lanchonete do Ponto Ltda',    fant: 'Do Ponto',       doc: '10111222000133', tab: 'atacado_b', ie: '4455667788' },
  { nome: 'Conveniencia Posto Sul Ltda', fant: 'Posto Sul',      doc: '11222333000155', tab: 'atacado_b', ie: '5566778899' },
  { nome: 'Restaurante Sabor Caseiro ME',fant: 'Sabor Caseiro',  doc: '12333444000166', tab: 'atacado_a', ie: null },
]

const CLIENTES_PF = [
  'Ana Beatrizموreira'.replace(/[^\x20-\x7EÀ-ÿ]/g, ''), 'Carlos Eduardo Ramos', 'Daniela Souza Lima',
  'Eduardo Nogueira', 'Fernanda Alves Pinto', 'Gustavo Henrique Dias', 'Helena Martins',
  'Igor Vasconcelos', 'Juliana Prado', 'Leonardo Camargo', 'Mariana Figueiredo',
  'Nelson Batista', 'Patricia Rocha', 'Rafael Toledo',
]

const PERFIS_TRIB = [
  { nome: 'Venda no estado — Simples',      desc: 'Operacao interna, consumidor final',
    cfopI: '5102', cfopE: '6102', csosn: '102', aliq: '18.00', st: false },
  { nome: 'Venda com ST — Simples',         desc: 'Produto sujeito a substituicao tributaria',
    cfopI: '5401', cfopE: '6401', csosn: '201', aliq: '18.00', st: true, mva: '35.00', aliqSt: '18.00' },
  { nome: 'Revenda de mercadoria',          desc: 'Mercadoria adquirida de terceiro',
    cfopI: '5405', cfopE: '6404', csosn: '500', aliq: '0.00', st: false },
]

const CATEGORIAS_DESPESA = ['Energia eletrica', 'Agua', 'Aluguel', 'Folha de pagamento', 'Manutencao', 'Combustivel', 'Contabilidade', 'Internet e telefone']

// ─── Execucao ───────────────────────────────────────────────────────────────

async function main() {
  if (!SLUG) {
    console.log('\nUso:')
    console.log('  node scripts/semear-demo.js --slug demo')
    console.log('  node scripts/semear-demo.js --slug demo --aplicar')
    console.log('\nOpcional: --limpar   apaga os dados do tenant antes de semear\n')
    process.exit(1)
  }
  if (!/^[a-z0-9-]+$/.test(SLUG)) throw new Error('Slug invalido.')

  const SCHEMA = `tenant_${SLUG.replace(/-/g, '_')}`

  // TRAVA 1 — nunca a Zaghi, nem nada parecido
  if (/zaghi/i.test(SCHEMA) || /zaghi/i.test(SLUG)) {
    throw new Error('Recusado: este script nunca grava em schema de cliente real.')
  }

  const pool = new Pool(conexao())
  const c = await pool.connect()

  try {
    console.log(APLICAR ? '\n>>> MODO GRAVACAO\n' : '\n>>> SIMULACAO — nada sera gravado. Use --aplicar.\n')
    console.log(`schema:  ${SCHEMA}`)
    console.log(`empresa: ${EMPRESA.nome}\n`)

    const existe = await c.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`, [SCHEMA])
    if (existe.rows.length === 0) {
      throw new Error(
        `Schema "${SCHEMA}" nao existe.\n` +
        `  Crie antes:\n` +
        `  node scripts/provisionar-tenant.js --slug ${SLUG} --nome "${EMPRESA.nome}" --email SEU-EMAIL --aplicar`)
    }

    // TRAVA 2 — nao semear por cima de dado existente
    const jaTem = await c.query(`SELECT COUNT(*)::int AS n FROM "${SCHEMA}".t_produto`)
    if (jaTem.rows[0].n > 0 && !LIMPAR) {
      throw new Error(`Tenant ja tem ${jaTem.rows[0].n} produto(s). Use --limpar para recomecar do zero.`)
    }

    // Usuario dono, para created_by / updated_by
    const dono = await c.query(
      `SELECT usuario_id, nome, email FROM "${SCHEMA}".t_usuario ORDER BY usuario_id LIMIT 1`)
    if (dono.rows.length === 0) throw new Error('Tenant sem usuario. Rode provisionar-tenant.js primeiro.')
    const USUARIO_ID = dono.rows[0].usuario_id

    console.log(`usuario:  ${dono.rows[0].nome} <${dono.rows[0].email}>  (id ${USUARIO_ID})`)
    console.log(`\nSera criado:`)
    console.log(`  ${FORNECEDORES.length} fornecedores`)
    console.log(`  ${INSUMOS.length} insumos`)
    console.log(`  ${FABRICADOS.length} produtos fabricados, com ficha tecnica`)
    console.log(`  ${REVENDA.length} produtos de revenda`)
    console.log(`  ${CLIENTES_PJ.length + CLIENTES_PF.length} clientes`)
    console.log(`  ${PERFIS_TRIB.length} perfis tributarios`)
    console.log(`  ~1.000 vendas de balcao nos ultimos 60 dias (~R$ 170 mil), com itens e pagamentos`)
    console.log(`  ~30 pedidos de atacado, com contas a receber abertas e quitadas`)
    console.log(`  contas a pagar, despesas e 15 turnos de caixa fechados`)
    console.log(`  producao planejada e concluida das ultimas 8 semanas`)
    console.log(`  metas dos ultimos 3 meses (receita/despesa/lucro) e metas por produto do mes atual`)
    console.log(`  plano de acao com itens pendentes, em andamento e concluidos`)
    console.log(`  compras de insumo dos ultimos 45 dias, pagas e em aberto`)
    console.log(`  cardapio digital com mensagem, cor e whatsapp ja preenchidos (falta so a foto)`)
    console.log(`  fidelidade: programa de cashback configurado e extrato de alguns clientes`)
    console.log(`  6 comandas (2 abertas, 4 fechadas), 5 perdas de estoque, 1 contagem de inventario concluida\n`)
    console.log(`  Tempo estimado: 1 a 3 minutos.\n`)

    if (!APLICAR) {
      console.log('Rode com --aplicar para gravar.\n')
      return
    }

    await c.query('BEGIN')
    try {
      const ins = (t, d) => inserir(c, SCHEMA, t, d, USUARIO_ID)

      // ── Limpeza opcional ────────────────────────────────────────────────
      if (LIMPAR) {
        const ordem = [
          't_venda_pagamento','t_venda_item','t_venda','t_comanda_item','t_comanda',
          't_pedido_item','t_pedido','t_movimento_caixa','t_turno_caixa',
          't_nota_fiscal_item','t_nota_fiscal','t_conta_receber','t_conta_pagar','t_despesa',
          't_movimentacao_estoque','t_compra_item','t_compra','t_compra_insumo',
          't_producao_registro','t_producao_grade','t_producao_semanal',
          't_meta_produto','t_meta','t_plano_acao',
          't_fidelidade_movimento','t_fidelidade_aviso','t_fidelidade_config',
          't_contagem_inventario_item','t_contagem_inventario','t_perda_estoque',
          't_produto_insumo','t_cliente_produto','t_insumo_fornecedor',
          't_produto','t_insumo','t_cliente','t_fornecedor','t_perfil_tributario',
        ]
        let apagadas = 0
        for (const t of ordem) {
          if (await existeTabela(c, SCHEMA, t)) {
            await c.query(`DELETE FROM "${SCHEMA}"."${t}"`)
            const pk = await pkDe(c, SCHEMA, t)
            if (pk) await c.query(`ALTER TABLE "${SCHEMA}"."${t}" ALTER COLUMN "${pk}" RESTART WITH 1`)
            apagadas++
          }
        }
        console.log(`  ${apagadas} tabela(s) limpas`)
      }

      // ── Configuracoes da empresa ────────────────────────────────────────
      const colsCfg = await colunasDe(c, SCHEMA, 't_configuracoes_tenant')
      const setCfg = {
        nome_empresa: EMPRESA.nome, nome_fantasia: EMPRESA.fantasia,
        cnpj: EMPRESA.cnpj, inscricao_estadual: EMPRESA.ie,
        telefone: EMPRESA.telefone, email: EMPRESA.email,
        cep: EMPRESA.cep, endereco: EMPRESA.endereco, numero: EMPRESA.numero,
        bairro: EMPRESA.bairro, cidade: EMPRESA.cidade, uf: EMPRESA.uf,
        producao_ativo: true, estoque_ativo: true, insumo_ativo: true,
        compras_ativo: true, modulo_compras_ativo: true, financeiro_ativo: true,
        contas_pagar_ativo: true, contas_receber_ativo: true, vendas_ativo: true,
        pedidos_ativo: true, consultas_ativo: true, comandas_ativo: true,
        cardapio_ativo: true, turno_caixa_ativo: true, fiscal_ativo: true,
        contagem_inventario_ativo: true, perda_produto_ativo: true,
        entrada_nfe_ativo: true, multiplos_locais_ativo: false,
        metas_ativo: true, fidelidade_ativo: true, plano_acao_ativo: true,
        // Cardapio Digital — sem isso a tela fica com os campos em branco
        // nas capturas de tela (o valor so aparece depois que alguem preenche
        // manualmente pela tela de Configuracoes do cardapio).
        cardapio_mensagem_boas_vindas: 'Bem-vindo(a) a Bela Vista! Faca seu pedido e retire no balcao ou receba em casa.',
        cardapio_cor_destaque: '#2ecc71',
        cardapio_whatsapp: '(35) 99876-5432',
        cardapio_layout: 'grade',
        cardapio_permite_entrega: true, cardapio_permite_balcao: true,
      }
      const setPares = []
      const setVals  = []
      for (const [k, v] of Object.entries(setCfg)) {
        if (colsCfg.has(k)) { setVals.push(v); setPares.push(`"${k}" = $${setVals.length}`) }
        else avisos.add(`t_configuracoes_tenant.${k} nao existe — ignorado`)
      }
      if (setPares.length) {
        await c.query(`UPDATE "${SCHEMA}".t_configuracoes_tenant SET ${setPares.join(', ')}`, setVals)
      }
      console.log(`  configuracoes da empresa e ${Object.keys(setCfg).filter(k => k.endsWith('_ativo')).length} modulos ligados`)

      // ── Perfis tributarios ──────────────────────────────────────────────
      const perfilIds = []
      if (await existeTabela(c, SCHEMA, 't_perfil_tributario')) {
        for (const p of PERFIS_TRIB) {
          const id = await ins('t_perfil_tributario', {
            nome: p.nome, descricao: p.desc,
            cfop_interno: p.cfopI, cfop_interestadual: p.cfopE,
            csosn: p.csosn, cst_icms: '00', aliq_icms: p.aliq,
            red_base_icms: '0', tem_st: p.st,
            mva: p.mva ?? '0', aliq_icms_st: p.aliqSt ?? '0',
            cst_pis: '49', aliq_pis: '0', cst_cofins: '49', aliq_cofins: '0',
            cst_ipi: '53', aliq_ipi: '0',
            info_adicional: p.st ? 'Documento emitido por ME ou EPP optante pelo Simples Nacional' : null,
          })
          perfilIds.push(id)
        }
        console.log(`  ${perfilIds.length} perfis tributarios`)
      }

      // ── Fornecedores ────────────────────────────────────────────────────
      const fornIds = []
      for (const f of FORNECEDORES) {
        fornIds.push(await ins('t_fornecedor', {
          tipo_pessoa: 'PJ', nome_completo: f.nome, nome_fantasia: f.fant,
          cnpj_cpf: f.doc, telefone: '(35) 3' + inteiro(100, 999) + '-' + inteiro(1000, 9999),
          email: f.fant.toLowerCase().replace(/[^a-z]/g, '') + '@exemplo.com',
          contato: escolher(['Marcos', 'Simone', 'Rogerio', 'Claudia', 'Paulo']),
          cidade: f.cid, uf: f.uf, cep: '37900-000',
          endereco: 'Av. Comercial', numero: String(inteiro(100, 1900)), bairro: 'Centro',
        }))
      }
      console.log(`  ${fornIds.length} fornecedores`)

      // ── Insumos ─────────────────────────────────────────────────────────
      const insumoIds = []
      for (const i of INSUMOS) {
        insumoIds.push(await ins('t_insumo', {
          nome: i.nome, unidade: i.un, tipo: i.tipo,
          estoque_atual: i.est, estoque_minimo: i.min,
          preco_custo: i.custo, fornecedor_id: fornIds[i.forn] ?? null,
          descricao: null,
        }))
      }
      console.log(`  ${insumoIds.length} insumos (${INSUMOS.filter(i => i.est < i.min).length} abaixo do minimo, de proposito)`)

      // ── Vinculo insumo x fornecedor ─────────────────────────────────────
      if (await existeTabela(c, SCHEMA, 't_insumo_fornecedor')) {
        let n = 0
        for (let k = 0; k < INSUMOS.length; k++) {
          await ins('t_insumo_fornecedor', {
            insumo_id: insumoIds[k], fornecedor_id: fornIds[INSUMOS[k].forn],
            preco_unitario: INSUMOS[k].custo, unidade: INSUMOS[k].un, principal: true,
          }); n++
        }
        console.log(`  ${n} vinculos insumo/fornecedor`)
      }

      // ── Produtos fabricados, com custo calculado pela ficha ─────────────
      const produtoIds = []
      const produtoInfo = []
      for (const p of FABRICADOS) {
        const custo = Math.round(p.ficha.reduce((s, [idx, qtd]) => s + INSUMOS[idx].custo * qtd, 0))
        const id = await ins('t_produto', {
          nome: p.nome, categoria: p.cat, tipo: p.cat, unidade: p.un,
          estoque_atual: p.est, estoque_minimo: p.min,
          preco_custo: custo, preco_varejo: p.varejo,
          preco_atacado: Math.round(p.varejo * 0.82),
          preco_atacado_a: Math.round(p.varejo * 0.85),
          preco_atacado_b: Math.round(p.varejo * 0.82),
          preco_atacado_c: Math.round(p.varejo * 0.78),
          preco_atacado_d: Math.round(p.varejo * 0.75),
          preco_atacado_e: Math.round(p.varejo * 0.72),
          insumo_flg: false, revenda: false,
          ncm: p.ncm, cest: null, origem: '0', unidade_tributavel: p.un.toUpperCase(),
          perfil_trib_id: perfilIds[0] ?? null,
          disponivel_cardapio: true,
          codigo_barras: '789' + String(1000000 + produtoIds.length * 137).slice(0, 10),
        })
        produtoIds.push(id)
        produtoInfo.push({ id, nome: p.nome, varejo: p.varejo, custo })
      }

      // ── Produtos de revenda ─────────────────────────────────────────────
      for (const p of REVENDA) {
        const id = await ins('t_produto', {
          nome: p.nome, categoria: p.cat, tipo: p.cat, unidade: p.un,
          estoque_atual: p.est, estoque_minimo: p.min,
          preco_custo: p.custo, preco_varejo: p.varejo,
          preco_atacado: Math.round(p.varejo * 0.88),
          preco_atacado_a: Math.round(p.varejo * 0.90),
          preco_atacado_b: Math.round(p.varejo * 0.88),
          preco_atacado_c: Math.round(p.varejo * 0.85),
          preco_atacado_d: Math.round(p.varejo * 0.83),
          preco_atacado_e: Math.round(p.varejo * 0.80),
          insumo_flg: false, revenda: true,
          ncm: p.ncm, cest: null, origem: '0', unidade_tributavel: p.un.toUpperCase(),
          perfil_trib_id: perfilIds[2] ?? perfilIds[0] ?? null,
          disponivel_cardapio: true,
          codigo_barras: '789' + String(2000000 + produtoIds.length * 91).slice(0, 10),
        })
        produtoIds.push(id)
        produtoInfo.push({ id, nome: p.nome, varejo: p.varejo, custo: p.custo })
      }
      console.log(`  ${produtoIds.length} produtos (${FABRICADOS.length} fabricados, ${REVENDA.length} de revenda)`)

      // ── Fichas tecnicas ─────────────────────────────────────────────────
      let linhasFicha = 0
      for (let k = 0; k < FABRICADOS.length; k++) {
        for (const [idx, qtd] of FABRICADOS[k].ficha) {
          await ins('t_produto_insumo', {
            produto_id: produtoIds[k], insumo_id: insumoIds[idx],
            quantidade: qtd.toFixed(6), unidade: INSUMOS[idx].un,
          }); linhasFicha++
        }
      }
      console.log(`  ${linhasFicha} linhas de ficha tecnica`)

      // ── Clientes ────────────────────────────────────────────────────────
      const clienteIds = []
      for (const cl of CLIENTES_PJ) {
        clienteIds.push(await ins('t_cliente', {
          tipo_pessoa: 'PJ', nome_completo: cl.nome, nome_fantasia: cl.fant,
          documento: cl.doc, tabela_preco: cl.tab,
          inscricao_estadual: cl.ie, indicador_ie: cl.ie ? '1' : '9',
          telefone: '(35) 3' + inteiro(100, 999) + '-' + inteiro(1000, 9999),
          celular: '(35) 9' + inteiro(1000, 9999) + '-' + inteiro(1000, 9999),
          email: cl.fant.toLowerCase().replace(/[^a-z]/g, '') + '@exemplo.com',
          cep: '37900-' + inteiro(100, 999), endereco: 'Rua ' + escolher(['das Flores', 'Sete de Setembro', 'Minas Gerais', 'Sao Paulo']),
          numero: String(inteiro(10, 990)), bairro: escolher(['Centro', 'Belo Horizonte', 'Penha', 'Jardim Bela Vista']),
          cidade: escolher(['Passos', 'Sao Sebastiao do Paraiso', 'Alfenas', 'Piumhi']), uf: 'MG',
        }))
      }
      for (const nome of CLIENTES_PF) {
        clienteIds.push(await ins('t_cliente', {
          tipo_pessoa: 'PF', nome_completo: nome, documento: null,
          tabela_preco: 'varejo', indicador_ie: '9',
          celular: '(35) 9' + inteiro(1000, 9999) + '-' + inteiro(1000, 9999),
          email: nome.toLowerCase().split(' ')[0] + '@exemplo.com',
          cidade: 'Passos', uf: 'MG', cep: '37900-' + inteiro(100, 999),
          endereco: 'Rua ' + escolher(['Sao Jose', 'Bahia', 'Goias', 'Ceara']),
          numero: String(inteiro(10, 990)), bairro: escolher(['Centro', 'Penha', 'Aureliano']),
        }))
      }
      console.log(`  ${clienteIds.length} clientes`)

      // ── Formas de pagamento (garantir que existam) ──────────────────────
      let formas = (await c.query(`SELECT forma_id, nome FROM "${SCHEMA}".t_forma_pagamento WHERE active_flg = true`)).rows
      if (formas.length === 0) {
        for (const [nome, taxa] of [['Dinheiro', '0'], ['PIX', '0'], ['Cartao de debito', '1.50'], ['Cartao de credito', '3.20']]) {
          await ins('t_forma_pagamento', { nome, taxa })
        }
        formas = (await c.query(`SELECT forma_id, nome FROM "${SCHEMA}".t_forma_pagamento`)).rows
      }
      const nomesFormas = formas.map(f => f.nome)

      // ── Turnos de caixa ─────────────────────────────────────────────────
      const turnoIds = []
      if (await existeTabela(c, SCHEMA, 't_turno_caixa')) {
        for (let d = 14; d >= 0; d--) {
          const abriu = diasAtras(d, 8, 0)
          const fechou = d === 0 ? null : diasAtras(d, 18, 30)
          const abertura = 20000
          const esperado = abertura + inteiro(45000, 190000)
          const dif = d === 0 ? 0 : escolher([0, 0, 0, -500, 300, -1200, 800])
          const tid = await ins('t_turno_caixa', {
            numero_caixa: 1, operador: dono.rows[0].nome,
            aberto_em: abriu, fechado_em: fechou,
            status: d === 0 ? 'aberto' : 'fechado',
            valor_abertura: abertura,
            valor_fechamento: fechou ? esperado + dif : 0,
            valor_esperado: fechou ? esperado : 0,
            diferenca: fechou ? dif : 0,
            __data: abriu,
          })
          turnoIds.push(tid)
          if (fechou && await existeTabela(c, SCHEMA, 't_movimento_caixa')) {
            if (rnd() > 0.5) {
              await ins('t_movimento_caixa', {
                turno_id: tid, tipo: 'sangria', valor: inteiro(10000, 50000),
                motivo: 'Retirada para deposito bancario', ocorrido_em: diasAtras(d, 14, 0), __data: diasAtras(d, 14, 0),
              })
            }
            if (rnd() > 0.75) {
              await ins('t_movimento_caixa', {
                turno_id: tid, tipo: 'suprimento', valor: inteiro(5000, 20000),
                motivo: 'Troco', ocorrido_em: diasAtras(d, 9, 30), __data: diasAtras(d, 9, 30),
              })
            }
          }
        }
        console.log(`  ${turnoIds.length} turnos de caixa`)
      }

      // ── Vendas ──────────────────────────────────────────────────────────
      let nVendas = 0, totalVendido = 0
      for (let d = 59; d >= 0; d--) {
        // Sabado move mais, domingo quase nada — a curva semanal aparece nos
        // graficos e e o que faz o painel parecer de empresa, nao de teste.
        const diaSemana = diasAtras(d).getDay()
        const fator = diaSemana === 0 ? 0.25 : diaSemana === 6 ? 1.5 : 1
        const base = d < 20 ? inteiro(16, 28) : inteiro(11, 20)
        const porDia = Math.max(1, Math.round(base * fator))
        for (let v = 0; v < porDia; v++) {
          const dataVenda = diasAtras(d, inteiro(8, 18), inteiro(0, 59))
          const nItens = inteiro(1, 5)
          const itens = []
          let subtotal = 0
          for (let i = 0; i < nItens; i++) {
            const p = escolher(produtoInfo)
            const qtd = inteiro(1, 4)
            const sub = p.varejo * qtd
            itens.push({ p, qtd, sub })
            subtotal += sub
          }
          const desconto = rnd() > 0.85 ? Math.round(subtotal * 0.05) : 0
          const total = subtotal - desconto
          const comCliente = rnd() > 0.55
          const turnoIdx = 14 - Math.min(d, 14)
          const vendaId = await ins('t_venda', {
            origem: 'pdv',
            cliente_id: comCliente ? escolher(clienteIds) : null,
            nome_cliente_avulso: comCliente ? null : 'Cliente avulso',
            status: 'concluida', tipo_entrega: 'balcao',
            subtotal, desconto, total,
            vendedor: dono.rows[0].nome,
            documento_fiscal: rnd() > 0.6 ? 'nfce' : 'nenhum',
            imprimir_nota: false,
            turno_id: d <= 14 ? turnoIds[turnoIdx] ?? null : null,
            numero_caixa: 1,
            vendida_em: dataVenda,
            __data: dataVenda,
          })
          for (const it of itens) {
            await ins('t_venda_item', {
              venda_id: vendaId, produto_id: it.p.id, nome_produto: it.p.nome,
              quantidade: it.qtd, preco_unitario: it.p.varejo, subtotal: it.sub, desconto: 0,
              __data: dataVenda,
            })
          }
          await ins('t_venda_pagamento', {
            venda_id: vendaId, forma: escolher(nomesFormas), valor: total, __data: dataVenda,
          })
          nVendas++; totalVendido += total
        }
      }
      console.log(`  ${nVendas} vendas, ${R(totalVendido)} em 60 dias`)

      // ── Pedidos ─────────────────────────────────────────────────────────
      let nPedidos = 0
      for (let d = 45; d >= 0; d--) {
        if (diasAtras(d).getDay() === 0) continue          // domingo nao tem entrega
        if (rnd() > 0.7) continue                          // nem todo dia tem pedido
        const dataPedido = diasAtras(d, 9, 0)
        const entregue = d > 3
        const cliId = escolher(clienteIds.slice(0, CLIENTES_PJ.length))
        const nItens = inteiro(3, 7)
        const itens = []
        let subtotal = 0
        for (let i = 0; i < nItens; i++) {
          const p = escolher(produtoInfo)
          const qtd = inteiro(10, 60)
          const preco = Math.round(p.varejo * 0.85)
          itens.push({ p, qtd, preco, sub: preco * qtd })
          subtotal += preco * qtd
        }
        const pedidoId = await ins('t_pedido', {
          cliente_id: cliId, tipo_venda: 'entrega',
          status: entregue ? 'entregue' : escolher(['pendente', 'producao']),
          data_pedido: dataPedido,
          previsao_entrega: diasAtras(d - 2, 10, 0),
          valor_entrega: 0,
          documento_fiscal: 'nfe', imprimir_nota: true,
          __data: dataPedido,
        })
        for (const it of itens) {
          await ins('t_pedido_item', {
            pedido_id: pedidoId, produto_id: it.p.id, nome_produto: it.p.nome,
            quantidade: it.qtd, preco_unitario: it.preco, subtotal: it.sub,
            __data: dataPedido,
          })
        }
        // Entrega gera conta a receber; recebimento gera a venda (regra do sistema)
        if (entregue && await existeTabela(c, SCHEMA, 't_conta_receber')) {
          const recebido = d > 10
          const venc = diasAtras(d - 15, 12, 0)
          await ins('t_conta_receber', {
            descricao: `Pedido ${pedidoId}`,
            cliente_id: cliId,
            nome_cliente: CLIENTES_PJ[clienteIds.indexOf(cliId)]?.fant ?? null,
            categoria: 'Venda', numero_documento: String(pedidoId),
            valor_base: subtotal, desconto: 0, acrescimo: 0,
            valor_original: subtotal, valor_recebido: recebido ? subtotal : 0,
            data_emissao: soData(dataPedido),
            data_vencimento: soData(venc),
            data_recebimento: recebido ? soData(diasAtras(d - 14, 12, 0)) : null,
            data_entrega: soData(diasAtras(d - 2, 10, 0)),
            status: recebido ? 'recebido' : 'aberto',
            forma_recebimento: recebido ? escolher(nomesFormas) : null,
            origem: 'pedido', origem_id: pedidoId,
            parcela_atual: 1, total_parcelas: 1,
            __data: dataPedido,
          })
        }
        nPedidos++
      }
      console.log(`  ${nPedidos} pedidos, com contas a receber`)

      // ── Contas a pagar e despesas ───────────────────────────────────────
      let nPagar = 0, nDespesa = 0
      for (let m = 2; m >= 0; m--) {
        for (const cat of CATEGORIAS_DESPESA) {
          const emissao = diasAtras(m * 30 + 25, 9, 0)
          const venc = diasAtras(m * 30 + 10, 9, 0)
          const pago = m > 0
          const valor = inteiro(15000, 320000)
          if (await existeTabela(c, SCHEMA, 't_conta_pagar')) {
            const cpId = await ins('t_conta_pagar', {
              descricao: cat, categoria: cat,
              fornecedor_id: rnd() > 0.6 ? escolher(fornIds) : null,
              valor_original: valor, valor_pago: pago ? valor : 0,
              data_emissao: soData(emissao), data_vencimento: soData(venc),
              data_pagamento: pago ? soData(venc) : null,
              status: pago ? 'pago' : 'aberto',
              forma_pagamento: pago ? escolher(nomesFormas) : null,
              origem: 'manual', parcela_atual: 1, total_parcelas: 1,
              __data: emissao,
            }); nPagar++
            if (pago && await existeTabela(c, SCHEMA, 't_despesa')) {
              await ins('t_despesa', {
                nome: cat, categoria: cat, valor,
                data_despesa: venc, data_pagamento: venc,
                recorrente: true, periodo_recorrencia: 'mensal',
                conta_pagar_id: cpId, __data: venc,
              }); nDespesa++
            }
          }
        }
      }
      console.log(`  ${nPagar} contas a pagar, ${nDespesa} despesas`)

      // ── Producao planejada e realizada ──────────────────────────────────
      let nProd = 0
      if (await existeTabela(c, SCHEMA, 't_producao_semanal')) {
        for (let d = 56; d >= 0; d -= 7) {
          for (let k = 0; k < FABRICADOS.length; k++) {
            if (rnd() > 0.65) continue
            const data = diasAtras(d, 7, 0)
            await ins('t_producao_semanal', {
              produto_id: produtoIds[k],
              data_producao: soData(data),
              quantidade: inteiro(10, 80),
              status: d > 7 ? 'concluido' : 'planejado',
              __data: data,
            }); nProd++
          }
        }
        console.log(`  ${nProd} registros de producao`)
      }

      // ── Movimentacao de estoque ─────────────────────────────────────────
      let nMov = 0
      if (await existeTabela(c, SCHEMA, 't_movimentacao_estoque')) {
        for (let d = 40; d >= 0; d -= 3) {
          const data = diasAtras(d, 10, 0)
          const idx = inteiro(0, INSUMOS.length - 1)
          await ins('t_movimentacao_estoque', {
            tipo: 'entrada', entidade: 'insumo', entidade_id: insumoIds[idx],
            quantidade: String(inteiro(20, 120)), preco_custo: INSUMOS[idx].custo,
            observacao: 'Compra de fornecedor', data_movimentacao: data, __data: data,
          }); nMov++
          const pIdx = inteiro(0, produtoIds.length - 1)
          await ins('t_movimentacao_estoque', {
            tipo: 'saida', entidade: 'produto', entidade_id: produtoIds[pIdx],
            quantidade: String(inteiro(2, 25)), preco_custo: produtoInfo[pIdx].custo,
            observacao: 'Venda', data_movimentacao: data, __data: data,
          }); nMov++
        }
        console.log(`  ${nMov} movimentacoes de estoque`)
      }

      // ── Metas (receita/despesa/lucro por mes) ───────────────────────────
      // Sem isso a tela de Metas — o carro-chefe do sistema — aparece vazia:
      // metas_ativo liga o menu, mas ninguem digitou um alvo ainda.
      let nMeta = 0
      if (await existeTabela(c, SCHEMA, 't_meta')) {
        for (let k = 2; k >= 0; k--) {
          const { mes, ano } = mesAno(k)
          const metaReceita = inteiro(72000, 88000) * 100
          const metaDespesaMaxima = inteiro(46000, 56000) * 100
          const metaLucro = metaReceita - metaDespesaMaxima - inteiro(3000, 9000) * 100
          await ins('t_meta', { mes, ano, meta_receita: metaReceita, meta_despesa_maxima: metaDespesaMaxima, meta_lucro: metaLucro })
          nMeta++
        }
        console.log(`  ${nMeta} metas mensais (receita/despesa/lucro)`)
      }

      // ── Metas por produto (mes atual) ────────────────────────────────────
      let nMetaProduto = 0
      if (await existeTabela(c, SCHEMA, 't_meta_produto')) {
        const { mes, ano } = mesAno(0)
        for (let k = 0; k < Math.min(6, FABRICADOS.length); k++) {
          await ins('t_meta_produto', {
            mes, ano, produto_id: produtoIds[k],
            quantidade_meta: Math.round(FABRICADOS[k].est * 1.6),
          })
          nMetaProduto++
        }
        console.log(`  ${nMetaProduto} metas por produto`)
      }

      // ── Plano de acao ─────────────────────────────────────────────────
      let nAcao = 0
      if (await existeTabela(c, SCHEMA, 't_plano_acao')) {
        const ACOES = [
          { id: 'Estoque baixo de chocolate em po',   acao: 'Fazer pedido emergencial ao fornecedor Comercial Tres Irmaos antes que falte na producao do brownie.', resp: 'Producao', dias: 1, status: 'pendente' },
          { id: 'Turno de caixa com diferenca',        acao: 'Conferir sangrias do turno com diferenca negativa e treinar operador na contagem de fechamento.',       resp: dono.rows[0].nome, dias: 4, status: 'em_andamento' },
          { id: 'Cliente atacado em atraso',            acao: 'Ligar para Rede Super Economico sobre a parcela vencida e negociar novo prazo.',                       resp: 'Financeiro', dias: 6, status: 'em_andamento' },
          { id: 'Cardapio digital sem foto de capa',    acao: 'Fotografar os produtos e subir o banner do cardapio digital.',                                        resp: 'Marketing', dias: 10, status: 'concluida' },
          { id: 'Meta de producao da rosca de goiabada',acao: 'Aumentar a grade semanal em 20% para acompanhar a demanda de fim de semana.',                          resp: 'Producao', dias: 12, status: 'concluida' },
          { id: 'Revisar precos de atacado',            acao: 'Recalcular a tabela atacado B considerando o novo custo da manteiga.',                                resp: 'Financeiro', dias: 20, status: 'pendente' },
        ]
        for (const a of ACOES) {
          const data = diasAtras(a.dias, 9, 0)
          const concluida = a.status === 'concluida'
          await ins('t_plano_acao', {
            data_acao: soData(data), identificacao: a.id, acao: a.acao,
            responsavel: a.resp, status: a.status,
            concluido_em: concluida ? diasAtras(Math.max(0, a.dias - 2), 16, 0) : null,
            __data: data,
          })
          nAcao++
        }
        console.log(`  ${nAcao} itens de plano de acao`)
      }

      // ── Compras (entrada de insumo por fornecedor) ───────────────────────
      let nCompra = 0
      if (await existeTabela(c, SCHEMA, 't_compra_insumo')) {
        for (let d = 45; d >= 0; d -= inteiro(3, 6)) {
          const idx = inteiro(0, INSUMOS.length - 1)
          const insumo = INSUMOS[idx]
          const fornIdx = insumo.forn
          const data = diasAtras(d, 10, 0)
          const qtd = inteiro(20, 150)
          const paga = d > 5
          await ins('t_compra_insumo', {
            fornecedor_id: fornIds[fornIdx], insumo_id: insumoIds[idx],
            nome_fornecedor: FORNECEDORES[fornIdx].fant, nome_insumo: insumo.nome,
            data_entrada: soData(data), data_pagamento: paga ? soData(diasAtras(Math.max(0, d - 3), 10, 0)) : null,
            valor_unitario: insumo.custo, quantidade: String(qtd), caixas: 0, qtd_total: String(qtd),
            quem_pagou: paga ? dono.rows[0].nome : null,
            status: paga ? 'pago' : 'pendente',
            __data: data,
          })
          nCompra++
        }
        console.log(`  ${nCompra} compras de insumo`)
      }

      // ── Fidelidade (programa de cashback) ────────────────────────────────
      if (await existeTabela(c, SCHEMA, 't_fidelidade_config')) {
        const jaTemConfig = await c.query(`SELECT 1 FROM "${SCHEMA}".t_fidelidade_config LIMIT 1`)
        if (jaTemConfig.rows.length === 0) {
          await ins('t_fidelidade_config', {
            programa_ativo: true, cashback_pct_bp: 500, compra_minima_centavos: 2000,
            validade_dias: 90, limite_uso_pct_bp: 5000, saldo_minimo_uso_centavos: 500,
            arredondamento: 'centavo', base_calculo: 'liquido',
            reativacao_ativa: true, dias_inatividade: 30, repetir_aviso: false,
            intervalo_repeticao_dias: 30, max_avisos: 3, saldo_minimo_aviso_centavos: 500,
            horario_inicio: 9, horario_fim: 20,
            mensagem_padrao: 'Voce tem cashback disponivel na Bela Vista! Volte e aproveite.',
            exige_optin: true,
          })
          console.log('  1 configuracao de fidelidade (cashback 5%)')
        }

        // Extrato: credito em compras antigas de alguns clientes PF, com uso parcial em parte deles
        let nMovFid = 0
        if (await existeTabela(c, SCHEMA, 't_fidelidade_movimento')) {
          const clientesPF = clienteIds.slice(CLIENTES_PJ.length)
          for (let k = 0; k < Math.min(6, clientesPF.length); k++) {
            const dataCredito = diasAtras(inteiro(10, 55), 15, 0)
            const valorCredito = inteiro(300, 1200)
            await ins('t_fidelidade_movimento', {
              cliente_id: clientesPF[k], tipo: 'credito', valor_centavos: valorCredito,
              expira_em: diasAtras(-inteiro(20, 60)), observacao: 'Cashback de compra no balcao',
              __data: dataCredito,
            }); nMovFid++
            if (rnd() > 0.5) {
              const dataUso = diasAtras(inteiro(1, 9), 15, 0)
              await ins('t_fidelidade_movimento', {
                cliente_id: clientesPF[k], tipo: 'uso', valor_centavos: -Math.round(valorCredito * 0.6),
                observacao: 'Usado em nova compra', __data: dataUso,
              }); nMovFid++
            }
          }
          console.log(`  ${nMovFid} movimentos de cashback`)
        }
      }

      // ── Comandas (atendimento no balcao) ─────────────────────────────────
      let nComanda = 0
      if (await existeTabela(c, SCHEMA, 't_comanda')) {
        for (let k = 0; k < 6; k++) {
          const aberta = k >= 4
          const dataAbertura = aberta ? diasAtras(0, 11, 0) : diasAtras(inteiro(1, 5), 12, 0)
          const nItens = inteiro(1, 4)
          const itens = []
          let total = 0
          for (let i = 0; i < nItens; i++) {
            const p = escolher(produtoInfo)
            const qtd = inteiro(1, 3)
            const sub = p.varejo * qtd
            itens.push({ p, qtd, sub })
            total += sub
          }
          const comandaId = await ins('t_comanda', {
            identificacao: `Mesa ${k + 1}`, status: aberta ? 'aberta' : 'fechada',
            total, aberta_em: dataAbertura, fechada_em: aberta ? null : diasAtras(inteiro(1, 5), 13, 30),
            __data: dataAbertura,
          })
          for (const it of itens) {
            await ins('t_comanda_item', {
              comanda_id: comandaId, produto_id: it.p.id, nome_produto: it.p.nome,
              quantidade: it.qtd, preco_unitario: it.p.varejo, subtotal: it.sub,
              __data: dataAbertura,
            })
          }
          nComanda++
        }
        console.log(`  ${nComanda} comandas (2 abertas, 4 fechadas)`)
      }

      // ── Perda de estoque ──────────────────────────────────────────────────
      let nPerda = 0
      if (await existeTabela(c, SCHEMA, 't_perda_estoque')) {
        const MOTIVOS = ['vencimento', 'quebra', 'erro_producao', 'contaminacao']
        for (let k = 0; k < 5; k++) {
          const usaProduto = rnd() > 0.5
          const idx = inteiro(0, (usaProduto ? produtoIds.length : insumoIds.length) - 1)
          const qtd = inteiro(1, 8)
          const data = diasAtras(inteiro(2, 40), 8, 30)
          const valorUnit = usaProduto ? produtoInfo[idx].custo : INSUMOS[idx].custo
          await ins('t_perda_estoque', {
            entidade: usaProduto ? 'produto' : 'insumo',
            entidade_id: usaProduto ? produtoIds[idx] : insumoIds[idx],
            nome_entidade: usaProduto ? produtoInfo[idx].nome : INSUMOS[idx].nome,
            quantidade: String(qtd), motivo: escolher(MOTIVOS),
            data_perda: soData(data), valor_estimado: valorUnit * qtd,
            __data: data,
          })
          nPerda++
        }
        console.log(`  ${nPerda} registros de perda de estoque`)
      }

      // ── Contagem de inventario ─────────────────────────────────────────────
      if (await existeTabela(c, SCHEMA, 't_contagem_inventario')) {
        const dataContagem = diasAtras(6, 8, 0)
        const contagemId = await ins('t_contagem_inventario', {
          descricao: 'Contagem mensal de estoque', data_contagem: soData(dataContagem),
          status: 'concluida', __data: dataContagem,
        })
        let nItensContagem = 0
        if (await existeTabela(c, SCHEMA, 't_contagem_inventario_item')) {
          for (let k = 0; k < Math.min(8, INSUMOS.length); k++) {
            const sistema = INSUMOS[k].est
            const contada = Math.max(0, sistema + inteiro(-4, 4))
            await ins('t_contagem_inventario_item', {
              contagem_id: contagemId, entidade: 'insumo', entidade_id: insumoIds[k],
              nome_entidade: INSUMOS[k].nome, quantidade_sistema: String(sistema),
              quantidade_contada: String(contada), diferenca: String(contada - sistema),
              __data: dataContagem,
            }); nItensContagem++
          }
        }
        console.log(`  1 contagem de inventario concluida, ${nItensContagem} itens`)
      }

      await c.query('COMMIT')
    } catch (e) {
      await c.query('ROLLBACK')
      throw e
    }

    if (avisos.size) {
      console.log(`\nAvisos (${avisos.size}) — colunas que o script esperava e nao existem neste tenant:`)
      for (const a of avisos) console.log(`  - ${a}`)
      console.log('  Nada quebrou: essas colunas foram simplesmente puladas.')
    }

    console.log(`\nOK — ${EMPRESA.nome} semeada em ${SCHEMA}.\n`)
    console.log('COMO ENTRAR:')
    console.log(`  1. Clerk (Production) -> Users -> Invite -> ${dono.rows[0].email}`)
    console.log('  2. Aceite o convite e defina a senha')
    console.log(`  3. Local:      http://localhost:3000/${SLUG}`)
    console.log(`     Producao:   https://app.sistematizaoficial.com/${SLUG}`)
    console.log('  4. O vinculo da conta com o schema se faz sozinho no primeiro acesso\n')
    console.log('Para recomecar do zero:')
    console.log(`  node scripts/semear-demo.js --slug ${SLUG} --limpar --aplicar\n`)
  } finally {
    c.release()
    await pool.end()
  }
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1) })
