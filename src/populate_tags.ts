import axios from "axios";
import { tagCollection } from "./db";

const stashdb = axios.create({
  baseURL: "https://stashdb.org/graphql",
  headers: {
    "Content-Type": "application/json",
    "User-Agent": "scrape-ci-standalone/1.0",
    "ApiKey": process.env.STASHDB_API_KEY
  }
});

// get all tags, aliases and stashids for mappings

export const getTags = (page = 1) => stashdb.post("", {
  query: `
   query ($page: Int!) { queryTags(input: { page: $page, per_page: 100 }) {
    tags {
      id
      name
      aliases
    }}}`,
  variables: { page }
}).then(res => res.data.data.queryTags.tags);

const getAllTags = async() => {
  let allTags: {id: string, name: string, aliases: string[]}[] = []
  let page = 1
  while (true) {
    const tags = await getTags(page)
    if (tags.length === 0) break
    allTags = allTags.concat(tags)
    page++
  }
  return allTags
}

// flatten tags for mongodb insertion
export const createTagMappings = async () => {
  // check if collection has any documents
  const count = await tagCollection.countDocuments()
  if (count > 0) {
    console.log("Tag mappings already exist, skipping creation")
    return
  }
  const allTags = await getAllTags()
  const tagMappings: {id: string, name: string, lookup: string[]}[] = []
  for (const tag of allTags) {
    tagMappings.push({
      id: tag.id,
      name: tag.name,
      lookup: [tag.name.toLowerCase(), ...tag.aliases.map(alias => alias.toLowerCase())]
    })
  }
  // insertmany
  await tagCollection.insertMany(tagMappings)
}