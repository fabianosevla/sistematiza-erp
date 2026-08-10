// scripts/conferir-payload-fiscal.js
//
// MOSTRA O QUE IRIA PARA A SEFAZ, SEM TRANSMITIR NADA.
//
// Serve para conferir a nota com o contador ANTES da primeira emissao. A
// alternativa e descobrir divergencia por codigo de rejeicao, que nao diz
// qual campo esta errado — diz que a nota nao presta.
//
// O script NAO chama a Focus, NAO altera o banco e NAO emite. So le.
//
// ─── DE ONDE VEM CADA COISA ─────────────────────────────────────────────────
//
// Quase tudo ja esta congelado em t_nota_fiscal e t_nota_fiscal_item: o
// FiscalService resolve NCM, CFOP, CSOSN, ST, PIS e COFINS no momento em que
// cria a nota, nao na emissao. Entao aqui e sobretudo formatacao — o que
// reduz a chance deste script e o sistema discordarem.
//
// O que ainda e regra, e precisa acompanhar o FiscalService se ele mudar:
// natureza da operacao, consumidor_final, presenca_comprador, local_destino
// e a razao social de homologacao.
//
//   node scripts/conferir-payload-fiscal.js              (ultima nota pendente)
//   node scripts/conferir-payload-fiscal.js --nota 12
//   node scripts/conferir-payload-fiscal.js --listar
//   node scripts/conferir-payload-fiscal.js --nota 12 --producao
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const SCHEMA   = process.env.TENANT_SCHEMA || 'tenant_zaghi_massas_caseiras'
const LISTAR   = process.argv.includes('--listar')
const PRODUCAO = process.argv.includes('--producao')
const idArg    = process.argv.indexOf('--nota')
const NOTA_ID  = idArg > -1 ? Number(process.argv[idArg + 1]) : null

const RAZAO_HOMOLOGACAO = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'

// Referencia: a NF-e 3.313 do Everest, autorizada em 07/08/2026. E contra ela
// que o contador vai comparar.
const REFERENCIA = {
  'CFOP (venda a contribuinte)': '5401',
  'CSOSN':                       '201',
  'MVA':                         '35',
  'Aliquota interna MG':         '18',
  'Origem':                      '0',
  'NCM massa recheada':          '19022000',
  'CEST massa recheada':         '17.048.02',
}

const reais   = (c) => (Number(c ?? 0) / 100).toFixed(2)
const digitos = (v) => String(v ?? '').replace(/\D/g, '')

function conexao() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL }
  const host = process.env.DB_HOST
  if (!host) throw new Error('Defina DATABASE_URL ou DB_HOST/... no .env.local')
  const local = /^(localhost|127\.0\.0\.1)$/.test(host)
  return {
    host, port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: local ? false : { rejectUnauthorized: false },
  }
}

function tPag(nome) {
  const n = String(nome ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/dinheiro|especie/.test(n))    return '01'
  if (/cheque/.test(n))              return '02'
  if (/debito/.test(n))              return '04'
  if (/credito|cartao/.test(n))      return '03'
  if (/vale.*aliment/.test(n))       return '10'
  if (/vale.*refei/.test(n))         return '11'
  if (/boleto/.test(n))              return '15'
  if (/deposito/.test(n))            return '16'
  if (/pix/.test(n))                 return '17'
  if (/transfer/.test(n))            return '18'
  if (/fidelidade|cashback/.test(n)) return '19'
  return '99'
}

function grupoSt(i) {
  const base = Number(i.base_st ?? 0)
  if (base <= 0) return {}
  return {
    icms_modalidade_base_calculo_st: '4',
    icms_margem_valor_adicionado_st: String(Number(i.mva ?? 0)),
    icms_base_calculo_st:            reais(base),
    icms_aliquota_st:                String(Number(i.aliq_st ?? 0)),
    icms_valor_st:                   reais(i.valor_st),
  }
}

