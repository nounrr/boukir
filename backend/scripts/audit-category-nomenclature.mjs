import fs from 'node:fs/promises'
import path from 'node:path'

function option(name, fallback = null) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const baseUrl = String(option('--base-url', process.env.PUBLIC_SITE_URL || 'https://boukirdiamond.com')).replace(/\/+$/, '')
const output = option('--output')

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'application/json', Platform: 'web' } })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.json()
}

async function mapLimit(items, limit, task) {
  const result = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      result[index] = await task(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return result
}

function clean(value) {
  return String(value ?? '').trim()
}

function duplicateKey(value) {
  return clean(value).normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

const categories = await getJson(`${baseUrl}/api/categories`)
if (!Array.isArray(categories)) throw new Error('Categories API did not return an array')
const ids = new Set(categories.map(category => Number(category.id)))

const rows = await mapLimit([...categories].sort((a, b) => a.id - b.id), 8, async category => {
  const [usage, catalogue] = await Promise.all([
    getJson(`${baseUrl}/api/categories/${category.id}/usage`),
    getJson(`${baseUrl}/api/ecommerce/products?category_id=${category.id}&page=1&per_page=5&in_stock_only=false`),
  ])
  return {
    id: category.id,
    nom: category.nom,
    nom_ar: category.nom_ar,
    nom_en: category.nom_en,
    nom_zh: category.nom_zh,
    parent_id: category.parent_id,
    parent_exists: category.parent_id == null || ids.has(Number(category.parent_id)),
    product_count_all: Number(usage.productCount || 0),
    subcategory_count: Number(usage.subcategoryCount || 0),
    public_product_count: Number(catalogue?.pagination?.total_items || 0),
    public_product_samples: Array.isArray(catalogue?.products)
      ? catalogue.products.slice(0, 5).map(product => ({ id: product.id, designation: product.designation }))
      : [],
  }
})

const duplicateGroups = Object.values(rows.reduce((groups, row) => {
  const key = duplicateKey(row.nom)
  if (!key) return groups
  ;(groups[key] ||= []).push(row.id)
  return groups
}, {})).filter(ids => ids.length > 1)

const report = {
  generated_at: new Date().toISOString(),
  source: `${baseUrl}/api/categories`,
  summary: {
    total: rows.length,
    roots: rows.filter(row => row.parent_id == null).length,
    missing_fr: rows.filter(row => !clean(row.nom)).length,
    missing_ar: rows.filter(row => !clean(row.nom_ar)).length,
    missing_en: rows.filter(row => !clean(row.nom_en)).length,
    missing_zh: rows.filter(row => !clean(row.nom_zh)).length,
    unclassified: rows.filter(row => duplicateKey(row.nom) === 'UNCATEGORIZED').length,
    orphan_parents: rows.filter(row => !row.parent_exists).length,
    duplicate_name_groups: duplicateGroups,
  },
  categories: rows,
}

const json = `${JSON.stringify(report, null, 2)}\n`
if (output) {
  const target = path.resolve(output)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, json, 'utf8')
  console.log(target)
} else {
  process.stdout.write(json)
}
