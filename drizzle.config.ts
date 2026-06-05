import type { Config } from 'drizzle-kit'

export default {
  schema: './lib/db/schemas/*',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    ssl: false,
  },
} satisfies Config
