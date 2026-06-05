require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST,
  port: 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
})

pool.connect().then(async client => {
  const result = await client.query(
    "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'"
  )
  console.log('Schemas encontrados:')
  result.rows.forEach(r => console.log(' -', r.schema_name))
  client.release()
  pool.end()
}).catch(err => {
  console.error('Erro:', err.message)
  process.exit(1)
})