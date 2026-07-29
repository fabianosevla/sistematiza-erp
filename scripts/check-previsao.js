// scripts/check-previsao.js
//
// Diagnóstico SOMENTE LEITURA da "Previsão de Insumos" da tela de Produção.
//
// A previsão só aparece se três coisas forem verdade ao mesmo tempo:
//   1. existe linha em t_producao_grade dentro da semana consultada;
//   2. os produtos dessas linhas têm ficha em t_produto_insumo;
//   3. os componentes da ficha resolvem em t_insumo ou t_produto ativos.
//
// Este script mostra as três etapas separadamente, então dá para ver em qual
// delas a lista morre.
//
//   node scripts/check-previsao.js                    → semana atual
//   node scripts/check-previsao.js 2026-07-27 2026-08-01
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const argv   = process.argv.slice(2)
const iTen   = argv.indexOf('--tenant')
const TENANT = iTen >= 0 ? argv[iTen + 1] : 'tenant_zaghi_massas_caseiras'
const datas  = argv.filter(a => /^\d{4}-\d{2}-\d{2}$/.test(a))

function semanaAtual() {
  const hoje = new Date()
  const dia  = hoje.getDay()
  const seg  = new Date(hoje)
  seg.setDate(hoje.getDate() - (dia === 0 ? 6 : dia - 1))
  const sab = new Date(seg)
  sab.setDate(seg.getDate() + 5)
  return [seg.toISOString().slice(0, 10), sab.toISOString().slice(0, 10)]
}

