import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const envText = fs.readFileSync('.env', 'utf8')

const env = Object.fromEntries(
  envText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=')
      return [
        line.slice(0, index),
        line.slice(index + 1),
      ]
    }),
)

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
)

const { data, error } = await supabase
  .from('parts')
  .select(`
    id,
    sku,
    created_at,
    part_master_id,
    part_master:part_master_id (
      id,
      part_name,
      part_code
    )
  `)
  .order('created_at', {
    ascending: true,
  })

if (error) {
  throw error
}

const groups = new Map()

for (const row of data ?? []) {
  const masterId =
    row.part_master_id ?? 'NO_MASTER'

  if (!groups.has(masterId)) {
    groups.set(masterId, [])
  }

  groups.get(masterId).push(row)
}

const suspicious = [...groups.entries()]
  .filter(
    ([masterId, rows]) =>
      masterId !== 'NO_MASTER' &&
      rows.length > 1,
  )
  .sort(
    (a, b) =>
      b[1].length - a[1].length,
  )

console.log('')
console.log(
  '===== SHARED PART MASTER AUDIT =====',
)
console.log(
  `Total inventory parts: ${data?.length ?? 0}`,
)
console.log(
  `Shared master groups: ${suspicious.length}`,
)
console.log('')

for (const [masterId, rows] of suspicious) {
  const master = Array.isArray(rows[0].part_master)
    ? rows[0].part_master[0]
    : rows[0].part_master

  console.log(
    '----------------------------------------',
  )
  console.log(
    `MASTER ID: ${masterId}`,
  )
  console.log(
    `NAME: ${master?.part_name ?? ''}`,
  )
  console.log(
    `CURRENT OEM #: ${master?.part_code ?? ''}`,
  )
  console.log(
    `LINKED PARTS: ${rows.length}`,
  )

  for (const row of rows) {
    console.log(
      `  ${row.sku} | ${row.created_at ?? ''}`,
    )
  }

  console.log('')
}
