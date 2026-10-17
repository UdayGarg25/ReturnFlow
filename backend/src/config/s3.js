import { S3Client } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'

// Loaded here too, so this module works no matter which file is imported first.
dotenv.config()

const REQUIRED = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET_NAME']
const missing = REQUIRED.filter((name) => !process.env[name]?.trim())
if (missing.length > 0) {
  // Names only: values (especially the secret key) are never printed.
  throw new Error(`Missing S3 configuration: ${missing.join(', ')}. Set them in backend/.env (see .env.example).`)
}

// The bucket is private. Objects are only ever read or written by the backend with these server-side credentials.
export const s3 = new S3Client({
  region: process.env.AWS_REGION.trim(),
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID.trim(),
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY.trim(),
  },
})

export const S3_BUCKET = process.env.S3_BUCKET_NAME.trim()
