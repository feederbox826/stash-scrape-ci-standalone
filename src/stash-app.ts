import { getLastScraperUpdate, setLastScraperUpdate } from "./db"
import { scraperSearch } from "./scraper-index"
import { installedPackage, logEntry } from "../types/stashapp"
import axios from "axios"
import { sceneResult, cleanSceneResult, stashInfo, partialJobResult } from "../types/jobResult"

export class StashApp {
  private STASH_URL: string
  private STASH_API_KEY: string | undefined
  constructor() {
    this.STASH_URL = process.env.STASH_URL || "http://localhost:9999/graphql"
    this.STASH_API_KEY = process.env.STASH_API_KEY
  }

  callGQL = (query: string, variables = {}) =>
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
  
  getStashInfo = async (): Promise<stashInfo> => this.callGQL(`
    query { version {
      version hash
    }}`)

  // get scraper version info
  getPkgVersion = async (id: string): Promise<string | undefined> => this.callGQL(`query {
    installedPackages(type: Scraper) {
      package_id version
    }}`).then(data => {
      const pkg = data.installedPackages.find((pkg: installedPackage) => pkg.package_id === id)
      return pkg?.version
    })

  checkUpdatePackages = async (force = false) => {
    const lastUpdate = await getLastScraperUpdate()
    // check if within update period
    if (force || !lastUpdate) {
      console.log("Updating scrapers...")
      await this.updateScrapers()
        .then(jobId => this.awaitJobFinished(jobId))
      // update user agent
      getChromeUA()
        .then(userAgent => this.updateUA(userAgent))
      console.log("Scrapers updated")
      // reload scrapers
      await this.callGQL(`mutation { reloadScrapers }`)
      // push update
      setLastScraperUpdate()
    } else {
      console.log("Scrapers already up to date")
    }
  }

  getJobStatus = async (jobId: Number): Promise<"FINISHED" | "FAILED" | "RUNNING" | "PENDING"> =>
    this.callGQL(`query ($id: ID!) {
      findJob(input: { id: $id }) {
        status
      }}`, { id: jobId })
      .then(data => data?.findJob.status)

  awaitJobFinished = async (jobId: Number) =>
    new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        const status = await this.getJobStatus(jobId)
        if (status === 'FINISHED') {
          clearInterval(interval)
          resolve(true)
        } else if (status === 'FAILED') {
          clearInterval(interval)
          reject(new Error('Job failed'))
        }
      }, 100)
    })

  updateScrapers = async (): Promise<number> =>
    this.callGQL('mutation { updatePackages(type: Scraper) }')
      .then(data => data.updatePackages)

  getExistingScrapers = async (): Promise<string[]> => this.callGQL(`query {
      installedPackages(type: Scraper) { package_id }
    }`).then(data => data.installedPackages.map((pkg: installedPackage) => pkg.package_id))

  installPackage = (id: String): Promise<number> => this.callGQL(`mutation ($id: String!) {
    installPackages(
      packages: {
        id: $id,
        sourceURL: "https://stashapp.github.io/CommunityScrapers/stable/index.yml"
      } type: Scraper
    )}`, { id })
    .then(data => data.installPackages)

  // get log cache (30 items)
  // https://github.com/stashapp/stash/blob/12c4e1f61c49cd4e625a62e9bde7df9e02c0c47c/internal/log/logger.go#L113
  getLogs = async (startTime: Date): Promise<logEntry[]> => this.callGQL(`{ logs { time level message } }`)
    .then(data => data.logs.reverse()) // reverse to get latest first
    .then((logs: logEntry[]) => logs.filter(log => new Date(log.time).getTime() >= startTime.getTime() - 2000)) // filter logs after start time

  updateUA = async (userAgent: String): Promise<void> => this.callGQL(`mutation ($userAgent: String!) {
    configureScraping(input: { scraperUserAgent: $userAgent })
    { scraperUserAgent }}`, { userAgent })

  migrateDatabase = async (): Promise<void> => this.callGQL(`mutation {
    migrate(input: { backupPath: "/dev/null" })
  }`)

  scrape = (url: string): Promise<cleanSceneResult> =>
    this.callGQL(sceneQuery, { url })
      .then(data => cleanScrapeResult(data.scrapeSceneURL))

  async startScrape(url: string): Promise<partialJobResult> {
    const stashInfo = await this.getStashInfo()
    let error, result
    try {
      result = await this.scrape(url)
    } catch (err: unknown) {
      error = (err as Error).message
      console.error(`Error during scrape: ${(err as Error).message}`)
    }
    return {
      result,
      error,
      runnerInfo: {
        url,
        scrapeType: "scene",
        date: new Date().toISOString(),
      },
      stashInfo
    }
  }

  urlSeachScrapers = async (url: string) => scraperSearch(url, this)
}

// generic helpers
function cleanScrapeResult(result: sceneResult): cleanSceneResult {
  const cleaned: Record<string, string | null | string[]> = {}
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
  return cleaned as unknown as cleanSceneResult
}

// get chrome useragent
const getChromeUA = (): Promise<string> =>
  axios.get("https://jnrbsn.github.io/user-agents/user-agents.json")
    .then(res => res.data)
    .then(userAgents => userAgents[3])

// static query definitions
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