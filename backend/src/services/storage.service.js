import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { S3_BUCKET, s3 } from '../config/s3.js'

// All S3 access lives here. Objects stay private: no ACLs are set and nothing returns a public URL.

function checkKey(key) {
  if (typeof key !== 'string' || key.trim() === '') throw new TypeError('An S3 object key must be a non-empty string.')
  return key
}

// body: Buffer | Uint8Array | string
export async function uploadObject({ key, body, contentType }) {
  await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: checkKey(key), Body: body, ContentType: contentType }))
  return { key }
}

// Resolves to { body: Buffer, contentType }. Throws if the object does not exist.
export async function getObject(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: checkKey(key) }))
  return { body: Buffer.from(await res.Body.transformToByteArray()), contentType: res.ContentType }
}

export async function deleteObject(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: checkKey(key) }))
}
