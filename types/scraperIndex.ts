// https://github.com/stashapp/CommunityScrapers/blob/389a889874eddb9caa36abf21f6d26f45b5e4a97/site_generator/src/scraper.ts#L35
// AGPL-3.0

interface searchTypes {
  scene: {
    name: boolean;
    fragment: boolean;
    queryFragment: boolean;
    url: boolean;
  };
  performer: {
    name: boolean;
    url: boolean;
  };
  group: {
    url: boolean;
  };
  gallery: {
    url: boolean;
    fragment: boolean;
  };
  image: {
    url: boolean;
    fragment: boolean;
  };
}

export interface scraperExport {
  filename: string;
  name: string;
  sites: string[];
  hosts?: string[]; // for fuse searching
  scrapes?: string[];
  searchTypes: searchTypes;
  requires: {
    cdp: boolean;
    python: boolean;
  };
  lastUpdate: Date;
}