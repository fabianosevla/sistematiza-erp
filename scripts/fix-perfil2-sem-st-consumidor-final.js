/**
 * Fix: venda a consumidor final não tem ICMS-ST.
 *
 * Confirmado com nota real (NFC-e 000011654, 28/07/2026, Canelloni + 2 Molho
 * ao Sugo, consumidor não identificado, mesmo estado MG): Base de Cálculo
 * ICMS ST e Valor ICMS Substituição saíram R$ 0,00 na consulta da SEFAZ-MG.
 * Bate com a regra do Convênio ICMS 142/2018: a substituição tributária não
 * se aplica a operação que destina mercadoria diretamente a consumidor
 * final — não existe revenda futura pra antecipar.
 *
 * O perfil "Massa com ST - venda a consumidor final" tinha sido configurado
 * com tem_st = true nesta mesma sessão (cópia dos valores do perfil de venda
 * a contribuinte, sem nota real pra conferir esse cenário específico). Este
 * script desliga o ST desse perfil. O CFOP recalcula sozinho pra 5101
 * (produção própria sem ST) na hora da venda — não precisa mexer nas
 * colunas de CFOP aqui. O CSOSN sem ST já estava cadastrado
 * (csosn_sem_st) e passa a ser o usado.
 *
 * Não mexe no perfil de venda a contribuinte (mantém ST) nem no de revenda
 * de bebida (ST paga antes pelo fornecedor, outro mecanismo).
 *
 * Idempotente — rodar de novo não faz mal.
 *
 * Rodar: node scripts/fix-perfil2-sem-st-consumidor-final.js
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

async function main() {
  const client = await pool.connect()
  try {
    await client.query(`SET search_path TO tenant_zaghi_massas_caseiras, public`)

    const before = await client.query(`
      SELECT perfil_trib_id, nome, origem_mercadoria, tem_st, mva, aliq_icms_st,
             csosn, csosn_sem_st, cst_icms, cst_sem_st, cfop_interno, cfop_interestadual
      FROM t_perfil_tributario WHERE active_flg = true ORDER BY perfil_trib_id
    `)
    console.log('--- ANTES ---')
    console.table(before.rows)

    const alvo = before.rows.find(r => /consumidor final/i.test(r.nome))
    if (!alvo) { console.log('Não achei perfil de consumidor final pelo nome. Nada foi alterado.'); return }

    if (!alvo.csosn_sem_st) {
      console.log(`ATENÇÃO: perfil_trib_id=${alvo.perfil_trib_id} não tem csosn_sem_st cadastrado — não dá pra trocar sem ele. Nada foi alterado.`)
      return
    }

    console.log(`\nAplicando tem_st = false em perfil_trib_id=${alvo.perfil_trib_id} (${alvo.nome})`)
    await client.query(`UPDATE t_perfil_tributario SET tem_st = false WHERE perfil_trib_id = $1`, [alvo.perfil_trib_id])

    const depois = await client.query(`
      SELECT perfil_trib_id, nome, origem_mercadoria, tem_st, mva, aliq_icms_st,
             csosn, csosn_sem_st, cst_icms, cst_sem_st, cfop_interno, cfop_interestadual
      FROM t_perfil_tributario WHERE active_flg = true ORDER BY perfil_trib_id
    `)
    console.log('\n--- DEPOIS ---')
    console.table(depois.rows)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
