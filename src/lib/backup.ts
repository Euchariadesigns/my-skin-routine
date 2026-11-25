import { db } from '../db/db'
import type { Product } from '../domain/types'

const APP = 'my-skin-routine'

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/** Everything, including photos, in one file the person can keep somewhere safe. */
export async function exportBackup(): Promise<Blob> {
  const [products, routines, schedules, rotations, logs, notifications, settings] = await Promise.all([
    db.products.toArray(), db.routines.toArray(), db.schedules.toArray(), db.rotations.toArray(),
    db.logs.toArray(), db.notifications.toArray(), db.settings.toArray(),
  ])
  const productsOut = await Promise.all(products.map(async p => ({ ...p, photo: p.photo ? await blobToDataUrl(p.photo) : undefined })))
  const data = { app: APP, version: 1, exportedAt: new Date().toISOString(), products: productsOut, routines, schedules, rotations, logs, notifications, settings }
  return new Blob([JSON.stringify(data)], { type: 'application/json' })
}

export function backupFileName(): string {
  const d = new Date()
  return `my-skin-routine-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`
}

/** Replaces everything on this phone with what's in the backup file. */
export async function importBackup(file: File): Promise<void> {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('That file isn’t a backup we can read.')
  }
  if (data.app !== APP) throw new Error('That file isn’t a My Skin Routine backup.')
  const arr = <T,>(k: string) => (Array.isArray(data[k]) ? (data[k] as T[]) : [])
  const products: Product[] = await Promise.all(
    arr<Product & { photo?: string }>('products').map(async p => ({
      ...p,
      photo: typeof p.photo === 'string' ? await (await fetch(p.photo)).blob() : undefined,
    })),
  )
  const tables = [db.products, db.routines, db.schedules, db.rotations, db.logs, db.notifications, db.settings]
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map(t => t.clear()))
    await db.products.bulkAdd(products)
    await db.routines.bulkAdd(arr('routines'))
    await db.schedules.bulkAdd(arr('schedules'))
    await db.rotations.bulkAdd(arr('rotations'))
    await db.logs.bulkAdd(arr('logs'))
    await db.notifications.bulkAdd(arr('notifications'))
    await db.settings.bulkAdd(arr('settings'))
  })
}

export async function eraseEverything(): Promise<void> {
  const tables = [db.products, db.routines, db.schedules, db.rotations, db.logs, db.notifications, db.settings]
  await db.transaction('rw', tables, async () => { await Promise.all(tables.map(t => t.clear())) })
}
