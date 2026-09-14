import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

function parseTsv(filename) {
  const lines = fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/)
  const headers = lines.shift().split('\t')
  return lines.map(line => {
    const fields = line.split('\t')
    assert.equal(fields.length, headers.length)
    return Object.fromEntries(headers.map((header, index) => [header, fields[index]]))
  })
}

const mapping = parseTsv(new URL('../data/category-nomenclature.tsv', import.meta.url))
const inventory = JSON.parse(fs.readFileSync(new URL('../../docs/seo-2026-09-08/categories-inventory-2026-09-13.json', import.meta.url), 'utf8'))

test('mapping covers the exact current category inventory without rewriting identifiers', () => {
  assert.equal(mapping.length, 79)
  assert.deepEqual(mapping.map(row => Number(row.id)), inventory.categories.map(row => row.id))
  const current = new Map(inventory.categories.map(row => [row.id, row]))
  for (const row of mapping) {
    const source = current.get(Number(row.id))
    assert.equal(row.current_fr, source.nom, `French snapshot mismatch for ${row.id}`)
    assert.equal(row.current_ar, source.nom_ar, `Arabic snapshot mismatch for ${row.id}`)
    assert.equal(row.current_parent_id, source.parent_id == null ? '' : String(source.parent_id), `Parent snapshot mismatch for ${row.id}`)
  }
})

test('every category has durable proposed labels, slug, classification and review state', () => {
  const slugs = new Set()
  const classes = new Set(['materials', 'machines', 'tools', 'consumables', 'services', 'unclassified'])
  for (const row of mapping) {
    assert.ok(row.proposed_fr.trim(), `Missing French proposal for ${row.id}`)
    assert.ok(row.proposed_ar.trim(), `Missing Arabic proposal for ${row.id}`)
    assert.match(row.slug, new RegExp(`^${row.id}-`))
    assert.ok(!slugs.has(row.slug), `Duplicate slug ${row.slug}`)
    slugs.add(row.slug)
    assert.ok(classes.has(row.classification), `Invalid class for ${row.id}`)
    assert.ok(['approved', 'needs_business_review'].includes(row.name_status))
    assert.ok(['validated', 'needs_business_review', 'needs_product_review', 'approved_change'].includes(row.structure_status))
  }
  assert.equal(mapping.filter(row => row.classification === 'services').length, 0)
})

test('prompt 04 editorial slugs stay stable and ambiguous mergers remain unapplied', () => {
  const byId = new Map(mapping.map(row => [Number(row.id), row]))
  assert.equal(byId.get(36).slug, '36-materiaux-construction')
  assert.equal(byId.get(48).slug, '48-outillage-carreleur')
  assert.equal(byId.get(50).slug, '50-colles-carrelage-marbre')
  assert.equal(byId.get(52).slug, '52-disques-diamant')
  assert.equal(byId.get(53).slug, '53-plomberie')
  assert.equal(byId.get(72).slug, '72-peinture')
  assert.equal(byId.get(73).slug, '73-matieres-de-construction')
  assert.equal(byId.get(75).slug, '75-etancheite-bitume')
  assert.equal(byId.get(76).slug, '76-mastics-joints')
  for (const id of [1, 23, 52, 73, 74, 75, 76, 83, 88, 89, 96, 107, 109, 112, 119, 123, 124, 126, 127, 129]) {
    assert.notEqual(byId.get(id).structure_status, 'approved_change')
    assert.equal(byId.get(id).current_parent_id, byId.get(id).proposed_parent_id)
  }
})

test('current and proposed mappings have no missing Arabic labels while unclassified products remain visible for business review', () => {
  assert.equal(inventory.summary.missing_ar, 0)
  assert.equal(mapping.filter(row => !row.proposed_ar.trim()).length, 0)
  assert.equal(inventory.summary.unclassified, 1)
  const uncategorized = inventory.categories.find(row => row.id === 1)
  assert.equal(uncategorized.product_count_all, 2402)
  assert.equal(uncategorized.public_product_count, 628)
})
