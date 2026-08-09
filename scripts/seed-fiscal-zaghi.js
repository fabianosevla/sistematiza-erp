// scripts/seed-fiscal-zaghi.js
//
// CARREGA A CONFIGURACAO FISCAL DA ZAGHI A PARTIR DOS DADOS REAIS.
//
// Fontes:
//   - NF-e 3.313 serie 001, emitida pelo Everest em 07/08/2026 (DANFE em PDF)
//   - 22 telas de cadastro de produto do Everest
//
// ─── O QUE ESTE SCRIPT GRAVA ────────────────────────────────────────────────
//
// 1. Coluna imprimir_nota em t_venda. Emitir e imprimir sao decisoes
//    separadas: a nota pode ser emitida e ficar so no arquivo.
//
// 2. Tabela A — dados fiscais da empresa em t_configuracoes_tenant.
//
// 3. Tabela B — perfis tributarios e o NCM/CEST de cada produto, casando
//    pelo nome. O casamento e por palavra-chave, nao por igualdade: os nomes
//    no Sistematiza e no Everest nao sao identicos.
//
// ─── VALORES ERRADOS ENTRAM COMO ESTAO ──────────────────────────────────────
//
// Tres coisas no Everest estao provavelmente erradas, e mesmo assim sao
// gravadas iguais, por decisao do Fabiano — a conferencia e com o contador, e
// comparar dois sistemas so vale se os dois mostrarem a mesma coisa:
//
//   a) Molho Branco com NCM 2403.99.10, que e posicao de FUMO. O Molho ao
//      Sugo, que e o mesmo tipo de produto, esta com 2103.90.21.
//   b) Sorrentino File Mignon com CEST 00.000.00, enquanto os outros
//      recheados tem 17.048.02. Produto com ST e CEST zerado e recusa certa.
//   c) CST de PIS/COFINS alternando entre 06 e 99 em produtos identicos.
//
// O script imprime esses itens em destaque no fim, para levar impresso.
//
//   node scripts/seed-fiscal-zaghi.js            (simula)
//   node scripts/seed-fiscal-zaghi.js --aplicar  (grava)
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const APLICAR = process.argv.includes('--aplicar')
const SCHEMA  = process.env.TENANT_SCHEMA || 'tenant_zaghi_massas_caseiras'

// ─── TABELA A — a empresa ───────────────────────────────────────────────────
//
// Tudo lido da NF-e 3.313. A serie NAO e a 001 de proposito: ver o aviso no
// fim do script.
const EMPRESA = {
  nome_empresa:       'EDUARDO ZAGHI',
  cnpj:               '11.327.412/0001-57',
  inscricao_estadual: '0014974570013',
  endereco:           'Rua Cassia, 188, apto 103',
  bairro:             'Sao Benedito',
  cidade:             'Passos',
  uf:                 'MG',
  cep:                '37900-198',
  telefone:           '(35) 3521-4159',
  email:              'mariajulia.zaghi@hotmail.com',
  // 1 = Simples Nacional. A NF-e traz "EMPRESA ME OU EPP OPTANTE PELO SIMPLES".
  crt:                '1',
  // Texto obrigatorio no rodape, copiado da nota do Everest. A parte do
  // credito de 1,25% e exigencia da Portaria SUTRI 837/2019 de MG, e o valor
  // impresso batia: 1.317,00 x 1,25% = 16,46.
  mensagem_fiscal:
    'EMPRESA ME OU EPP OPTANTE PELO SIMPLES NACIONAL, NAO GERA DIREITO A CREDITO DE ICMS, ISS OU IPI. ' +
    'PERMITE APROVEITAMENTO DE ICMS DE (1,25%): PORTARIA SUTRI 837 DE 14/05/2019, PUBLICADA EM 15/05/2019.',
}

