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

/*
 * ONLY the three real production groups from our audit.
 * TEST MODULE is intentionally excluded.
 */
const targetMasterIds = [
  '5f175b91-a1e8-4ed7-b23b-26cc615bcc2f', // AC Vent
  'daccbc7f-94df-4a9b-a742-c462a546884a', // Module
  '6b25a793-74da-4a7f-a2cc-b29b0a55ec9a', // Seat Belt
]

const apply =
  process.argv.includes('--apply')

console.log('')
console.log(
  apply
    ? '===== APPLYING SHARED MASTER REPAIR ====='
    : '===== DRY RUN: SHARED MASTER REPAIR =====',
)
console.log('')

for (const masterId of targetMasterIds) {
  const {
    data: master,
    error: masterError,
  } = await supabase
    .from('part_master')
    .select(
      'id, part_name, part_code',
    )
    .eq('id', masterId)
    .maybeSingle()

  if (masterError) {
    throw masterError
  }

  if (!master?.id) {
    console.log(
      `SKIP ${masterId}: master not found.`,
    )
    continue
  }

  const {
    data: linkedParts,
    error: linkedError,
  } = await supabase
    .from('parts')
    .select(
      'id, sku, created_at, part_master_id',
    )
    .eq(
      'part_master_id',
      masterId,
    )
    .order(
      'created_at',
      {
        ascending: true,
      },
    )

  if (linkedError) {
    throw linkedError
  }

  const rows =
    linkedParts ?? []

  console.log(
    '----------------------------------------',
  )
  console.log(
    `NAME: ${master.part_name ?? ''}`,
  )
  console.log(
    `CURRENT OEM #: ${master.part_code ?? ''}`,
  )
  console.log(
    `LINKED PARTS: ${rows.length}`,
  )

  if (rows.length <= 1) {
    console.log(
      'Already isolated. No repair needed.',
    )
    console.log('')
    continue
  }

  const keeper =
    rows[0]

  console.log(
    `KEEP ORIGINAL: ${keeper.sku}`,
  )

  const partsToSplit =
    rows.slice(1)

  for (
    const part of partsToSplit
  ) {
    console.log(
      `${apply ? 'SPLITTING' : 'WOULD SPLIT'}: ${part.sku}`,
    )

    if (!apply) {
      continue
    }

    /*
     * Create a completely independent master.
     *
     * OEM number intentionally starts blank.
     * This prevents the corrupt inherited number
     * from following the part into its new record.
     */
    const {
      data: newMaster,
      error: createError,
    } = await supabase
      .from('part_master')
      .insert({
        part_name:
          master.part_name ||
          'Unidentified Part',
        part_code:
          `UNIDENTIFIED-${part.id}`,
      })
      .select(
        'id, part_name, part_code',
      )
      .single()

    if (
      createError ||
      !newMaster?.id
    ) {
      throw new Error(
        `Unable to create replacement master for ${part.sku}: ${
          createError?.message ??
          'No master ID returned.'
        }`,
      )
    }

    const {
      error: updateError,
    } = await supabase
      .from('parts')
      .update({
        part_master_id:
          newMaster.id,
      })
      .eq(
        'id',
        part.id,
      )

    if (updateError) {
      /*
       * Clean up the newly created unused master
       * if relinking the inventory part fails.
       */
      await supabase
        .from('part_master')
        .delete()
        .eq(
          'id',
          newMaster.id,
        )

      throw new Error(
        `Unable to relink ${part.sku}: ${updateError.message}`,
      )
    }

    console.log(
      `  OK -> new master ${newMaster.id}`,
    )
  }

  console.log('')
}

if (!apply) {
  console.log(
    'DRY RUN COMPLETE. Nothing was changed.',
  )
  console.log(
    'If the plan above looks correct, run:',
  )
  console.log(
    'node scripts/repair-shared-part-masters.mjs --apply',
  )
} else {
  console.log(
    'REPAIR COMPLETE.',
  )
  console.log(
    'Run the audit again now.',
  )
}
