// Usage: npm run test:s3
// Uploads a tiny text object to the real (private) bucket, reads it back, deletes it, and confirms it is gone.
// The temporary object is removed even if a check fails after the upload. No credentials are printed.
import assert from 'node:assert/strict'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { S3_BUCKET, s3 } from '../src/config/s3.js'
import { deleteObject, getObject, uploadObject } from '../src/services/storage.service.js'

const key = `_returnflow-test/s3-connectivity-test-${Date.now()}.txt`
const text = `ReturnFlow S3 connectivity test ${new Date().toISOString()}`
let uploaded = false

const exists = async () => {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }))
    return true
  } catch (err) {
    if (err.$metadata?.httpStatusCode === 404 || err.name === 'NotFound') return false
    throw err
  }
}

try {
  await uploadObject({ key, body: text, contentType: 'text/plain' })
  uploaded = true
  console.log('upload: ok')

  const read = await getObject(key)
  assert.equal(read.body.toString('utf8'), text)
  assert.equal(read.contentType, 'text/plain')
  console.log('read back: ok (content and content type match)')
} catch (err) {
  console.error('S3 test failed:', err.name, '-', err.message)
  process.exitCode = 1
} finally {
  if (uploaded) {
    try {
      await deleteObject(key)
      console.log('delete: ok')
      console.log(`cleanup: ${(await exists()) ? 'FAILED, object still present' : 'confirmed, object is gone'}`)
      if (await exists()) process.exitCode = 1
    } catch (err) {
      console.error('cleanup failed:', err.name, '-', err.message)
      process.exitCode = 1
    }
  }
  console.log(process.exitCode ? 'RESULT: failed' : 'RESULT: passed')
}