async function main() {
  const pool = new Pool(conexao())
  const c    = await pool.connect()
  try {
    await c.query(`SET search_path TO "${SCHEMA}", public`)

    if (LISTAR) {
      const { rows } = await c.query(`
        SELECT nota_id, tipo, status, razao_social, valor_total, data_emissao
          FROM t_nota_fiscal WHERE active_flg = true
         ORDER BY nota_id DESC LIMIT 20
      `)
      console.log(`\nUltimas notas em ${SCHEMA}:\n`)
      if (rows.length === 0) console.log('  nenhuma nota criada ainda.')
      for (const r of rows) {
        console.log(`  #${String(r.nota_id).padStart(4)}  ${String(r.tipo).padEnd(6)} ` +
          `${String(r.status).padEnd(11)} ${reais(r.valor_total).padStart(10)}  ${r.razao_social ?? '—'}`)
      }
      console.log('\nUse: node scripts/conferir-payload-fiscal.js --nota <id>\n')
      return
    }

    // ── A nota ────────────────────────────────────────────────────────────
    const notaRes = NOTA_ID
      ? await c.query(`SELECT * FROM t_nota_fiscal WHERE nota_id = $1`, [NOTA_ID])
      : await c.query(`SELECT * FROM t_nota_fiscal WHERE active_flg = true AND status = 'pendente'
                        ORDER BY nota_id DESC LIMIT 1`)
    const nota = notaRes.rows[0]
    if (!nota) {
      console.log('\nNenhuma nota encontrada. Crie uma venda ou entregue um pedido com nota,')
      console.log('ou rode com --listar para ver as existentes.\n')
      return
    }

    const { rows: itens } = await c.query(
      `SELECT * FROM t_nota_fiscal_item WHERE nota_id = $1 ORDER BY item_id`, [nota.nota_id])

    const { rows: cfgs } = await c.query(`SELECT * FROM t_configuracoes_tenant LIMIT 1`)
    const cfg = cfgs[0] ?? {}

    let pagamentos = []
    if (nota.venda_id) {
      const r = await c.query(
        `SELECT forma, valor FROM t_venda_pagamento WHERE venda_id = $1 AND active_flg = true`,
        [nota.venda_id]).catch(() => ({ rows: [] }))
      pagamentos = r.rows
    }

    // ── As regras que ainda vivem na emissao ──────────────────────────────
    const ehNfce           = String(nota.tipo).toUpperCase() === 'NFC-E'
    const ehParaContrib    = !ehNfce && !!nota.cnpj_cpf
    const homologacao      = !PRODUCAO
    const doc              = digitos(nota.cnpj_cpf)
    const ufEmpresa        = String(cfg.uf ?? '').toUpperCase()
    const mesmoEstado      = !nota.uf || String(nota.uf).toUpperCase() === ufEmpresa

    let destinatario = {}
    if (doc) {
      destinatario = {
        nome_destinatario: homologacao ? RAZAO_HOMOLOGACAO : nota.razao_social,
        ...(doc.length > 11 ? { cnpj_destinatario: doc } : { cpf_destinatario: doc }),
      }
      if (!ehNfce) {
        Object.assign(destinatario, {
          indicador_inscricao_estadual_destinatario: Number(nota.indicador_ie ?? 9),
          ...(nota.ie ? { inscricao_estadual_destinatario: digitos(nota.ie) } : {}),
          logradouro_destinatario: nota.logradouro ?? '',
          numero_destinatario:     nota.numero_dest || 'S/N',
          ...(nota.complemento ? { complemento_destinatario: nota.complemento } : {}),
          bairro_destinatario:     nota.bairro ?? '',
          municipio_destinatario:  nota.municipio ?? '',
          uf_destinatario:         nota.uf ?? '',
          cep_destinatario:        digitos(nota.cep),
        })
      }
    }

    const payload = {
      natureza_operacao:  ehParaContrib ? 'Venda de producao do estabelecimento' : 'VENDA A CONSUMIDOR',
      data_emissao:       new Date().toISOString(),
      tipo_documento:     '1',
      finalidade_emissao: '1',
      consumidor_final:   ehParaContrib ? '0' : '1',
      presenca_comprador: ehNfce ? '1' : '4',
      local_destino:      mesmoEstado ? '1' : '2',
      modalidade_frete:   '9',
      ...(cfg.mensagem_fiscal ? { informacoes_adicionais_contribuinte: String(cfg.mensagem_fiscal) } : {}),
      ...destinatario,
      items: itens.map((i, n) => ({
        numero_item:               String(n + 1),
        descricao:                 i.descricao,
        codigo_ncm:                i.ncm,
        ...(i.cest ? { cest: digitos(i.cest) } : {}),
        cfop:                      i.cfop,
        unidade_comercial:         i.unidade || 'UN',
        quantidade_comercial:      String(parseFloat(i.quantidade)),
        valor_unitario_comercial:  reais(i.preco_unitario),
        valor_unitario_tributavel: reais(i.preco_unitario),
        quantidade_tributavel:     String(parseFloat(i.quantidade)),
        valor_bruto:               reais(i.valor_total),
        inclui_no_total:           '1',
        icms_situacao_tributaria:  i.cst_csosn,
        icms_origem:               i.origem ?? '0',
        ...(Number(i.aliq_icms) > 0 ? { icms_aliquota: String(Number(i.aliq_icms)) } : {}),
        ...grupoSt(i),
        pis_situacao_tributaria:    i.cst_pis ?? '07',
        ...(Number(i.aliq_pis) > 0 ? { pis_aliquota_porcentual: String(Number(i.aliq_pis)) } : {}),
        cofins_situacao_tributaria: i.cst_cofins ?? '07',
        ...(Number(i.aliq_cofins) > 0 ? { cofins_aliquota_porcentual: String(Number(i.aliq_cofins)) } : {}),
      })),
      formas_pagamento: pagamentos.length > 0
        ? pagamentos.map(p => ({ forma_pagamento: tPag(p.forma), valor_pagamento: reais(p.valor) }))
        : [{ forma_pagamento: '01', valor_pagamento: reais(nota.valor_total) }],
    }

    // ── Saida ─────────────────────────────────────────────────────────────
    const linha = '='.repeat(74)
    console.log(`\n${linha}`)
    console.log(`NOTA #${nota.nota_id} · ${nota.tipo} · ${nota.status} · ` +
                `ambiente ${homologacao ? 'HOMOLOGACAO' : 'PRODUCAO'}`)
    console.log(linha)
    console.log('\nNADA E TRANSMITIDO POR ESTE SCRIPT. E so a conferencia.\n')

    console.log(JSON.stringify(payload, null, 2))

    // ── Conferencia ───────────────────────────────────────────────────────
    console.log(`\n${linha}`)
    console.log('CONFERENCIA')
    console.log(linha)

    const problemas = []
    if (itens.length === 0) problemas.push('A nota nao tem itens.')
    itens.forEach((i, n) => {
      const falta = []
      if (!i.ncm)       falta.push('NCM')
      if (!i.cfop)      falta.push('CFOP')
      if (!i.cst_csosn) falta.push('CSOSN/CST')
      if (Number(i.base_st) > 0 && !i.cest) falta.push('CEST (obrigatorio quando ha ST)')
      if (falta.length) problemas.push(`Item ${n + 1} "${i.descricao}": falta ${falta.join(', ')}`)
    })
    if (!ehNfce) {
      const obrig = {
        'CNPJ/CPF':   doc,
        'logradouro': nota.logradouro,
        'bairro':     nota.bairro,
        'municipio':  nota.municipio,
        'UF':         nota.uf,
        'CEP':        nota.cep,
      }
      const vazios = Object.entries(obrig).filter(([, v]) => !String(v ?? '').trim()).map(([k]) => k)
      if (vazios.length) problemas.push(`Destinatario da NF-e sem: ${vazios.join(', ')}`)
      if (String(nota.indicador_ie ?? '9') === '1' && !nota.ie) {
        problemas.push('Destinatario marcado como contribuinte e sem inscricao estadual.')
      }
    }
    if (!String(cfg.crt ?? '').trim())      problemas.push('Empresa sem CRT (regime tributario).')
    if (!String(cfg.mensagem_fiscal ?? '')) problemas.push('Sem mensagem fiscal — obrigatoria no Simples.')
    if (ehNfce  && !cfg.credenciado_nfce)   problemas.push('Empresa nao marcada como credenciada para NFC-e.')
    if (!ehNfce && !cfg.credenciado_nfe)    problemas.push('Empresa nao marcada como credenciada para NF-e.')
    if (!String(cfg.focus_nfe_token ?? '')) problemas.push('Token do emissor nao configurado.')

    if (problemas.length === 0) {
      console.log('\n  Nenhum impedimento encontrado. Isto NAO garante que a SEFAZ aceite —')
      console.log('  garante que os campos que dependem de nos estao preenchidos.')
    } else {
      console.log('\n  IMPEDEM A EMISSAO:\n')
      for (const p of problemas) console.log(`    - ${p}`)
    }

    // Totais, para bater com a nota do Everest
    const somaItens = itens.reduce((a, i) => a + Number(i.valor_total ?? 0), 0)
    const somaSt    = itens.reduce((a, i) => a + Number(i.valor_st ?? 0), 0)
    const somaBase  = itens.reduce((a, i) => a + Number(i.base_st ?? 0), 0)
    console.log(`\n  Total dos produtos  ${reais(somaItens).padStart(12)}`)
    console.log(`  Base de ST          ${reais(somaBase).padStart(12)}`)
    console.log(`  ICMS ST             ${reais(somaSt).padStart(12)}`)
    console.log(`  Total da nota       ${reais(nota.valor_total).padStart(12)}`)

    console.log(`\n${linha}`)
    console.log('PARA O CONTADOR CONFERIR CONTRA A NF-e 3.313 DO EVEREST')
    console.log(linha)
    for (const [k, v] of Object.entries(REFERENCIA)) {
      console.log(`  ${k.padEnd(30)} ${v}`)
    }
    console.log('\n  Se algum item acima divergir do que aparece no JSON, e divergencia')
    console.log('  de parametrizacao — nao de emissao. Corrija no perfil ou no produto.\n')
  } finally {
    c.release()
    await pool.end()
  }
}
main().catch(e => { console.error('\nERRO:', e.message); process.exit(1) })
