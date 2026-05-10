// import types from scraper index
import { scraperExport } from "../types/scraperIndex.js"
import { localScraper } from "../types/stashapp.js"
import axios from "axios"
import { StashApp } from "./stash-app.js"

// scraper index searcher and installer
async function searchCommunityScrapers(url: string): Promise<string[]> {
  // fetch communityScrapers
  const communityScrapers = await axios.get("https://stashapp.github.io/CommunityScrapers/assets/scrapers.json")
    .then(res => res.data as scraperExport[])
  // find scrapers that match URL
  const matchedScrapers: scraperExport[] = communityScrapers.filter((scraper) =>
    scraper.sites.some(pattern => url.includes(pattern))
  )
  // return scraper id from filename
  return matchedScrapers.map(scraper => scraper.filename.replace('../scrapers/', '').replace('.yml', '').split("/")[0])
}

// Checks scrapers locally installed on the Stash instance for one which handles `url`. Returns the IDs of any matching scrapers.
async function searchLocalScrapers(url: string, stash: StashApp): Promise<string[]> {
  const localScrapers = await stash.getLocalScrapers()
  const matchedScrapers = localScrapers.filter((scraper: localScraper) =>
    scraper.sites && scraper.sites.some(pattern => url.includes(pattern))
  )
  return matchedScrapers.map(scraper => scraper.id)
}

// handle url scrapersearch
export async function scraperSearch(url: string, stash: StashApp): Promise< { error: string } | { success: string, id: string } > {
  // check whether there is already a scraper installed for this URL
  const matchedLocalScrapers = await searchLocalScrapers(url, stash)
  // if one existing, return success
  if (matchedLocalScrapers.length == 1) {
    return {
      success: `Scraper ${matchedLocalScrapers[0]} already installed.`,
      id: matchedLocalScrapers[0]
    }
  } else if (matchedLocalScrapers.length > 1) {
    return {
      success: "Multiple scrapers already installed",
      id: matchedLocalScrapers[1]
    }
  }

  // else, search CommunityScrapers
  const matchedCommunityScrapers = await searchCommunityScrapers(url)
  // if still no results, return empty array
  if (matchedCommunityScrapers.length === 0) return { "error": "No scrapers found for the provided URL." }
  // if only one matched, install it
  if (matchedCommunityScrapers.length === 1) {
    const scraperId = matchedCommunityScrapers[0]
    console.log(`Installing scraper: ${scraperId}`)
    return stash.installPackage(scraperId)
      .then((jobId: number) => stash.awaitJobFinished(jobId))
      .then(() => ({
        success: `Scraper ${scraperId} installed successfully.`,
        id: scraperId
      }))
  } else {
    // if multiple, don't install
    return { "error": "Multiple scrapers found for the provided URL. Cowardly refusing to install." }
  }
}