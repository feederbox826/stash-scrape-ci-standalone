import { MongoClient } from "mongodb";
import { tag } from "../types/jobResult";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/stash-ci";
const client = new MongoClient(uri);

const db = client.db();
const sceneCollection = db.collection("scene");
export const tagCollection = db.collection("tags");

export async function connect() {
  await client.connect();
  const db = client.db("stash-ci");
  return db;
}

export async function createIndex() {
  // create indexes for each collection=
  await sceneCollection.createIndex({ url: 1 });
  await sceneCollection.createIndex({ jobId: 1 }, { unique: true });
  // tags index
  await tagCollection.createIndex({ lookup: 1 }, { unique: true });
}

export async function getResult(lookup: string) {
  const doc = await sceneCollection.findOne({ $or: [{ jobId: lookup }, { url: lookup }] });
  return doc ? doc : null;
}

export async function addResult(cachedResult: any, url: string) {
  await sceneCollection.insertOne({
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
  return doc ? new Date(doc.value).getTime() > new Date().getTime() - 1000 * 60 * 60 * 24 : false;
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
export const getTagMappings = async (tags: String[]): Promise<tag[]> => {
  // convert tags to lowercase
  const lowerTags = [... new Set(tags.map(tag => tag.toLowerCase()))];
  const mappings: tag[] = [];
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