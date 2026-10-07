import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Set DATABASE_URL')
  process.exit(1)
}

const sql = neon(url)

const tables = await sql`
  SELECT table_schema, table_name
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    AND (
      table_name LIKE 'retail%'
      OR table_name IN (
        'tenants', 'products', 'categories', 'stock_levels', 'warehouses',
        'tenant_settings', 'idempotency_keys', 'day_closes', 'payments'
      )
    )
  ORDER BY table_name
`
console.log('TABLES:', JSON.stringify(tables, null, 2))

for (const name of ['products', 'retail_receipts', 'retail_sales', 'retail_payments', 'tenants', 'categories', 'stock_levels', 'warehouses']) {
  const cols = await sql`
    SELECT column_name, is_nullable, udt_name, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${name}
    ORDER BY ordinal_position
  `
  console.log(`\n--- ${name} ---`)
  console.log(JSON.stringify(cols, null, 2))
}
