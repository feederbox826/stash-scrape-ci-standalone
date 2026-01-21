import { getLastScraperUpdate } from "./db"
import { ScrapeTypeTypings } from "./utils"
import { scraperSearch } from "./scraper-index"
import { installedPackage, logEntry } from "../types/stashapp"
import axios from "axios"

export class StashApp {
  private STASH_URL: string
  private STASH_API_KEY: string | undefined
  constructor() {
    this.STASH_URL = process.env.STASH_URL || "http://localhost:9999/graphql"
    this.STASH_API_KEY = process.env.STASH_API_KEY
  }

  callGQL = (query: String, variables = {}) =>
    axios.post(this.STASH_URL, {
      query, variables
    }, {
      headers: {
        'Content-Type': 'application/json',
        'ApiKey': this.STASH_API_KEY
      }
    })
      .then(res => {
        if (res.data?.errors) { throw new Error(`GQL Error: ${JSON.stringify(res.data?.errors)}`) }
        return res.data.data
      })
  
  getStashInfo = async () => this.callGQL(`
    query { version {
      version hash
    }}`)

  // get scraper version info
  getPkgVersion = async (id: string) => this.callGQL(`query {
    installedPackages(type: Scraper) {
      package_id version
    }}`).then(data => {
      const pkg = data.installedPackages.find((pkg: installedPackage) => pkg.package_id === id)
      return pkg ? pkg.version : null
    })

  checkUpdatePackages = async (force = false) => {
    const lastUpdate = await getLastScraperUpdate()
    // check if key exists
    if (force || !lastUpdate) {
      console.log("Updating scrapers...")
      await this.updateScrapers()
        .then(jobId => this.awaitJobFinished(jobId))
      // update user agent
      const userAgent = await getChromeUA()
      console.log(`Updating scraper user-agent to: ${userAgent}`)
      await this.updateUA(userAgent)
      console.log("Scrapers updated")
      // reload scrapers
      await this.callGQL(`mutation { reloadScrapers }`)
    } else {
      console.log("Scrapers already up to date")
    }
  }

  getJobStatus = async (jobId: Number) =>
    this.callGQL(`query ($id: ID!) {
      findJob(input: { id: $id }) {
        status
      }}`, { id: jobId })

  awaitJobFinished = async (jobId: Number) =>
    new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        const status = await this.getJobStatus(jobId)
          .then(data => data.findJob?.status)
        console.log(`Job status: ${status}`)
        if (status === 'FINISHED') {
          clearInterval(interval)
          resolve(true)
        } else if (status === 'FAILED') {
          clearInterval(interval)
          reject(new Error('Job failed'))
        }
      }, 100)
    })

  updateScrapers = async () =>
    this.callGQL('mutation { updatePackages(type: Scraper) }')
      .then(data => data.updatePackages)
  
  getExistingScrapers = async () => this.callGQL(`query {
      installedPackages(type: Scraper) { package_id }
    }`).then(data => data.installedPackages.map((pkg: installedPackage) => pkg.package_id))
  
  installPackage = (id: String) => this.callGQL(`mutation ($id: String!) {
    installPackages(
      packages: {
        id: $id,
        sourceURL: "https://stashapp.github.io/CommunityScrapers/stable/index.yml"
      } type: Scraper
    )}`, { id })

  // get log cache (30 items)
  // https://github.com/stashapp/stash/blob/12c4e1f61c49cd4e625a62e9bde7df9e02c0c47c/internal/log/logger.go#L113
  getLogs = async (startTime: Date) => this.callGQL(`{ logs { time level message } }`)
    .then(data => data.logs.reverse()) // reverse to get latest first
    .then(logs => logs.filter((log: logEntry) => new Date(log.time).getTime() >= startTime.getTime() - 2000)) // filter logs after start time

  updateUA = async (userAgent: String) => this.callGQL(`mutation ($userAgent: String!) {
    configureScraping(input: { scraperUserAgent: $userAgent })
    { scraperUserAgent }}`, { userAgent })

  migrateDatabase = async () => this.callGQL(`mutation {
    migrate(input: { backupPath: "/dev/null" })
  }`)

  scrape(url: string, scrapeType: ScrapeTypeTypings) {
    const queryMap = new Map([
      ['performer', performerQuery],
      ['scene', sceneQuery],
      ['gallery', galleryQuery],
      ['image', imageQuery],
      ['group', groupQuery],
    ])
    // catch unknown scrape type
    if (!queryMap.has(scrapeType)) {
      throw new Error(`Unknown scrape type: ${scrapeType}`)
    }
    const queryString = queryMap.get(scrapeType) as string
    return this.callGQL(queryString, { url })
      .then(data => cleanScrapeResult(data[Object.keys(data)[0]]))
  }

  async startScrape(url: string, scrapeType: ScrapeTypeTypings) {
    const stashInfo = await this.getStashInfo()
    let error, result
    try {
      result = await this.scrape(url, scrapeType)
    } catch (err: unknown) {
      error = (err as Error).message
      console.error(`Error during scrape: ${(err as Error).message}`)
    }
    return {
      result,
      error,
      runnerInfo: {
        url,
        scrapeType,
        date: new Date().toISOString(),
      },
      stashInfo
    }
  }

  urlSeachScrapers = async (url: string) => scraperSearch(url, this)
}

// generic helpers
function cleanScrapeResult(result: Record<string, any>) {
  const cleaned: Record<string, any> = {}
  for (const [key, value] of Object.entries(result)) {
    if (value == null) cleaned[key] = null
    else if (typeof value == 'string') cleaned[key] = value
    else if (Array.isArray(value)) {
      // if array of objects, map name out, otherwise leave intact
      if (typeof value[0] == 'string') {
        // leave as is
        cleaned[key] = value
      } else if (typeof value[0] === 'object') {
        // if array of objects, map name out
        cleaned[key] = value.map(item => item?.name)
      }
    }
    else if (value?.name) {
      // if object with name, just return name
      cleaned[key] = value.name
    }
  }
  return cleaned
}

// get chrome useragent
const getChromeUA = () =>
  axios.get("https://jnrbsn.github.io/user-agents/user-agents.json")
    .then(res => res.data)
    .then(userAgents => userAgents[3])

// static query definitions
const performerQuery = `query ($url: String!) {
  scrapePerformerURL(url: $url) {
    name aliases gender
    details
    birthdate career_length death_date
    height measurements weight
    hair_color eye_color
    country ethnicity
    circumcised penis_length
    fake_tits
    piercings tattoos
    urls 
    tags { name }
  }}`

const sceneQuery = `query ($url: String!) {
  scrapeSceneURL(url: $url) {
    title
    code
    date
    director
    duration
    details
    urls
    performers { name } studio { name }
    groups { name } movies { name }
    tags { name } 
  }}`

const galleryQuery = `query ($url: String!) {
  scrapeGalleryURL(url: $url) {
    title date code
    photographer urls
    details
    studio { name }
    performers { name }
    tags { name }
  }}`

const imageQuery = `query ($url: String!) {
  scrapeImageURL(url: $url) {
    title date code
    photographer urls
    details
    studio { name }
    performers { name }
    tags { name }
  }}`

const groupQuery = `query ($url: String!) {
  scrapeGroupURL(url: $url) {
    name aliases
    date duration director
    rating urls synopsis
    studio { name } tags { name }
  }}`
