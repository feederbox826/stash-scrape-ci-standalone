// imports 
import { connect, createIndex, addResult, getResult, getTagMappings } from "./db"
import { StashApp } from "./stash-app"
import { genID, helpText } from "./utils"
import { createTagMappings } from "./populate_tags"
import 'dotenv/config'

import Koa from "koa"
const app = new Koa()
import cors from '@koa/cors';
import bodyParser from "@koa/bodyparser";
import serve from 'koa-static';

import Router from '@koa/router';
import { cleanSceneResult, jobResult } from "../types/jobResult"
const router = new Router();

// apikey validatorv
const validateApiKey = (ctx: Koa.Context, next: Koa.Next) => {
  const apiKey = ctx.request.body?.auth || ctx.query.auth || ctx.headers['x-api-key']
  if (apiKey !== process.env.AUTH_KEY) {
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

router.post("/api/update", validateApiKey, async (ctx) => {
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

router.post("/api/scrape", validateApiKey, async (ctx) => {
  const body = ctx.request.body
  if (!body || !body.url || !body.scrapeType) {
    ctx.status = 400
    ctx.body = 'Missing required fields: url, scrapeType'
    return
  }
  if (body.scrapeType !== 'scene') {
    ctx.status = 400
    ctx.body = `Invalid scrapeType. Valid types are: scene`
    return
  }
  // optionally rescrape
  const rescrape = body.rescrape || false
  // try finding existing result first
  const existingResult = await getResult(body.url)
  if (!rescrape && existingResult) {
    ctx.body = existingResult
    return
  }
  // set up stash instance
  const stash = new StashApp()
  const searchResult = await stash.urlSeachScrapers(body.url)
  if ("error" in searchResult) {
    ctx.status = 400
    ctx.body = searchResult
    return
  }
  const jobId = genID()
  // check update packages
  await stash.checkUpdatePackages()
  // set start time
  const startTime = new Date()
  const result = await stash.startScrape(body.url)
  // if error, return
  if (result.error) {
    ctx.status = 500
    ctx.body = result
    return
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
  addResult(cachedResult, body.url)
  ctx.body = cachedResult
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