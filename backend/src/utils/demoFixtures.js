import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Demo data points at bundled image files with `demo-fixture:<file name>` instead of a network URL, so demo images
// always load and the server never has to fetch anything for them.
//
// Safety: the reference is NOT a path. Only a plain file name matching the pattern below is accepted (no slashes, no
// dots except the extension, no drive letters), the file must live directly in assets/demo-fixtures, and sellers cannot
// store such a value in a product (their image URL must be https, see seller.service.js).
export const DEMO_FIXTURE_PREFIX = 'demo-fixture:'
const FILE_NAME = /^[a-z0-9][a-z0-9-]{0,60}\.(jpg|png|webp)$/
export const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'demo-fixtures')

export const isDemoFixtureRef = (value) => typeof value === 'string' && value.startsWith(DEMO_FIXTURE_PREFIX)

// Returns the file bytes, or null when the reference is malformed or the file does not exist.
export async function readDemoFixture(ref, { dir = FIXTURE_DIR } = {}) {
  if (!isDemoFixtureRef(ref)) return null
  const name = ref.slice(DEMO_FIXTURE_PREFIX.length)
  if (!FILE_NAME.test(name)) return null
  try {
    return await readFile(path.join(dir, name))
  } catch {
    return null
  }
}
