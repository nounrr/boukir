import fs from 'node:fs/promises'
import path from 'node:path'
import pool from '../db/pool.js'

function valueAfter(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : null
}

const apply = process.argv.includes('--apply')
const rollbackFile = valueAfter('--rollback')
const mappingFile = path.resolve(valueAfter('--mapping') || path.join('backend', 'data', 'category-nomenclature.tsv'))
const snapshotFile = valueAfter('--snapshot')
  ? path.resolve(valueAfter('--snapshot'))
  : path.resolve('backend', 'category-nomenclature-backups', `categories-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)

function nullableId(value) {
  const text = String(value ?? '').trim()
  return text ? Number(text) : null
}

async function readMapping() {
  const lines = (await fs.readFile(mappingFile, 'utf8')).replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  const headers = lines.shift().split('\t')
  const rows = lines.map((line, index) => {
    const fields = line.split('\t')
    if (fields.length !== headers.length) throw new Error(`Invalid TSV row ${index + 2}: expected ${headers.length} columns, got ${fields.length}`)
    return Object.fromEntries(headers.map((header, column) => [header, fields[column]]))
  })
  const ids = rows.map(row => Number(row.id))
  if (new Set(ids).size !== ids.length || ids.some(id => !Number.isSafeInteger(id))) throw new Error('Mapping contains invalid or duplicate IDs')
  return rows
}

function sameValue(left, right) {
  return String(left ?? '').trim() === String(right ?? '').trim()
}

async function rollbackSnapshot(connection, filename) {
  const snapshot = JSON.parse(await fs.readFile(path.resolve(filename), 'utf8'))
  if (!Array.isArray(snapshot.changes)) throw new Error('Invalid rollback snapshot')
  const restored = []
  await connection.beginTransaction()
  try {
    for (const change of snapshot.changes) {
      const [[current]] = await connection.query('SELECT id, nom, nom_ar, parent_id FROM categories WHERE id = ? FOR UPDATE', [change.id])
      if (!current) throw new Error(`Rollback conflict: category ${change.id} no longer exists`)
      for (const field of ['nom', 'nom_ar', 'parent_id']) {
        if (!sameValue(current[field], change.after[field])) throw new Error(`Rollback conflict on category ${change.id}.${field}; current data changed after the mapping`)
      }
      await connection.query('UPDATE categories SET nom = ?, nom_ar = ?, parent_id = ?, updated_at = NOW() WHERE id = ?', [change.before.nom, change.before.nom_ar, change.before.parent_id, change.id])
      restored.push(change.id)
    }
    await connection.commit()
    console.log(JSON.stringify({ mode: 'rollback', restored: restored.length, ids: restored }, null, 2))
  } catch (error) {
    await connection.rollback()
    throw error
  }
}

async function planOrApply(connection, mapping) {
  const changes = []
  const skippedForReview = []
  const alreadyApplied = []
  const conflicts = []
  await connection.beginTransaction()
  try {
    for (const row of mapping) {
      const id = Number(row.id)
      const [[current]] = await connection.query('SELECT id, nom, nom_ar, parent_id FROM categories WHERE id = ? FOR UPDATE', [id])
      if (!current) {
        conflicts.push({ id, reason: 'missing_database_row' })
        continue
      }

      const nameApproved = row.name_status === 'approved'
      const parentApproved = row.structure_status === 'approved_change'
      const after = {
        nom: nameApproved ? row.proposed_fr : current.nom,
        nom_ar: nameApproved ? row.proposed_ar : current.nom_ar,
        parent_id: parentApproved ? nullableId(row.proposed_parent_id) : current.parent_id,
      }
      const before = { nom: current.nom, nom_ar: current.nom_ar, parent_id: current.parent_id }
      const expected = { nom: row.current_fr, nom_ar: row.current_ar, parent_id: nullableId(row.current_parent_id) }

      if (!nameApproved) skippedForReview.push({ id, field: 'name', status: row.name_status, note: row.note })
      if (row.structure_status !== 'validated' && !parentApproved) skippedForReview.push({ id, field: 'parent', status: row.structure_status, note: row.note })

      if (sameValue(current.nom, after.nom) && sameValue(current.nom_ar, after.nom_ar) && sameValue(current.parent_id, after.parent_id)) {
        alreadyApplied.push(id)
        continue
      }
      const nameDrift = nameApproved && (!sameValue(current.nom, expected.nom) || !sameValue(current.nom_ar, expected.nom_ar))
      const parentDrift = parentApproved && !sameValue(current.parent_id, expected.parent_id)
      if (nameDrift || parentDrift) {
        conflicts.push({ id, reason: 'current_values_differ_from_mapping_snapshot', current, expected })
        continue
      }
      changes.push({ id, before, after, slug: row.slug, classification: row.classification })
    }

    if (conflicts.length) throw Object.assign(new Error(`${conflicts.length} mapping conflict(s); no update applied`), { conflicts })

    if (!apply) {
      await connection.rollback()
      console.log(JSON.stringify({ mode: 'dry-run', changes: changes.length, already_applied: alreadyApplied.length, review_items: skippedForReview.length, planned: changes, skipped_for_review: skippedForReview }, null, 2))
      return
    }

    for (const change of changes) {
      await connection.query('UPDATE categories SET nom = ?, nom_ar = ?, parent_id = ?, updated_at = NOW() WHERE id = ?', [change.after.nom, change.after.nom_ar, change.after.parent_id, change.id])
    }
    await fs.mkdir(path.dirname(snapshotFile), { recursive: true })
    await fs.writeFile(snapshotFile, `${JSON.stringify({ generated_at: new Date().toISOString(), mapping_file: mappingFile, changes }, null, 2)}\n`, 'utf8')
    await connection.commit()
    console.log(JSON.stringify({ mode: 'apply', updated: changes.length, already_applied: alreadyApplied.length, review_items: skippedForReview.length, snapshot: snapshotFile }, null, 2))
  } catch (error) {
    await connection.rollback()
    if (error.conflicts) console.error(JSON.stringify(error.conflicts, null, 2))
    throw error
  }
}

const connection = await pool.getConnection()
try {
  if (rollbackFile) await rollbackSnapshot(connection, rollbackFile)
  else await planOrApply(connection, await readMapping())
} finally {
  connection.release()
  await pool.end()
}
