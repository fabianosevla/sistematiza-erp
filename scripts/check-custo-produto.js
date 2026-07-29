// scripts/check-custo-produto.js
//
// Diagnóstico SOMENTE LEITURA do custo de um produto.
//
// Existem três caminhos independentes calculando custo no sistema, e eles
// podem discordar entre si:
//
//   A) FichaTecnicaView  — soma em JavaScript: Σ quantidade × precoCusto,
//                          onde precoCusto vem da lista de insumos da tela.
//                          SEM conversão de unidade.
//   B) FichaTecnicaService.getByProduto — subquery SQL de UM nível: para um
//                          produto-insumo, soma a ficha dele usando
//                          COALESCE(i3.preco_custo, p3.preco_custo, 0).
//                          Netos entram pelo preco_custo manual, não pela ficha.
//                          SEM conversão de unidade.
//   C) ComposicaoService — explode recursivamente até sobrar insumo puro,
//                          COM conversão de unidade (kg↔g, l↔ml).
//
// É a divergência entre A e B que faz o mesmo molho valer 26,27 na tela dele
// e 20,77 quando entra na lasanha.
//
// Uso:
//   node scripts/check-custo-produto.js "molho bolonhesa"
//   node scripts/check-custo-produto.js "molho bolonhesa" --tenant tenant_outro
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const argv   = process.argv.slice(2)
const busca  = argv.find(a => !a.startsWith('--')) ?? ''
const iTen   = argv.indexOf('--tenant')
const TENANT = iTen >= 0 ? argv[iTen + 1] : 'tenant_zaghi_massas_caseiras'