// ─── TABELA A — perfis tributarios ──────────────────────────────────────────
//
// A NF-e 3.313 usa CFOP 5401 e CSOSN 201 em todos os itens. A ST esta
// calculada e da para deduzir os dois parametros:
//
//   base ST 1.777,95 / produtos 1.317,00 = 1,35  ->  MVA 35%
//   (1.777,95 x 18%) - (1.317,00 x 18%)  = 82,97 ~ 82,98 do DANFE
//
// Logo: aliquota interna de MG 18%, MVA 35%.
//
// CFOP 5401 e "venda de producao do estabelecimento, com ST, na condicao de
// contribuinte substituto" — vale para venda a CONTRIBUINTE, que e o caso do
// Villa Serra. Venda no balcao a consumidor final usa outro CFOP, e essa e
// pergunta para o contador. Fica um perfil separado, marcado, para nao passar
// despercebido.
const PERFIS = [
  {
    nome: 'Massa com ST - venda a contribuinte',
    descricao: 'Perfil da NF-e 3.313. CFOP 5401, CSOSN 201, MVA 35%, ICMS interno MG 18%.',
    cfop_interno: '5401', cfop_interestadual: '6401',
    csosn: '201',
    tem_st: true, mva: 35, aliq_icms_st: 18,
    cst_pis: '06', aliq_pis: 0, cst_cofins: '06', aliq_cofins: 0,
    cst_ipi: '99', aliq_ipi: 0,
    info_adicional: null,
  },
  {
    nome: 'Massa com ST - venda a consumidor final (CONFERIR CFOP)',
    descricao: 'Balcao/NFC-e. O CFOP 5405 e o usual para ST ja recolhida, mas PRECISA de confirmacao do contador.',
    cfop_interno: '5405', cfop_interestadual: '6404',
    csosn: '500',
    tem_st: false, mva: 0, aliq_icms_st: 0,
    cst_pis: '06', aliq_pis: 0, cst_cofins: '06', aliq_cofins: 0,
    cst_ipi: '99', aliq_ipi: 0,
    info_adicional: null,
  },
]

// ─── TABELA B — NCM e CEST por familia de produto ───────────────────────────
//
// Lido das telas do Everest. `chaves` sao os termos que casam com o nome do
// produto no Sistematiza, em minusculo e sem acento. A ordem importa: a
// primeira regra que casar vence, entao o que e mais especifico vem antes.
const REGRAS = [
  // Molhos primeiro: "molho" nao pode cair na regra de massa recheada.
  { chaves: ['molho branco'],                    ncm: '24039910', cest: '17.035.00', suspeito: 'NCM 2403.99.10 e posicao de FUMO. Provavel erro do Everest.' },
  { chaves: ['molho'],                           ncm: '21039021', cest: '17.034.00' },

  { chaves: ['nhoque', 'gnocchi'],               ncm: '19023000', cest: '17.047.00' },

  // Massa seca / nao cozida
  { chaves: ['spaguetti', 'espaguete', 'talharim', 'lasanha', 'macarrao'],
                                                 ncm: '19021100', cest: '17.049.06' },

  // Massa recheada / cozida
  { chaves: ['sorrentino'],                      ncm: '19022000', cest: '00.000.00', suspeito: 'CEST zerado no Everest, enquanto os outros recheados tem 17.048.02.' },
  { chaves: ['rondelli', 'canelloni', 'canneloni', 'conchiglioni', 'sofioli', 'sofiolli', 'ravioli', 'capeletti', 'agnoline'],
                                                 ncm: '19022000', cest: '17.048.02' },
]

const semAcento = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function regraDoProduto(nome) {
  const n = semAcento(nome)
  return REGRAS.find(r => r.chaves.some(k => n.includes(k))) || null
}

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

