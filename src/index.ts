// imports 
import { connect, createIndex, addResult, getResult, getTagMappings } from "./db"
import { StashApp } from "./stash-app"
import { genID, helpText, ScrapeTypeArr, ScrapeTypeTypings } from "./utils"
import { createTagMappings } from "./populate_tags"
import 'dotenv/config'

import Koa from "koa"
const app = new Koa()
import cors from '@koa/cors';
import bodyParser from "@koa/bodyparser";
import serve from 'koa-static';

import Router from '@koa/router';
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

router.get("/api/result/:type/{*lookup}", async (ctx) => {
  const lookup = ctx.params.lookup
  if (!lookup) {
    ctx.status = 400
    ctx.body = 'Job ID/ URL is required'
    return
  }
  const type = ctx.params.type as string
  if (!type) {
    ctx.status = 400
    ctx.body = 'Scrape type is required'
    return
  }
  // validate type
  if (!ScrapeTypeArr.includes(type)) {
    ctx.status = 400
    ctx.body = `Invalid scrape type. Valid types are: ${ScrapeTypeArr.join(', ')}`
    return
  }
  const result = await getResult(type as ScrapeTypeTypings, lookup)
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
  if (!ScrapeTypeArr.includes(body.scrapeType)) {
    ctx.status = 400
    ctx.body = `Invalid scrapeType. Valid types are: ${ScrapeTypeArr.join(', ')}`
    return
  }
  // try finding existing result first
  const existingResult = await getResult(body.scrapeType as ScrapeTypeTypings, body.url)
  if (existingResult) {
    ctx.body = existingResult
    return
  }
  // set up stash instance
  const stash = new StashApp()
  const searchResult = await stash.urlSeachScrapers(body.url)
  if (searchResult && "error" in searchResult) {
    ctx.status = 400
    ctx.body = searchResult
    return
  }
  const jobId = genID()
  // check update packages
  await stash.checkUpdatePackages()
  // set start time
  const startTime = new Date()
  const result = await stash.startScrape(body.url, body.scrapeType as ScrapeTypeTypings)
  // get logs
  const logs = await stash.getLogs(startTime)
  // replace tags with parsed tags
  const parsedTags = await getTagMappings(result.result?.tags || [])
  // get package versions
  const packageVersions = await stash.getPkgVersion(searchResult?.id || "")
  const cachedResult = {
    jobId,
    ...result,
    result: {
      ...result.result,
      tags: parsedTags,
    },
    runnerInfo: {
      scraperId: searchResult?.id ?? null,
      scraperVersion: packageVersions || null,
      ...result.runnerInfo
    },
    stashInfo: result.stashInfo,
    logs,
  }
  // insert
  addResult(body.scrapeType as ScrapeTypeTypings, cachedResult, body.url)
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