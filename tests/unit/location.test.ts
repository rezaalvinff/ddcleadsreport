import { describe, expect, it, vi } from "vitest";
import { PROVINCES } from "@/lib/location/data";
import { classifyDomicile, resolveSubmittedRegion, type ClassifyDeps, type LearnedMapping } from "@/lib/location/classify";
import { datasetCityCount, matchLocation, normalizeLocation, regionForProvince } from "@/lib/location/match";
import type { AiLocationResult } from "@/lib/location/gemini";

const noCache: ClassifyDeps = { findLearned: async () => null };

describe("mandatory region classification cases", () => {
  const cases: Array<[string, string]> = [
    ["Balikpapan", "SUMATERA & KALIMANTAN"],
    ["Muara Bungo", "SUMATERA & KALIMANTAN"],
    ["Jambi", "SUMATERA & KALIMANTAN"],
    ["Medan", "SUMATERA & KALIMANTAN"],
    ["Bandung", "JAWA BARAT"],
    ["Bogor", "JABODETABEK"],
    ["Jakarta Barat", "JABODETABEK"],
    ["Tangerang", "BANTEN"],
    ["Surabaya", "JAWA TIMUR"],
  ];

  it.each(cases)("%s -> %s via the deterministic dataset without calling Gemini", async (input, region) => {
    const resolveWithAi = vi.fn();
    const result = await classifyDomicile(input, { ...noCache, resolveWithAi });
    expect(result).toMatchObject({ status: "resolved", method: "mapped", region });
    expect(resolveWithAi).not.toHaveBeenCalled();
  });

  it("returns the province and city for the mandatory cases", () => {
    expect(matchLocation("Muara Bungo")).toMatchObject({ kind: "resolved", place: { city: "Kabupaten Bungo", province: "Jambi" } });
    expect(matchLocation("Jambi")).toMatchObject({ kind: "resolved", place: { city: "Kota Jambi", province: "Jambi" } });
    expect(matchLocation("Balikpapan")).toMatchObject({ kind: "resolved", place: { city: "Kota Balikpapan", province: "Kalimantan Timur" } });
    expect(matchLocation("Bandung")).toMatchObject({ kind: "resolved", place: { city: "Bandung", province: "Jawa Barat" } });
  });
});

describe("other reporting rules", () => {
  it.each([
    ["Depok", "JABODETABEK"],
    ["Kota Bekasi", "JABODETABEK"],
    ["Cikarang", "JABODETABEK"],
    ["Jakarta", "JABODETABEK"],
    ["Garut", "JAWA BARAT"],
    ["Tasikmalaya", "JAWA BARAT"],
    ["Cirebon", "JAWA BARAT"],
    ["Kab. Bandung Barat", "JAWA BARAT"],
    ["Tangerang Selatan", "BANTEN"],
    ["Serang", "BANTEN"],
    ["Cilegon", "BANTEN"],
    ["BSD", "BANTEN"],
    ["Malang", "JAWA TIMUR"],
    ["Sidoarjo", "JAWA TIMUR"],
    ["Kediri", "JAWA TIMUR"],
    ["Jember", "JAWA TIMUR"],
    ["Pontianak", "SUMATERA & KALIMANTAN"],
    ["Banda Aceh", "SUMATERA & KALIMANTAN"],
    ["Bandar Lampung", "SUMATERA & KALIMANTAN"],
    ["Tanjung Selor", "SUMATERA & KALIMANTAN"],
    ["balik papan", "SUMATERA & KALIMANTAN"],
    ["Bandung, Jawa Barat", "JAWA BARAT"],
    ["Kalimantan Timur", "SUMATERA & KALIMANTAN"],
    ["Bekasi Timur", "JABODETABEK"],
  ])("%s -> %s", async (input, region) => {
    expect(await classifyDomicile(input, noCache)).toMatchObject({ status: "resolved", region });
  });

  it("flags locations outside the five regions instead of assigning one", async () => {
    const result = await classifyDomicile("Semarang", noCache);
    expect(result).toMatchObject({ status: "needs_confirmation", reason: "outside" });
  });

  it("flags names that exist in different regions as ambiguous", async () => {
    expect(await classifyDomicile("Banjar", noCache)).toMatchObject({ status: "needs_confirmation", reason: "ambiguous" });
    expect(await classifyDomicile("Kota Banjar", noCache)).toMatchObject({ status: "resolved", region: "JAWA BARAT" });
    expect(await classifyDomicile("Kabupaten Banjar", noCache)).toMatchObject({ status: "resolved", region: "SUMATERA & KALIMANTAN" });
  });

  it("does not resolve the Jawa Barat province alone because it spans two regions", async () => {
    expect(await classifyDomicile("Jawa Barat", noCache)).toMatchObject({ status: "needs_confirmation", reason: "province_only" });
  });

  it("does not trust partial matches without confirmation", async () => {
    const result = await classifyDomicile("Batu Ceper", noCache);
    expect(result).toMatchObject({ status: "needs_confirmation", reason: "partial" });
  });

  it("asks for manual confirmation for unknown text when Gemini is not configured", async () => {
    expect(await classifyDomicile("Xyzabc", noCache)).toMatchObject({ status: "needs_confirmation", reason: "ai_unavailable" });
  });
});

describe("dataset integrity", () => {
  it("contains all 514 kota/kabupaten across 38 provinces", () => {
    expect(PROVINCES).toHaveLength(38);
    expect(datasetCityCount()).toBe(514);
  });

  it("has alias targets that exist in their province", () => {
    const generic = new Set(["Jakarta", "Madura", "Lombok"]);
    for (const p of PROVINCES) {
      for (const [alias, raw] of Object.entries(p.aliases ?? {})) {
        const [prefix, target] = raw.includes(":") ? raw.split(":") : [null, raw];
        if (generic.has(target!)) continue;
        const pool = prefix === "kota" ? p.kota : prefix === "kab" ? p.kabupaten : [...p.kota, ...p.kabupaten];
        expect(pool, `${alias} -> ${raw} (${p.province})`).toContain(target);
      }
    }
  });

  it("normalises punctuation and case", () => {
    expect(normalizeLocation("  Kab. Muko-Muko!! ")).toBe("kab muko muko");
  });

  it("derives regions from provinces for AI validation", () => {
    expect(regionForProvince("Jawa Barat", "Bekasi")).toBe("JABODETABEK");
    expect(regionForProvince("Jawa Barat", "Garut")).toBe("JAWA BARAT");
    expect(regionForProvince("Jawa Barat", null)).toBeUndefined();
    expect(regionForProvince("Jambi", null)).toBe("SUMATERA & KALIMANTAN");
    expect(regionForProvince("Jawa Tengah", "Semarang")).toBeNull();
    expect(regionForProvince("Atlantis", null)).toBeUndefined();
  });
});

describe("Gemini fallback", () => {
  const ai = (over: Partial<AiLocationResult>): AiLocationResult => ({
    recognized: true,
    city: "Balikpapan",
    city_type: "kota",
    province: "Kalimantan Timur",
    reporting_region: "SUMATERA & KALIMANTAN",
    confidence: "high",
    note: null,
    ...over,
  });

  it("uses Gemini only for unresolved text and sends only the domicile", async () => {
    const resolveWithAi = vi.fn(async () => ai({}));
    const saveLearned = vi.fn(async () => {});
    const result = await classifyDomicile("Balikpapn", { ...noCache, resolveWithAi, saveLearned });
    expect(resolveWithAi).toHaveBeenCalledWith("Balikpapn");
    expect(result).toMatchObject({ status: "resolved", method: "ai", region: "SUMATERA & KALIMANTAN", province: "Kalimantan Timur" });
    expect(saveLearned).toHaveBeenCalledWith(expect.objectContaining({ normalizedName: "balikpapn", source: "ai", confidence: "high" }));
  });

  it("uses the cache instead of calling Gemini again", async () => {
    const cached: LearnedMapping = {
      normalizedName: "balikpapn", city: "Kota Balikpapan", province: "Kalimantan Timur",
      region: "SUMATERA & KALIMANTAN", source: "ai", confidence: "high",
    };
    const resolveWithAi = vi.fn();
    const result = await classifyDomicile("Balikpapn", { findLearned: async () => cached, resolveWithAi });
    expect(result).toMatchObject({ status: "resolved", method: "ai" });
    expect(resolveWithAi).not.toHaveBeenCalled();
  });

  it("requires confirmation when Gemini is not confident", async () => {
    const result = await classifyDomicile("Qwerty", { ...noCache, resolveWithAi: async () => ai({ confidence: "medium" }) });
    expect(result).toMatchObject({ status: "needs_confirmation", reason: "low_confidence" });
  });

  it("rejects a Gemini region that contradicts its own province", async () => {
    const result = await classifyDomicile("Qwerty", {
      ...noCache,
      resolveWithAi: async () => ai({ reporting_region: "JAWA TIMUR" }),
    });
    expect(result).toMatchObject({ status: "needs_confirmation", reason: "low_confidence" });
  });

  it("never invents a region when Gemini does not recognise the text", async () => {
    const result = await classifyDomicile("Qwerty", {
      ...noCache,
      resolveWithAi: async () => ai({ recognized: false, city: null, province: null, reporting_region: "UNKNOWN", confidence: "low" }),
    });
    expect(result).toMatchObject({ status: "needs_confirmation", reason: "not_found" });
  });

  it("reports Gemini failures instead of guessing", async () => {
    const result = await classifyDomicile("Qwerty", {
      ...noCache,
      resolveWithAi: async () => {
        throw new Error("timeout");
      },
    });
    expect(result).toMatchObject({ status: "needs_confirmation", reason: "ai_error" });
  });
});

describe("server-side validation of the submitted region", () => {
  it("keeps the deterministic method when the user accepts it", async () => {
    const server = await classifyDomicile("Medan", noCache);
    expect(resolveSubmittedRegion(server, "SUMATERA & KALIMANTAN")).toMatchObject({ method: "mapped", city: "Kota Medan" });
  });

  it("marks a corrected region as manual", async () => {
    const server = await classifyDomicile("Medan", noCache);
    expect(resolveSubmittedRegion(server, "BANTEN")).toMatchObject({ method: "manual", city: null, learnManual: false });
  });

  it("picks the candidate matching the chosen region for ambiguous input", async () => {
    const server = await classifyDomicile("Banjar", noCache);
    expect(resolveSubmittedRegion(server, "JAWA BARAT")).toMatchObject({ method: "manual", province: "Jawa Barat", learnManual: false });
  });

  it("learns manual confirmations of unknown locations", async () => {
    const server = await classifyDomicile("Xyzabc", noCache);
    expect(resolveSubmittedRegion(server, "BANTEN")).toMatchObject({ method: "manual", learnManual: true });
  });
});