async function colunasDe(c, tabela) {
  const { rows } = await c.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
  `, [SCHEMA, tabela])
  return new Set(rows.map(r => r.column_name))
}

async function main() {
  const pool = new Pool(conexao())
  const c    = await pool.connect()
  const suspeitos = []
  try {
    await c.query(`SET search_path TO "${SCHEMA}", public`)
    console.log(APLICAR ? `\n>>> MODO GRAVACAO — ${SCHEMA}\n` : `\n>>> SIMULACAO em ${SCHEMA}. Nada sera gravado. Use --aplicar.\n`)

    // ── 0. Colunas de intencao fiscal ────────────────────────────────────
    //
    // t_pedido tambem recebe as duas: a NF-e do pedido nasce na ENTREGA, nao
    // na baixa do pagamento. A mercadoria nao pode viajar sem documento, e a
    // propria NF-e 3.313 mostra isso — emitida em 07/08 com duplicata para
    // 28/08.
    const NOVAS = {
      t_venda:  [['imprimir_nota', 'BOOLEAN NOT NULL DEFAULT FALSE']],
      t_pedido: [
        ['documento_fiscal', "VARCHAR(10) NOT NULL DEFAULT 'nenhum'"],
        ['imprimir_nota',    'BOOLEAN NOT NULL DEFAULT FALSE'],
        // Preenchido na entrega, para nao emitir duas vezes se alguem repetir
        // a acao. Mesma trava que venda_id faz para o faturamento.
        ['nota_id',          'INTEGER'],
      ],
    }
    for (const [tabela, colunas] of Object.entries(NOVAS)) {
      const atuais = await colunasDe(c, tabela)
      const faltando = colunas.filter(([n]) => !atuais.has(n))
      if (faltando.length === 0) { console.log(`${tabela}: colunas fiscais ja existem.`); continue }
      if (!APLICAR) { console.log(`${tabela}: criaria ${faltando.map(([n]) => n).join(', ')}`); continue }
      for (const [nome, tipo] of faltando) {
        await c.query(`ALTER TABLE "${tabela}" ADD COLUMN ${nome} ${tipo}`)
      }
      console.log(`${tabela}: ${faltando.length} coluna(s) criada(s).`)
    }

    // ── 1. Tabela A — empresa ────────────────────────────────────────────
    console.log('\n── TABELA A — dados da empresa ──')
    const colsCfg = await colunasDe(c, 't_configuracoes_tenant')
    const campos  = Object.entries(EMPRESA).filter(([k]) => colsCfg.has(k))
    const faltam  = Object.keys(EMPRESA).filter(k => !colsCfg.has(k))

    for (const [k, v] of campos) console.log(`  ${k.padEnd(20)} ${v}`)
    if (faltam.length) console.log(`  (colunas inexistentes, ignoradas: ${faltam.join(', ')})`)

    if (APLICAR && campos.length) {
      const { rows: existe } = await c.query(`SELECT 1 FROM t_configuracoes_tenant LIMIT 1`)
      const sets = campos.map(([k], i) => `${k} = $${i + 1}`).join(', ')
      const vals = campos.map(([, v]) => v)
      if (existe.length) {
        await c.query(`UPDATE t_configuracoes_tenant SET ${sets}, updated_dt = NOW()`, vals)
        console.log('  -> atualizado.')
      } else {
        const nomes = campos.map(([k]) => k).join(', ')
        const ph    = campos.map((_, i) => `$${i + 1}`).join(', ')
        await c.query(`INSERT INTO t_configuracoes_tenant (${nomes}) VALUES (${ph})`, vals)
        console.log('  -> criado.')
      }
    }

    // ── 2. Perfis tributarios ────────────────────────────────────────────
    console.log('\n── TABELA A — perfis tributarios ──')
    const temPerfil = await c.query(`SELECT to_regclass('t_perfil_tributario') IS NOT NULL AS e`)
    if (!temPerfil.rows[0].e) {
      console.log('  t_perfil_tributario nao existe. Rode antes: node scripts/migrate-fiscal-parametrizacao.js --aplicar')
    } else {
      for (const p of PERFIS) {
        const { rows } = await c.query(
          `SELECT perfil_trib_id FROM t_perfil_tributario WHERE nome = $1 AND active_flg = true LIMIT 1`, [p.nome])
        if (rows.length) { console.log(`  "${p.nome}": ja existe (id ${rows[0].perfil_trib_id}).`); p._id = rows[0].perfil_trib_id; continue }
        if (!APLICAR) { console.log(`  "${p.nome}": seria criado.`); continue }
        const r = await c.query(`
          INSERT INTO t_perfil_tributario
            (nome, descricao, cfop_interno, cfop_interestadual, csosn,
             tem_st, mva, aliq_icms_st, cst_pis, aliq_pis, cst_cofins, aliq_cofins,
             cst_ipi, aliq_ipi, info_adicional)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          RETURNING perfil_trib_id
        `, [p.nome, p.descricao, p.cfop_interno, p.cfop_interestadual, p.csosn,
            p.tem_st, p.mva, p.aliq_icms_st, p.cst_pis, p.aliq_pis, p.cst_cofins,
            p.aliq_cofins, p.cst_ipi, p.aliq_ipi, p.info_adicional])
        p._id = r.rows[0].perfil_trib_id
        console.log(`  "${p.nome}": criado (id ${p._id}).`)
      }
    }

    // ── 3. Tabela B — NCM e CEST nos produtos ────────────────────────────
    console.log('\n── TABELA B — NCM e CEST por produto ──')
    const colsProd = await colunasDe(c, 't_produto')
    if (!colsProd.has('ncm')) {
      console.log('  t_produto.ncm nao existe. Rode antes: node scripts/migrate-fiscal-parametrizacao.js --aplicar')
    } else {
      const { rows: produtos } = await c.query(
        `SELECT produto_id, nome, ncm, cest FROM t_produto WHERE active_flg = true ORDER BY nome`)

      const semRegra = []
      let tocados = 0
      for (const p of produtos) {
        const r = regraDoProduto(p.nome)
        if (!r) { semRegra.push(p.nome); continue }
        const mudou = p.ncm !== r.ncm || p.cest !== r.cest
        console.log(`  ${mudou ? '*' : ' '} ${String(p.nome).slice(0, 42).padEnd(44)} ${r.ncm}  ${r.cest}`)
        if (r.suspeito) suspeitos.push(`${p.nome}: ${r.suspeito}`)
        if (!APLICAR || !mudou) continue
        await c.query(
          `UPDATE t_produto SET ncm = $1, cest = $2, origem = COALESCE(origem, '0'), updated_dt = NOW()
            WHERE produto_id = $3`, [r.ncm, r.cest, p.produto_id])
        tocados++
      }

      console.log(`\n  ${produtos.length} produtos ativos · ${tocados} atualizados · ${semRegra.length} sem regra`)
      if (semRegra.length) {
        console.log('\n  SEM NCM — nenhuma palavra-chave casou. Estes nao emitem nota:')
        for (const n of semRegra) console.log(`    - ${n}`)
      }
    }

    // ── 4. O que levar ao contador ───────────────────────────────────────
    if (suspeitos.length) {
      console.log('\n' + '='.repeat(70))
      console.log('LEVAR AO CONTADOR — gravado como esta no Everest, mas suspeito:')
      console.log('='.repeat(70))
      for (const s of [...new Set(suspeitos)]) console.log(`  ! ${s}`)
    }

    console.log('\n' + '='.repeat(70))
    console.log('NUMERACAO DA NOTA — leia antes de emitir')
    console.log('='.repeat(70))
    console.log(`
  A numeracao NAO precisa ser adivinhada. Ela e controlada pela Focus NFe:
  o sistema nao envia o numero, e a Focus devolve o numero usado.

  O que precisa ser decidido e a SERIE, e a recomendacao e usar uma serie
  NOVA — a 2, por exemplo — deixando a 001 para o Everest. A numeracao e
  independente por (CNPJ, modelo, serie), entao a serie 2 comeca do 1 sem
  colidir com a 3.313 do Everest, e os dois sistemas podem conviver enquanto
  durar a transicao.

  Usar a mesma serie 001 obrigaria a descobrir e manter o ultimo numero em
  dois sistemas ao mesmo tempo — e qualquer erro ai vira rejeicao 539
  (duplicidade) ou, pior, quebra de sequencia para o fisco.

  A serie fica em t_configuracoes_tenant.serie_nfe / serie_nfce, e tambem no
  cadastro da empresa no painel da Focus.
`)
    console.log(APLICAR ? 'OK.' : 'Nada gravado. Rode com --aplicar.')
  } finally {
    c.release()
    await pool.end()
  }
}
main().catch(e => { console.error('\nERRO:', e.message); process.exit(1) })
