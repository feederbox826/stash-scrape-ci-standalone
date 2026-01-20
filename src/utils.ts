// scrape types
export type ScrapeTypeTypings = [
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
  /api/result/:type/:url - retrieve latest job result for URL with type
  /api/scrape - run a scrape job
    auth - authorization for the request
    url - the URL to scrape
    scrapeType - the type of scrape (e.g., performer, scene, gallery, image, group)
  /api/update - force update scrapersv

  /submit - submit a new scrape job
  /scene?id=:id - view scene result
  /performer?id=:id - view performer result
  /gallery?id=:id - view gallery result
  /image?id=:id - view image result
  /group?id=:id - view group result
`

export type JobID = `v0-${string}`

// short-unique-id
// https://alex7kom.github.io/nano-nanoid-cc/
// ~7 centuries for collision at 300 scrape/h
// 4 more characters
// prefixed with vX- for visual distinction and versioning
export const genID = (len = 12): JobID => {
  const SYMBOLS = '346789ABCDEFGHJKLMNPQRTUVWXYabcdefghijkmnpqrtwxyz'
  let result = ''
  for (let i = 0; i < len; i++) result += SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
  return `v0-${result}` as JobID
}