export type installedPackage = {
  package_id: string
  version: string
  date: string
}

export type localScraper = {
  id: string,
  sites: string[]
}

export type logEntry = {
  time: string,
  level: "Trace" | "Debug" | "Info" | "Warning" | "Error",
  message: string
}