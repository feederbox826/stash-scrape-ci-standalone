// scrape types
export type ScrapeTypeTypings = string & [
  'performer',
  'scene',
  'gallery',
  'image',
  'group'
]
export const ScrapeTypeArr = [
  'performer',
  'scene',
  'gallery',
  'image',
  'group'
]

// help text
export const helpText = `
scrape-ci-standalone
  / - here
  /api/result/:id - retrieve job result
  /api/scrape - run a scrape job
    auth - authorization for the request
    url - the URL to scrape
  /api/update - force update scrapers

  /api/admin/apikey - manage API keys
    POST /api/admin/apikey - create a new API key
      note - required, a note to identify the API key
      limit - optional, number of allowed scrapes per day (default: 200)
    DELETE /api/admin/apikey - revoke an API key
      key - required, the API key to revoke

  /upload - submit a new scrape job
  /scene?id=:id - view scene result

  apikey can be in any of the following locations:
    body.auth
    ?auth= in query params
    x-api-key header 
`

export type JobID = `v0-${string}`

// short-unique-id
// https://alex7kom.github.io/nano-nanoid-cc/
// ~7 centuries for collision at 300 scrape/h
// 4 more characters
// suffix with X for version
export const genID = (len = 12): string => {
  const SYMBOLS = '346789ABCDEFGHJKLMNPQRTUVWXYabcdefghijkmnpqrtwxyz'
  let result = ''
  for (let i = 0; i < len; i++) result += SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
  return result
}

export const genJobID = (): JobID => `${genID(12)}1` as JobID