const [INICIO, FIM] = datas.length === 2 ? datas : semanaAtual()

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
  const pool   = new Pool(conexao())
  const client = await pool.connect()

  try {
    await client.query(`SET search_path TO "${TENANT}", public`)
    console.log(`\nschema: ${TENANT}`)
    console.log(`período: ${INICIO} a ${FIM}\n`)

    // ── Etapa 0: as tabelas existem? ────────────────────────────────────────
    const { rows: tabs } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name IN ('t_producao_grade','t_producao_semanal','t_produto_insumo')
    `, [TENANT])
    const nomes = tabs.map(t => t.table_name)
    console.log('── Tabelas')
    for (const t of ['t_producao_grade', 't_producao_semanal', 't_produto_insumo']) {
      console.log(`   ${nomes.includes(t) ? 'existe    ' : 'NÃO existe'} ${t}`)
    }
    if (!nomes.includes('t_producao_grade')) {
      console.log('\nt_producao_grade não existe — a grade grava em outro lugar. Pare aqui e me avise.\n')
      return
    }

    // ── Etapa 1: linhas na grade ────────────────────────────────────────────
    const { rows: grade } = await client.query(`
      SELECT g.produto_id, p.nome, g.data_producao::text AS data, g.quantidade, g.active_flg
      FROM t_producao_grade g
      LEFT JOIN t_produto p ON p.produto_id = g.produto_id
      WHERE g.data_producao >= $1::date AND g.data_producao <= $2::date
      ORDER BY p.nome, g.data_producao
    `, [INICIO, FIM])

    console.log(`\n── Etapa 1: linhas em t_producao_grade no período — ${grade.length}`)
    if (grade.length === 0) {
      console.log('\n   A grade está vazia nesse período.')
      console.log('   Se você digitou números na coluna PP, eles podem ter ido para outra')
      console.log('   semana (fuso) ou o POST /producao/grade não gravou. Rode:')
      console.log(`\n   SELECT data_producao::text, COUNT(*) FROM "${TENANT}".t_producao_grade GROUP BY 1 ORDER BY 1 DESC LIMIT 10;\n`)

      const { rows: qualquer } = await client.query(`
        SELECT data_producao::text AS data, COUNT(*)::int AS linhas, SUM(quantidade)::int AS soma
        FROM t_producao_grade
        GROUP BY data_producao ORDER BY data_producao DESC LIMIT 10
      `)
      if (qualquer.length > 0) {
        console.log('   Datas que existem na tabela:')
        console.table(qualquer)
      } else {
        console.log('   A tabela está completamente vazia.')
      }
      return
    }
    console.table(grade.map(g => ({
      produto: g.nome ?? `#${g.produto_id}`,
      data:    g.data,
      qtd:     Number(g.quantidade),
      ativo:   g.active_flg,
    })))

    const ativas = grade.filter(g => g.active_flg && Number(g.quantidade) > 0)
    if (ativas.length === 0) {
      console.log('\n   Todas as linhas estão inativas ou zeradas — a previsão ignora essas.\n')
      return
    }

    // ── Etapa 2: fichas dos produtos planejados ────────────────────────────
    const ids = [...new Set(ativas.map(g => Number(g.produto_id)))]
    const { rows: fichas } = await client.query(`
      SELECT pi.produto_id, COUNT(*)::int AS componentes
      FROM t_produto_insumo pi
      WHERE pi.produto_id = ANY($1::int[]) AND pi.active_flg = true
      GROUP BY pi.produto_id
    `, [ids])

    const mapaFicha = Object.fromEntries(fichas.map(f => [Number(f.produto_id), f.componentes]))
    console.log('\n── Etapa 2: ficha técnica dos produtos planejados')
    console.table(ids.map(id => ({
      produto:     ativas.find(g => Number(g.produto_id) === id)?.nome ?? `#${id}`,
      componentes: mapaFicha[id] ?? 0,
      situacao:    mapaFicha[id] ? 'ok' : 'SEM FICHA — não entra na previsão',
    })))

    // ── Etapa 3: a consulta exata do serviço ───────────────────────────────
    const { rows: resultado } = await client.query(`
      SELECT COALESCE(i.nome, p.nome) AS nome,
             pi.unidade,
             SUM(pi.quantidade * g.qtd) AS necessario,
             COALESCE(i.estoque_atual, p.estoque_atual) AS estoque
      FROM (
        SELECT produto_id, SUM(quantidade) AS qtd
        FROM t_producao_grade
        WHERE active_flg = true
          AND data_producao >= $1::date AND data_producao <= $2::date
        GROUP BY produto_id
        HAVING SUM(quantidade) > 0
      ) g
      JOIN t_produto_insumo pi ON pi.produto_id = g.produto_id AND pi.active_flg = true
      LEFT JOIN t_insumo  i ON pi.insumo_id = i.insumo_id     AND pi.insumo_id > 0 AND i.active_flg = true
      LEFT JOIN t_produto p ON (-pi.insumo_id) = p.produto_id AND pi.insumo_id < 0 AND p.active_flg = true
      WHERE (i.insumo_id IS NOT NULL OR p.produto_id IS NOT NULL)
      GROUP BY COALESCE(i.nome, p.nome), pi.unidade, COALESCE(i.estoque_atual, p.estoque_atual)
      ORDER BY 1
    `, [INICIO, FIM])

    console.log(`\n── Etapa 3: o que a previsão deveria mostrar — ${resultado.length} insumo(s)`)
    if (resultado.length === 0) {
      console.log('\n   A consulta do serviço devolve vazio mesmo com grade e ficha.')
      console.log('   Causa provável: componentes da ficha apontam para insumo/produto inativo')
      console.log('   ou inexistente. Rode check-custo-produto.js no produto planejado.\n')
      return
    }
    console.table(resultado.map(r => ({
      insumo:     r.nome,
      necessario: Number(r.necessario).toFixed(3),
      unidade:    r.unidade,
      estoque:    Number(r.estoque ?? 0),
      situacao:   Number(r.estoque ?? 0) >= Number(r.necessario) ? 'ok' : 'insuficiente',
    })))

    console.log('\n   Se esta lista tem conteúdo mas a tela mostra vazio, o problema está')
    console.log('   no front ou nos arquivos não salvos. Confira:')
    console.log('     lib/services/producao/ProducaoService.ts  → deve ler t_producao_grade')
    console.log('     app/api/[tenant]/producao/previsao/route.ts → deve aceitar ?inicio=&fim=')
    console.log('     components/modules/producao/ProducaoView.tsx → deve ler data.itens\n')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })