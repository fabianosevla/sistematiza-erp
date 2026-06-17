/**
 * Migration: Perfis de Acesso customizáveis
 * Rodar: node scripts/migrate-perfis-acesso.js
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

pool.connect().then(async client => {
  console.log(`\nMigrando perfis de acesso — schema: ${SCHEMA}\n`)
  await client.query(`SET search_path TO "${SCHEMA}", public`)

  // ── 1. Tabela de perfis ────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_perfil_acesso (
      perfil_id        SERIAL PRIMARY KEY,
      modification_num INTEGER NOT NULL DEFAULT 0,
      created_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by       INTEGER NOT NULL DEFAULT 1,
      updated_dt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by       INTEGER NOT NULL DEFAULT 1,
      active_flg       BOOLEAN NOT NULL DEFAULT TRUE,
      nome             VARCHAR(100) NOT NULL,
      descricao        VARCHAR(300),
      -- Ambientes disponíveis na tela de seleção
      acesso_gerencial BOOLEAN NOT NULL DEFAULT FALSE,
      acesso_pdv       BOOLEAN NOT NULL DEFAULT FALSE,
      acesso_comanda   BOOLEAN NOT NULL DEFAULT FALSE,
      acesso_delivery  BOOLEAN NOT NULL DEFAULT FALSE,
      -- Módulos visíveis dentro do Gerencial
      modulo_dashboard    BOOLEAN NOT NULL DEFAULT TRUE,
      modulo_cadastros    BOOLEAN NOT NULL DEFAULT TRUE,
      modulo_vendas       BOOLEAN NOT NULL DEFAULT TRUE,
      modulo_financeiro   BOOLEAN NOT NULL DEFAULT FALSE,
      modulo_estoque      BOOLEAN NOT NULL DEFAULT FALSE,
      modulo_producao     BOOLEAN NOT NULL DEFAULT FALSE,
      modulo_pedidos      BOOLEAN NOT NULL DEFAULT FALSE,
      modulo_comandas     BOOLEAN NOT NULL DEFAULT FALSE,
      modulo_consultas    BOOLEAN NOT NULL DEFAULT FALSE,
      modulo_fiscal       BOOLEAN NOT NULL DEFAULT FALSE,
      modulo_plano_acao   BOOLEAN NOT NULL DEFAULT FALSE,
      modulo_metas        BOOLEAN NOT NULL DEFAULT FALSE,
      modulo_usuarios     BOOLEAN NOT NULL DEFAULT FALSE,
      -- Limites operacionais
      perc_desconto_max   NUMERIC(5,2) NOT NULL DEFAULT 0,
      valor_desconto_max  INTEGER NOT NULL DEFAULT 0,
      -- Flag especial: acesso total (gerencial completo)
      is_admin            BOOLEAN NOT NULL DEFAULT FALSE
    )
  `)
  console.log('✓ t_perfil_acesso criada')

  // ── 2. Vincular perfil ao usuário ─────────────────────────────────────────
  await client.query(`
    ALTER TABLE t_usuario
    ADD COLUMN IF NOT EXISTS perfil_id INTEGER
  `)
  console.log('✓ perfil_id adicionado em t_usuario')

  // ── 3. Perfis padrão ──────────────────────────────────────────────────────
  // Gerencial (admin completo)
  await client.query(`
    INSERT INTO t_perfil_acesso (
      nome, descricao,
      acesso_gerencial, acesso_pdv, acesso_comanda, acesso_delivery,
      modulo_dashboard, modulo_cadastros, modulo_vendas, modulo_financeiro,
      modulo_estoque, modulo_producao, modulo_pedidos, modulo_comandas,
      modulo_consultas, modulo_fiscal, modulo_plano_acao, modulo_metas,
      modulo_usuarios,
      perc_desconto_max, valor_desconto_max, is_admin
    ) VALUES (
      'Gerencial', 'Acesso completo ao sistema',
      true, true, true, true,
      true, true, true, true,
      true, true, true, true,
      true, true, true, true,
      true,
      100, 0, true
    )
    ON CONFLICT DO NOTHING
  `)
  console.log('✓ Perfil Gerencial criado')

  // PDV
  await client.query(`
    INSERT INTO t_perfil_acesso (
      nome, descricao,
      acesso_gerencial, acesso_pdv, acesso_comanda, acesso_delivery,
      modulo_dashboard, modulo_cadastros, modulo_vendas, modulo_financeiro,
      modulo_estoque, modulo_producao, modulo_pedidos, modulo_comandas,
      modulo_consultas, modulo_fiscal, modulo_plano_acao, modulo_metas,
      modulo_usuarios,
      perc_desconto_max, valor_desconto_max, is_admin
    ) VALUES (
      'PDV', 'Acesso ao ponto de venda',
      false, true, false, false,
      false, false, true, false,
      false, false, false, false,
      false, false, false, false,
      false,
      5, 0, false
    )
    ON CONFLICT DO NOTHING
  `)
  console.log('✓ Perfil PDV criado')

  // Comanda
  await client.query(`
    INSERT INTO t_perfil_acesso (
      nome, descricao,
      acesso_gerencial, acesso_pdv, acesso_comanda, acesso_delivery,
      modulo_dashboard, modulo_cadastros, modulo_vendas, modulo_financeiro,
      modulo_estoque, modulo_producao, modulo_pedidos, modulo_comandas,
      modulo_consultas, modulo_fiscal, modulo_plano_acao, modulo_metas,
      modulo_usuarios,
      perc_desconto_max, valor_desconto_max, is_admin
    ) VALUES (
      'Comanda', 'Acesso à comanda eletrônica (mobile)',
      false, false, true, false,
      false, false, false, false,
      false, false, false, true,
      false, false, false, false,
      false,
      0, 0, false
    )
    ON CONFLICT DO NOTHING
  `)
  console.log('✓ Perfil Comanda criado')

  // Delivery
  await client.query(`
    INSERT INTO t_perfil_acesso (
      nome, descricao,
      acesso_gerencial, acesso_pdv, acesso_comanda, acesso_delivery,
      modulo_dashboard, modulo_cadastros, modulo_vendas, modulo_financeiro,
      modulo_estoque, modulo_producao, modulo_pedidos, modulo_comandas,
      modulo_consultas, modulo_fiscal, modulo_plano_acao, modulo_metas,
      modulo_usuarios,
      perc_desconto_max, valor_desconto_max, is_admin
    ) VALUES (
      'Delivery', 'Acesso ao módulo de entregas',
      false, false, false, true,
      false, false, false, false,
      false, false, true, false,
      false, false, false, false,
      false,
      0, 0, false
    )
    ON CONFLICT DO NOTHING
  `)
  console.log('✓ Perfil Delivery criado')

  // ── 4. Migrar usuários existentes ─────────────────────────────────────────
  // Usuários com perfil='admin' → Gerencial
  await client.query(`
    UPDATE t_usuario u
    SET perfil_id = (SELECT perfil_id FROM t_perfil_acesso WHERE nome = 'Gerencial' LIMIT 1)
    WHERE u.perfil = 'admin' AND u.perfil_id IS NULL
  `)
  console.log('✓ Usuários admin migrados para perfil Gerencial')

  // Usuários com perfil='user' → PDV
  await client.query(`
    UPDATE t_usuario u
    SET perfil_id = (SELECT perfil_id FROM t_perfil_acesso WHERE nome = 'PDV' LIMIT 1)
    WHERE u.perfil = 'user' AND u.perfil_id IS NULL
  `)
  console.log('✓ Usuários user migrados para perfil PDV')

  console.log('\n✅ Migration de perfis concluída!\n')
  client.release()
  pool.end()
}).catch(err => {
  console.error('Erro:', err.message)
  process.exit(1)
})