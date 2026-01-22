import { logEntry } from "./stashapp";

export interface partialJobResult {
  result?: cleanSceneResult;
  error?: string;
  runnerInfo: runnerInfo;
  stashInfo: stashInfo;
}

export interface jobResult {
  result: completeSceneResult;
  runnerInfo: runnerInfo;
  stashInfo: stashInfo;
  jobId: string; // nanoid generated id with limited alphabet
  logs: logEntry[];
}

export type tag = { id?: string; name: string };

export interface runnerInfo {
  scraperId?: string;
  scraperVersion?: string;
  url: string;
  scrapeType: "scene";
  date: string; // ISO date string
}

export interface stashInfo {
  version: string;
  hash: string;
}

export interface sceneResult {
  title: string;
  code: string;
  date: string;
  director: string;
  duration: string;
  details: string;
  urls: string[];
  performers: { name: string }[];
  studio: { name: string }[];
  groups: { name: string }[]
  movies: { name: string }[]
  tags: { name: string }[];
}

export interface cleanSceneResult {
  title: string;
  code: string | null;
  date: string | null;
  director: string | null;
  duration: string | null;
  details: string | null;
  urls: string[] | null;
  performers: string[] | null;
  studio: string | null;
  groups: string[] | null;
  movies: string[] | null;
  tags: string[];
}

export interface completeSceneResult {
  title: string;
  code: string | null;
  date: string | null;
  director: string | null;
  duration: string | null;
  details: string | null;
  urls: string[] | null;
  performers: string[] | null;
  studio: string | null;
  groups: string[] | null;
  movies: string[] | null;
  tags: tag[];
}