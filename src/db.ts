import { MongoClient } from "mongodb";
import { ScrapeTypeArr } from "./utils";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/stash-ci";
const client = new MongoClient(uri);

export const db = client.db();

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
    await collection.createIndex({ jobID: 1 }, { unique: true });
  }
}

// db structure
// maintain seperate collection for each entity type
// performer, scene, gallery, image, group
// index by URL and jobID

// config
// stores scraperLastUpdate timestamp
export const configCollection = db.collection("config");
export const getLastScraperUpdate = async (): Promise<number | null> => {
  const doc = await configCollection.findOne({ key: "scraperLastUpdate" });
  return doc ? (doc.value as number) : null;
}

// tags
// stores tag aliases
export const tagCollection = db.collection("tags");
export const getTagMappings = async (tags: String[]): Promise<{id?: string, name: string}[]> => {
  // convert tags to lowercase
  const lowerTags = tags.map(tag => tag.toLowerCase());
  const mappings: {id?: string, name: string}[] = [];
  const search = await tagCollection.find({ search_term: { $in: lowerTags } }).toArray();
  for (const doc of search) {
    mappings.push({id: doc.stash_id, name: doc.name});
  }
  return mappings;
}