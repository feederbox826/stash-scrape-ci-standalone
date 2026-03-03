// imports 
import { connect, createIndex, addResult, getResult, getTagMappings, createApiKey, revokeApiKey } from "./db.js"
import { StashApp } from "./stash-app.js"
import { genID, helpText } from "./utils.js"
import { createTagMappings } from "./populate_tags.js"
import { keyStatus, checkKeyLimit } from "./apikey.js"
import 'dotenv/config'

import Koa from "koa"
const app = new Koa()
import cors from '@koa/cors';
import bodyParser from "@koa/bodyparser";
import serve from 'koa-static';

import Router from '@koa/router';
import { cleanSceneResult, jobResult } from "../types/jobResult.js"
const router = new Router();

// apikey validatorv
const koaValidate = async (ctx: Koa.Context, next: Koa.Next) => {
  // missing definition patches
  const apiKey = (ctx.request as any).body?.auth || ctx.query.auth || ctx.headers['x-api-key']
  const apikeyResponse = await checkKeyLimit(apiKey)
  if (apikeyResponse === keyStatus.invalid) {
    ctx.status = 401
    ctx.body = 'Unauthorized'
    return
  } else if (apikeyResponse === keyStatus.exhausted) {
    ctx.status = 429
    ctx.body = 'API key rate limit exceeded'
    return
  }
  return next()
}

const koaValidateAdmin = async (ctx: Koa.Context, next: Koa.Next) => {
  const apikey = (ctx.request as any).body?.auth || ctx.query.auth || ctx.headers['x-api-key']
  if (apikey !== process.env.ADMIN_KEY) {
    ctx.status = 401
    ctx.body = 'Unauthorized'
    return
  }
  return next()
}

router.get('/', async (ctx) => {
  ctx.body = helpText
})

router.get("/api", async (ctx) => {
  ctx.body = helpText
})

// admin api
router.post("/api/admin/apikey", koaValidateAdmin, async (ctx) => {
  const body = (ctx.request as any).body
  if (!body || !body.note) {
    ctx.status = 400
    ctx.body = 'Note is required to create API key'
    return
  }
  const limit = body.limit || 200
  const apiKey = await createApiKey(body.note, limit)
  ctx.body = { apiKey, limit }
})

router.delete("/api/admin/apikey", koaValidateAdmin, async (ctx) => {
  const body = (ctx.request as any).body
  if (!body || !body.key) {
    ctx.status = 400
    ctx.body = 'API key is required to revoke'
    return
  }
  await revokeApiKey(body.key)
  ctx.body = 'API key revoked successfully'
})

router.post("/api/update", koaValidate, async (ctx) => {
  const stash = new StashApp()
  await stash.migrateDatabase()
  await stash.checkUpdatePackages(true)
  ctx.body = 'Scrapers updated successfully'
})

router.get("/api/result/{*lookup}", async (ctx) => {
  const lookup = ctx.params.lookup
  if (!lookup) {
    ctx.status = 400
    ctx.body = 'Job ID/ URL is required'
    return
  }
  const result = await getResult(lookup)
  if (!result) {
    ctx.status = 404
    ctx.body = 'Job result not found'
    return
  }
  ctx.body = result
})

router.get("/api/scrape/:type/{*url}", koaValidate, async (ctx) => {
  const url = ctx.params.url
  if (!url) {
    ctx.status = 400
    ctx.body = 'URL is required'
    return
  }
  const { status, body } = await getScrapeResult(ctx.params.type, url)
  ctx.status = status
  ctx.body = body
})

router.post("/api/scrape", koaValidate, async (ctx) => {
  // missing defn patches
  const bodyJSON = (ctx.request as any).body
  if (!bodyJSON || !bodyJSON.url || !bodyJSON.scrapeType) {
    ctx.status = 400
    ctx.body = 'Missing required fields: url, scrapeType'
    return
  }
  if (bodyJSON.scrapeType !== 'scene') {
    ctx.status = 400
    ctx.body = `Invalid scrapeType. Valid types are: scene`
    return
  }
  const { status, body } = await getScrapeResult(bodyJSON.scrapeType, bodyJSON.url, bodyJSON.rescrape)
  ctx.status = status
  ctx.body = body
})

app.use(cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS']
}));
app.use(bodyParser());
app.use(router.routes()).use(router.allowedMethods());
app.use(serve('public', { extensions: ['html'] }));

// connect db
connect()
  .then(() => createIndex())
  .then(() => console.log("Connected to database"))
  .then(() => createTagMappings())
  .then(() => console.log("Tag mappings populated"))
  .catch(err => {
    console.error("Failed to connect to database:", err)
    process.exit(1)
  })

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`);
});

process.on('SIGINT', function() {
  process.exit()
});

// helper to get scrape results
const getScrapeResult = async (type: string, url: string, rescrape = false): Promise<{ status: number, body: Object | string }> => {
  // only support scenes for now
  if (type !== 'scene') {
    return { status: 400, body: { error: 'Invalid scrapeType. Valid types are: scene' } }
  }
  // try finding existing result first
  const existingResult = await getResult(url)
  if (!rescrape && existingResult) {
    return { status: 200, body: existingResult }
  }
  // set up stash instance
  const stash = new StashApp()
  const searchResult = await stash.urlSeachScrapers(url)
  if ("error" in searchResult) {
    return { status: 400, body: searchResult }
  }
  const jobId = genID()
  // check update packages
  await stash.checkUpdatePackages()
  // set start time
  const startTime = new Date()
  const result = await stash.startScrape(url)
  // if error, return
  if (result.error) {
    return { status: 500, body: result }
  }
  // get logs
  const logs = await stash.getLogs(startTime)
  // replace tags with parsed tags
  const parsedTags = await getTagMappings(result.result?.tags ?? [])
  // get package versions
  const scraperVersion = await stash.getPkgVersion(searchResult?.id)
  const cachedResult: jobResult = {
    jobId,
    ...result,
    result: {
      ...result.result as cleanSceneResult,
      tags: parsedTags,
    },
    runnerInfo: {
      scraperId: searchResult?.id,
      scraperVersion,
      ...result.runnerInfo
    },
    stashInfo: result.stashInfo,
    logs,
  }
  // insert
  addResult(cachedResult, url)
  return { status: 200, body: cachedResult }
}