const brl = c => (Number(c ?? 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Mesma tabela de conversão do lib/unidades.ts
const FATOR = { kg: 1000, g: 1, l: 1000, ml: 1, un: 1, cx: 1 }
function converter(qtd, de, para) {
  const a = FATOR[String(de ?? '').toLowerCase()]
  const b = FATOR[String(para ?? '').toLowerCase()]
  if (!a || !b) return qtd
  return qtd * a / b
}

// O .env.local do projeto guarda a conexão em partes (DB_HOST, DB_PORT, ...),
// não como DATABASE_URL. Aceita as duas formas.
function conexao() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL }
  const host = process.env.DB_HOST
  if (!host) throw new Error('Defina DATABASE_URL ou DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD no .env.local')
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

async function main() {
  if (!busca) {
    console.log('Informe parte do nome do produto. Ex.: node scripts/check-custo-produto.js "molho bolonhesa"')
    return
  }

  const pool   = new Pool(conexao())
  const client = await pool.connect()

  try {
    await client.query(`SET search_path TO "${TENANT}", public`)

    const { rows: achados } = await client.query(
      `SELECT produto_id, nome, unidade, preco_custo, preco_varejo, tipo, revenda, insumo_flg
       FROM t_produto
       WHERE active_flg = true AND LOWER(nome) LIKE $1
       ORDER BY nome`,
      [`%${busca.toLowerCase()}%`]
    )

    if (achados.length === 0) { console.log(`Nenhum produto ativo com "${busca}".`); return }
    if (achados.length > 1) {
      console.log('Vários produtos batem. Seja mais específico:')
      console.table(achados.map(p => ({ id: p.produto_id, nome: p.nome })))
      return
    }

    const prod = achados[0]
    console.log(`\n═══ ${prod.nome}  (produto_id ${prod.produto_id}, unidade ${prod.unidade})`)
    console.log(`    preco_custo do cadastro: ${brl(prod.preco_custo)}   varejo: ${brl(prod.preco_varejo)}`)
    console.log(`    tipo="${prod.tipo ?? ''}"  revenda=${prod.revenda}  insumo_flg=${prod.insumo_flg}\n`)

    // ── Ficha direta ────────────────────────────────────────────────────────
    const { rows: ficha } = await client.query(`
      SELECT pi.produto_insumo_id, pi.insumo_id, pi.quantidade, pi.unidade,
             COALESCE(i.nome, p.nome)        AS nome,
             COALESCE(i.unidade, p.unidade)  AS unidade_origem,
             i.preco_custo                   AS custo_insumo,
             p.preco_custo                   AS custo_produto,
             i.active_flg                    AS insumo_ativo,
             (pi.insumo_id < 0)              AS eh_produto,
             (
               SELECT ROUND(SUM(pi2.quantidade * COALESCE(i3.preco_custo, p3.preco_custo, 0)))::integer
               FROM t_produto_insumo pi2
               LEFT JOIN t_insumo  i3 ON i3.insumo_id = pi2.insumo_id     AND pi2.insumo_id > 0 AND i3.active_flg = true
               LEFT JOIN t_produto p3 ON (-pi2.insumo_id) = p3.produto_id AND pi2.insumo_id < 0 AND p3.active_flg = true
               WHERE pi2.produto_id = p.produto_id AND pi2.active_flg = true
             )                               AS custo_ficha_do_filho
      FROM t_produto_insumo pi
      LEFT JOIN t_insumo  i ON pi.insumo_id = i.insumo_id     AND pi.insumo_id > 0
      LEFT JOIN t_produto p ON (-pi.insumo_id) = p.produto_id AND pi.insumo_id < 0
      WHERE pi.produto_id = $1 AND pi.active_flg = true
      ORDER BY nome
    `, [prod.produto_id])

    if (ficha.length === 0) { console.log('Produto sem ficha técnica.'); return }

    console.log('── Componentes da ficha\n')
    const linhas = []
    let somaA = 0, somaB = 0

    for (const f of ficha) {
      const qtd = parseFloat(String(f.quantidade))

      // (A) tela: usa o preço que a lista de insumos entrega
      const custoA = f.eh_produto
        ? Number(f.custo_ficha_do_filho ?? f.custo_produto ?? 0)
        : Number(f.custo_insumo ?? 0)

      // (B) serviço: COALESCE(insumo, ficha do filho, custo manual do filho)
      const custoB = Number(f.custo_insumo ?? f.custo_ficha_do_filho ?? f.custo_produto ?? 0)

      const valorA = qtd * custoA
      const valorB = qtd * custoB
      somaA += valorA
      somaB += valorB

      linhas.push({
        componente:  f.nome ?? `#${f.insumo_id}`,
        tipo:        f.eh_produto ? 'produto-insumo' : 'insumo',
        qtd,
        un_ficha:    f.unidade,
        un_origem:   f.unidade_origem,
        converte:    String(f.unidade).toLowerCase() !== String(f.unidade_origem ?? '').toLowerCase() ? 'SIM ⚠' : '',
        custo_unit:  brl(custoB),
        valor:       brl(valorB),
        inativo:     f.insumo_ativo === false ? 'INATIVO ⚠' : '',
        sem_preco:   custoB === 0 ? 'SEM PREÇO ⚠' : '',
      })
    }
    console.table(linhas)

    // ── (C) explosão recursiva com conversão ────────────────────────────────
    const { rows: todas } = await client.query(`
      SELECT pi.produto_id, pi.insumo_id, pi.quantidade, pi.unidade,
             i.nome AS insumo_nome, i.unidade AS insumo_unidade, i.preco_custo AS insumo_custo,
             p.nome AS produto_nome, p.unidade AS produto_unidade
      FROM t_produto_insumo pi
      LEFT JOIN t_insumo  i ON i.insumo_id = pi.insumo_id     AND pi.insumo_id > 0 AND i.active_flg = true
      LEFT JOIN t_produto p ON (-pi.insumo_id) = p.produto_id AND pi.insumo_id < 0 AND p.active_flg = true
      WHERE pi.active_flg = true
    `)

    const porProduto = {}
    for (const r of todas) {
      const pid = Number(r.produto_id)
      ;(porProduto[pid] ??= []).push(r)
    }

    let somaC = 0
    const puros = {}
    const emUso = new Set([prod.produto_id])
    ;(function percorrer(pid, mult, nivel) {
      if (nivel > 10) return
      for (const r of porProduto[pid] ?? []) {
        const q = parseFloat(String(r.quantidade)) * mult
        if (!isFinite(q) || q <= 0) continue
        if (Number(r.insumo_id) > 0) {
          if (!r.insumo_nome) continue
          const qc = converter(q, r.unidade, r.insumo_unidade)
          const v  = qc * Number(r.insumo_custo ?? 0)
          somaC += v
          const k = r.insumo_nome
          puros[k] = (puros[k] ?? 0) + v
        } else {
          if (!r.produto_nome) continue
          const filho = -Number(r.insumo_id)
          if (emUso.has(filho)) continue
          emUso.add(filho)
          percorrer(filho, converter(q, r.unidade, r.produto_unidade), nivel + 1)
          emUso.delete(filho)
        }
      }
    })(prod.produto_id, 1, 0)

    // ── Comparação ──────────────────────────────────────────────────────────
    console.log('\n── Custo por caminho de cálculo\n')
    console.table([
      { caminho: 'A — tela da ficha (JS, sem conversão)',        custo: brl(somaA) },
      { caminho: 'B — FichaTecnicaService (SQL, 1 nível)',       custo: brl(somaB) },
      { caminho: 'C — ComposicaoService (recursivo, converte)',  custo: brl(somaC) },
    ])

    const dif = Math.abs(somaA - somaB)
    if (dif > 1) {
      console.log(`\n⚠ A e B divergem em ${brl(dif)}.`)
      console.log('  É essa divergência que aparece quando o produto entra na ficha de outro.')
    }
    if (Math.abs(somaB - somaC) > 1) {
      console.log(`\n⚠ B e C divergem em ${brl(Math.abs(somaB - somaC))}.`)
      console.log('  Causa provável: conversão de unidade (veja a coluna "converte") ou')
      console.log('  produto-insumo aninhado que B avalia pelo preco_custo manual.')
    }

    // ── Onde este produto é usado ───────────────────────────────────────────
    const { rows: paisRows } = await client.query(`
      SELECT p.produto_id, p.nome, pi.quantidade, pi.unidade
      FROM t_produto_insumo pi
      JOIN t_produto p ON p.produto_id = pi.produto_id
      WHERE pi.insumo_id = $1 AND pi.active_flg = true AND p.active_flg = true
      ORDER BY p.nome
    `, [-prod.produto_id])

    if (paisRows.length > 0) {
      console.log('\n── Usado como insumo em\n')
      console.table(paisRows.map(r => ({
        produto:  r.nome,
        qtd:      parseFloat(String(r.quantidade)),
        unidade:  r.unidade,
        'valor pelo caminho B': brl(parseFloat(String(r.quantidade)) * somaB),
        'valor pelo caminho C': brl(parseFloat(String(r.quantidade)) * somaC),
      })))
    }

    console.log('')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })