import type { ReportingRegion } from "../constants";
import { PROVINCES, type ProvinceData } from "./data";

/** Lowercase, strip diacritics and punctuation, collapse whitespace. */
export function normalizeLocation(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Spaces removed, so "Balik Papan" and "Balikpapan" share a key. */
function compactKey(normalized: string): string {
  return normalized.replace(/ /g, "");
}

export type CityType = "kota" | "kabupaten";

export interface LocationPlace {
  /** Display name, e.g. "Kota Bandung", "Kabupaten Bungo" or "Bandung" when the type is unknown. */
  city: string | null;
  province: string | null;
  region: ReportingRegion | null;
}

interface CityEntry {
  kind: "city";
  name: string;
  type: CityType | null;
  province: ProvinceData;
  region: ReportingRegion | null;
}

interface ProvinceEntry {
  kind: "province";
  province: ProvinceData;
}

type Entry = CityEntry | ProvinceEntry;

function cityRegion(province: ProvinceData, cityName: string): ReportingRegion | null {
  return province.cityRegions?.[cityName] ?? province.region;
}

function buildIndex(): Map<string, Entry[]> {
  const index = new Map<string, Entry[]>();
  const add = (key: string, entry: Entry) => {
    const k = compactKey(normalizeLocation(key));
    if (!k) return;
    const list = index.get(k) ?? [];
    list.push(entry);
    index.set(k, list);
  };

  for (const province of PROVINCES) {
    const cityEntry = (name: string, type: CityType | null): CityEntry => ({
      kind: "city",
      name,
      type,
      province,
      region: cityRegion(province, name),
    });

    for (const name of province.kota) {
      const entry = cityEntry(name, "kota");
      add(name, entry);
      add(`kota ${name}`, entry);
      add(`kotamadya ${name}`, entry);
    }
    for (const name of province.kabupaten) {
      const entry = cityEntry(name, "kabupaten");
      add(name, entry);
      add(`kabupaten ${name}`, entry);
      add(`kab ${name}`, entry);
    }
    for (const [alias, rawTarget] of Object.entries(province.aliases ?? {})) {
      const [prefix, target] = rawTarget.includes(":") ? (rawTarget.split(":") as [string, string]) : [null, rawTarget];
      const types: CityType[] = [];
      if (prefix === "kota" || (prefix === null && province.kota.includes(target))) types.push("kota");
      if (prefix === "kab" || (prefix === null && province.kabupaten.includes(target))) types.push("kabupaten");
      if (types.length === 0) {
        // Generic place that is not itself a kota/kabupaten (e.g. "Jakarta", "Madura").
        add(alias, cityEntry(target, null));
      } else {
        for (const type of types) add(alias, cityEntry(target, type));
      }
    }

    const provinceEntry: ProvinceEntry = { kind: "province", province };
    add(province.province, provinceEntry);
    add(`provinsi ${province.province}`, provinceEntry);
    for (const alias of province.provinceAliases ?? []) add(alias, provinceEntry);
  }

  // When a key is both a city and its province (e.g. "Jambi", "Bengkulu",
  // "Gorontalo"), the city wins: someone typing "Jambi" means Kota Jambi.
  for (const [key, entries] of index) {
    const cities = entries.filter((e): e is CityEntry => e.kind === "city");
    const provinces = entries.filter((e): e is ProvinceEntry => e.kind === "province");
    if (cities.length > 0 && provinces.length > 0 && provinces.every((p) => cities.some((c) => c.province === p.province))) {
      index.set(key, cities);
    }
  }
  return index;
}

const INDEX = buildIndex();
const MAX_NGRAM = 6;

interface TokenMatch {
  start: number;
  end: number;
  entries: Entry[];
}

/** Words that carry no location meaning of their own. */
const FILLER_WORDS = new Set([
  "kota", "kabupaten", "kab", "kotamadya", "kodya", "kec", "kecamatan", "kel", "kelurahan", "desa", "ds",
  "provinsi", "prov", "propinsi", "daerah", "wilayah", "area", "sekitar", "dan", "di", "dekat",
  "barat", "timur", "utara", "selatan", "tengah", "pusat", "jl", "jln", "jalan", "raya", "no", "rt", "rw",
  "indonesia", "domisili",
]);

/** Longest-first, non-overlapping n-gram matches within one text segment. */
function matchSegment(tokens: string[]): { matches: TokenMatch[]; unmatched: string[] } {
  const matches: TokenMatch[] = [];
  const used = new Array<boolean>(tokens.length).fill(false);
  for (let len = Math.min(MAX_NGRAM, tokens.length); len >= 1; len--) {
    for (let start = 0; start + len <= tokens.length; start++) {
      if (used.slice(start, start + len).some(Boolean)) continue;
      const entries = INDEX.get(tokens.slice(start, start + len).join(""));
      if (!entries) continue;
      matches.push({ start, end: start + len, entries });
      for (let i = start; i < start + len; i++) used[i] = true;
    }
  }
  const unmatched = tokens.filter((t, i) => !used[i] && !FILLER_WORDS.has(t) && !/^\d+$/.test(t));
  return { matches, unmatched };
}

export type DeterministicResult =
  /** exact: every meaningful word of the input was recognised. */
  | { kind: "resolved"; place: LocationPlace; exact: boolean }
  | { kind: "outside"; places: LocationPlace[] }
  | { kind: "ambiguous"; places: LocationPlace[] }
  | { kind: "province_only"; province: string }
  | { kind: "not_found" };

function placeLabel(name: string, types: Set<CityType | null>): string {
  if (types.size !== 1) return name;
  const [type] = [...types];
  if (type === "kota") return name.startsWith("Jakarta") ? name : `Kota ${name}`;
  if (type === "kabupaten") return `Kabupaten ${name}`;
  return name;
}

function groupPlaces(entries: CityEntry[]): LocationPlace[] {
  const groups = new Map<string, { name: string; province: ProvinceData; region: ReportingRegion | null; types: Set<CityType | null> }>();
  for (const e of entries) {
    const key = `${e.name}|${e.province.province}`;
    const group = groups.get(key) ?? { name: e.name, province: e.province, region: e.region, types: new Set() };
    group.types.add(e.type);
    groups.set(key, group);
  }
  return [...groups.values()].map((g) => ({
    city: placeLabel(g.name, g.types),
    province: g.province.province,
    region: g.region,
  }));
}

/**
 * Deterministic classification against the built-in dataset. Never guesses:
 * conflicting matches are reported as ambiguous.
 */
export function matchLocation(text: string): DeterministicResult {
  const segments = text
    .split(/[,;/()|]|\s-\s/)
    .map(normalizeLocation)
    .filter(Boolean);

  let cities: CityEntry[] = [];
  const provinces = new Set<ProvinceData>();
  let exact = true;
  for (const segment of segments) {
    const { matches, unmatched } = matchSegment(segment.split(" "));
    if (unmatched.length > 0) exact = false;
    for (const match of matches) {
      for (const entry of match.entries) {
        if (entry.kind === "city") cities.push(entry);
        else provinces.add(entry.province);
      }
    }
  }

  if (cities.length > 0) {
    if (provinces.size > 0) {
      const inProvince = cities.filter((c) => provinces.has(c.province));
      if (inProvince.length > 0) cities = inProvince;
    }
    // An explicit "Kota X"/"Kabupaten X" narrows same-named places.
    const places = groupPlaces(cities);
    const regions = new Set(places.map((p) => p.region));
    if (regions.size > 1) return { kind: "ambiguous", places };
    const [region] = [...regions];
    if (region === null || region === undefined) return { kind: "outside", places };
    if (places.length === 1) return { kind: "resolved", place: places[0]!, exact };
    const provinceNames = new Set(places.map((p) => p.province));
    return {
      kind: "resolved",
      place: { city: null, province: provinceNames.size === 1 ? places[0]!.province : null, region },
      exact,
    };
  }

  if (provinces.size === 1) {
    const [province] = [...provinces] as [ProvinceData];
    if (province.regionNeedsCity) return { kind: "province_only", province: province.province };
    if (province.region === null) return { kind: "outside", places: [{ city: null, province: province.province, region: null }] };
    return { kind: "resolved", place: { city: null, province: province.province, region: province.region }, exact };
  }
  if (provinces.size > 1) {
    const places = [...provinces].map((p) => ({ city: null, province: p.province, region: p.regionNeedsCity ? null : p.region }));
    return { kind: "ambiguous", places };
  }
  return { kind: "not_found" };
}

/**
 * Reporting region implied by a province (+ city for Jawa Barat). Used to
 * validate Gemini output with our own rules instead of trusting the model.
 * Returns undefined when the province is unknown or the region cannot be
 * determined without a recognised city.
 */
export function regionForProvince(province: string, city: string | null): ReportingRegion | null | undefined {
  const entries = INDEX.get(compactKey(normalizeLocation(province))) ?? INDEX.get(compactKey(normalizeLocation(`provinsi ${province}`)));
  const provinceData =
    entries?.find((e): e is ProvinceEntry => e.kind === "province")?.province ??
    entries?.find((e): e is CityEntry => e.kind === "city" && normalizeLocation(e.province.province) === normalizeLocation(province))?.province;
  if (!provinceData) return undefined;
  if (!provinceData.regionNeedsCity) return provinceData.region;
  if (!city) return undefined;
  const cityMatch = matchLocation(`${city}, ${provinceData.province}`);
  if (cityMatch.kind === "resolved" && cityMatch.place.province === provinceData.province) return cityMatch.place.region;
  return undefined;
}

/** For tests: number of distinct kota/kabupaten in the dataset. */
export function datasetCityCount(): number {
  return PROVINCES.reduce((sum, p) => sum + p.kota.length + p.kabupaten.length, 0);
}
