import B2 from "backblaze-b2";
// @ts-ignore
import { saveAuthContext } from 'backblaze-b2/lib/utils.js'
import { configCollection } from "./db.js";

const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID!,
  applicationKey: process.env.B2_APP_KEY!,
})

const TOKEN_LIFETIME = 23 * 60 * 60 * 1000 // 24 hours (-1 for safety)

const authCache = configCollection.findOne({ key: "b2Auth" })

const authorize = async () => {
  // check cache
  const cache = await authCache
  if (cache && cache.expiration > Date.now()) {
    saveAuthContext(b2, cache.value)
    return cache.value
  }
  // authorize
  const authPromise = b2.authorize()
    .then(res => {
      // save to cache
      configCollection.updateOne(
        { key: "b2Auth" },
        { $set: { value: res.data, expiration: Date.now() + TOKEN_LIFETIME } },
        { upsert: true }
      )
      return res.data
    })
  return authPromise
}

export async function uploadImage(base64: string, jobID: string) {
  if (!base64) return null
  // cache b2 token in mongo
  await authorize()
  const [meta, data] = base64.split(";base64,")
  const [_,mimetype] = meta.split("data:")
  const buffer = Buffer.from(data, 'base64')
  const { data: uploadURLResponse } = await b2.getUploadUrl({ bucketId: process.env.B2_BUCKET_ID! })
  const { uploadUrl, authorizationToken } = uploadURLResponse
  await b2.uploadFile({
    uploadUrl,
    mime: mimetype,
    uploadAuthToken: authorizationToken,
    fileName: jobID,
    data: buffer
  })
  return `${process.env.CDN_URL}/${jobID}`
}