/**
 * Diagnóstico da Composição Total (ficha explodida).
 * Roda a MESMA consulta e a MESMA lógica do ComposicaoService, direto no banco,
 * e imprime o resultado — para descobrir se o problema é dado ou aplicação.
 *
 * Rodar:  node scripts/debug-composicao.js "Canelloni Frango"
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
})

const SCHEMA = 'tenant_zaghi_massas_caseiras'
const NOME   = process.argv[2] || 'Canelloni Frango'

function converterUnidade(q, de, para) {
  const f = String(de ?? '').toLowerCase().trim()
  const e = String(para ?? '').toLowerCase().trim()
  if (!f || !e || f === e) return q
  if (f === 'g'  && e === 'kg') return q / 1000
  if (f === 'kg' && e === 'g')  return q * 1000
  if (f === 'ml' && e === 'l')  return q / 1000
  if (f === 'l'  && e === 'ml') return q * 1000
  return q
}

pool.connect().then(async client => {
  await client.query(`SET search_path TO "${SCHEMA}", public`)
  console.log(`\nSchema: ${SCHEMA}`)
  console.log(`Produto procurado: "${NOME}"\n`)

  // 1. Localiza o produto
  const prod = await client.query(
    `SELECT produto_id, nome, unidade, active_flg FROM t_produto
     WHERE LOWER(nome) LIKE LOWER($1) ORDER BY produto_id`,
    [`%${NOME}%`]
  )
  console.log('--- Produtos encontrados ---')
  prod.rows.forEach(r => console.log(`  id=${r.produto_id}  "${r.nome}"  unidade=${r.unidade}  ativo=${r.active_flg}`))
  if (prod.rows.length === 0) { console.log('  (nenhum)'); client.release(); pool.end(); return }

  const produtoId = prod.rows[0].produto_id

  // 2. Total de linhas de ficha no tenant
  const tot = await client.query(`SELECT COUNT(*)::int AS n FROM t_produto_insumo WHERE active_flg = true`)
  console.log(`\n--- t_produto_insumo (ativos) no tenant: ${tot.rows[0].n} ---`)

  // 3. Linhas de ficha DESTE produto (cru, sem join)
  const direto = await client.query(
    `SELECT produto_insumo_id, produto_id, insumo_id, quantidade, unidade, active_flg
     FROM t_produto_insumo WHERE produto_id = $1 ORDER BY produto_insumo_id`,
    [produtoId]
  )
  console.log(`\n--- Componentes diretos do produto ${produtoId} (${direto.rowCount} linha(s)) ---`)
  direto.rows.forEach(r => console.log(`  item=${r.produto_insumo_id} insumo_id=${r.insumo_id} qtd=${r.quantidade} ${r.unidade} ativo=${r.active_flg}`))

  // 4. MESMA consulta do ComposicaoService
  const res = await client.query(`
    SELECT pi.produto_id, pi.insumo_id, pi.quantidade, pi.unidade,
           i.nome        AS insumo_nome,
           i.unidade     AS insumo_unidade,
           i.preco_custo AS insumo_preco_custo,
           p.nome        AS produto_nome,
           p.unidade     AS produto_unidade
    FROM t_produto_insumo pi
    LEFT JOIN t_insumo  i ON i.insumo_id = pi.insumo_id     AND pi.insumo_id > 0 AND i.active_flg = true
    LEFT JOIN t_produto p ON (-pi.insumo_id) = p.produto_id AND pi.insumo_id < 0 AND p.active_flg = true
    WHERE pi.active_flg = true
  `)
  console.log(`\n--- Consulta do service: ${res.rowCount} linha(s) carregada(s) ---`)

  const fichaPorProduto = {}
  for (const r of res.rows) {
    const pid = Number(r.produto_id)
    if (!fichaPorProduto[pid]) fichaPorProduto[pid] = []
    fichaPorProduto[pid].push(r)
  }
  console.log(`Linhas indexadas para o produto ${produtoId}: ${(fichaPorProduto[produtoId] ?? []).length}`)
  for (const r of fichaPorProduto[produtoId] ?? []) {
    console.log(`  insumo_id=${r.insumo_id} qtd=${r.quantidade} ${r.unidade} | insumo_nome=${r.insumo_nome ?? 'NULL'} | produto_nome=${r.produto_nome ?? 'NULL'}`)
  }

  // 5. Explosão (mesma lógica)
  const acumulado = {}
  const emUso = new Set()
  const percorrer = (pid, mult, caminho, nivel) => {
    if (nivel > 10) return
    for (const r of fichaPorProduto[pid] ?? []) {
      const qtdFicha = parseFloat(String(r.quantidade ?? 0)) * mult
      if (!isFinite(qtdFicha) || qtdFicha <= 0) { console.log(`  [pulado] qtd invalida/zero: insumo_id=${r.insumo_id}`); continue }
      if (Number(r.insumo_id) > 0) {
        if (!r.insumo_nome) { console.log(`  [pulado] insumo sem nome (inativo?): insumo_id=${r.insumo_id}`); continue }
        const qtd = converterUnidade(qtdFicha, r.unidade, r.insumo_unidade)
        const id = Number(r.insumo_id)
        if (!acumulado[id]) acumulado[id] = { nome: r.insumo_nome, unidade: r.insumo_unidade, quantidade: 0, origens: {} }
        acumulado[id].quantidade += qtd
        acumulado[id].origens[caminho] = (acumulado[id].origens[caminho] ?? 0) + qtd
      } else {
        if (!r.produto_nome) { console.log(`  [pulado] produto-insumo sem nome (inativo?): insumo_id=${r.insumo_id}`); continue }
        const filhoId = -Number(r.insumo_id)
        if (emUso.has(filhoId)) { console.log(`  [pulado] ciclo em ${r.produto_nome}`); continue }
        const qtdFilho = converterUnidade(qtdFicha, r.unidade, r.produto_unidade)
        emUso.add(filhoId)
        percorrer(filhoId, qtdFilho, caminho === 'Direto' ? r.produto_nome : `${caminho} > ${r.produto_nome}`, nivel + 1)
        emUso.delete(filhoId)
      }
    }
  }
  emUso.add(produtoId)
  console.log(`\n--- Explodindo ---`)
  percorrer(produtoId, 1, 'Direto', 0)

  console.log(`\n--- RESULTADO (${Object.keys(acumulado).length} insumo(s)) ---`)
  for (const [id, v] of Object.entries(acumulado)) {
    console.log(`  ${v.nome}: ${v.quantidade.toFixed(6)} ${v.unidade}`)
    for (const [org, q] of Object.entries(v.origens)) console.log(`      via ${org}: ${q.toFixed(6)}`)
  }

  console.log('')
  client.release()
  pool.end()
}).catch(err => { console.error('Erro:', err.message); process.exit(1) })