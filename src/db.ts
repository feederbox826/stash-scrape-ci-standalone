import { MongoClient } from "mongodb";
import { ScrapeTypeArr, ScrapeTypeTypings } from "./utils";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/stash-ci";
const client = new MongoClient(uri);

const db = client.db();

export async function connect() {
  await client.connect();
  const db = client.db("stash-ci");
  return db;
}

export async function createIndex() {
  const db = await connect();
  // create indexes for each collection
  const collections = ScrapeTypeArr;
  for (const coll of collections) {
    const collection = db.collection(coll);
    await collection.createIndex({ url: 1 }, { unique: true });
    await collection.createIndex({ jobId: 1 }, { unique: true });
  }
  // tags index
  const tagCollection = db.collection("tags");
  await tagCollection.createIndex({ lookup: 1 }, { unique: true });
}

export async function getResult(type: ScrapeTypeTypings, lookup: string) {
  const validCollection = ScrapeTypeArr.includes(type);
  if (!validCollection) {
    throw new Error(`Invalid scrape type: ${type}`);
  }
  const collection = db.collection(type);
  const doc = await collection.findOne({ $or: [{ jobId: lookup }, { url: lookup }] });
  return doc ? doc : null;
}

export async function addResult(type: ScrapeTypeTypings, cachedResult: any, url: string) {
  const validCollection = ScrapeTypeArr.includes(type);
  if (!validCollection) {
    throw new Error(`Invalid scrape type: ${type}`);
  }
  const collection = db.collection(type);
  await collection.insertOne({
    url,
    ...cachedResult
  });
}

// db structure
// maintain seperate collection for each entity type
// performer, scene, gallery, image, group
// index by URL and jobId

// config
// stores scraperLastUpdate timestamp
const configCollection = db.collection("config");
export const getLastScraperUpdate = async (): Promise<boolean> => {
  const doc = await configCollection.findOne({ key: "scraperLastUpdate" });
  // time greater than 24 hours ago
  return doc ? new Date(doc.value).getTime() <= new Date().getTime() - 1000 * 60 * 60 * 24 : false;
}
export const setLastScraperUpdate = async () => {
  await configCollection.updateOne(
    { key: "scraperLastUpdate" },
    { $set: { value: new Date().toISOString() } },
    { upsert: true }
  );
}

// tags
// stores tag aliases
export const tagCollection = db.collection("tags");
export const getTagMappings = async (tags: String[]): Promise<{id?: string, name: string}[]> => {
  // convert tags to lowercase
  const lowerTags = [... new Set(tags.map(tag => tag.toLowerCase()))];
  const mappings: {id?: string, name: string}[] = [];
  for (const tag of lowerTags) {
    const match = await tagCollection.findOne({ lookup: tag });
    if (match) {
      mappings.push({id: match.id, name: match.name});
    } else {
      mappings.push({name: tag});
    }
  }
  return mappings;
}