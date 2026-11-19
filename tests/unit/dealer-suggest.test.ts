import { describe, expect, it } from "vitest";
import { suggestDealer, type SuggestInput } from "@/lib/master/suggest";
import type { Dealer } from "@/lib/master/types";

const dealer = (id: string, name: string, city: string, province: string, region: Dealer["reporting_region"], active = true): Dealer => ({
  id,
  dealer_name: name,
  city,
  province,
  reporting_region: region,
  is_active: active,
});

const DEALERS: Dealer[] = [
  dealer("d1", "DIPO TANGERANG", "Tangerang", "Banten", "BANTEN"),
  dealer("d2", "DIPO CIPUTAT", "Tangerang Selatan", "Banten", "BANTEN"),
  dealer("d3", "DIPO PURI INDAH", "Jakarta Barat", "DKI Jakarta", "JABODETABEK"),
  dealer("d4", "DIPO PLUIT", "Jakarta Utara", "DKI Jakarta", "JABODETABEK"),
  dealer("d5", "DIPO RANCAEKEK", "Kabupaten Bandung", "Jawa Barat", "JAWA BARAT"),
  dealer("d6", "DIPO JAMBI", "Jambi", "Jambi", "SUMATERA & KALIMANTAN"),
  dealer("d7", "DIPO LAMA", "Tangerang", "Banten", "BANTEN", false),
];

const run = (place: SuggestInput["place"], over: Partial<SuggestInput> = {}) =>
  suggestDealer({ place, dealers: DEALERS, historyHere: new Map(), loadOverall: new Map(), ...over });

describe("dealer suggestion", () => {
  it("prefers the dealer this location was routed to before", () => {
    const result = run(
      { city: "Kota Tangerang", province: "Banten", region: "BANTEN" },
      { historyHere: new Map([["d2", 3]]) },
    );
    expect(result).toMatchObject({ dealerId: "d2", basis: "history" });
    expect(result?.reason).toContain("3 prospek");
  });

  it("falls back to a dealer in the domicile's own city", () => {
    expect(run({ city: "Kota Tangerang", province: "Banten", region: "BANTEN" })).toMatchObject({
      dealerId: "d1",
      basis: "city",
    });
  });

  it("matches a city whether or not the classifier prefixed it", () => {
    for (const city of ["Tangerang", "Kota Tangerang", "kota tangerang"]) {
      expect(run({ city, province: "Banten", region: "BANTEN" })?.dealerId, city).toBe("d1");
    }
  });

  it("uses the province when no dealer sits in that city", () => {
    expect(run({ city: "Kabupaten Lebak", province: "Banten", region: "BANTEN" })).toMatchObject({
      basis: "province",
    });
  });

  it("uses the reporting region when the province has no dealer", () => {
    const result = run({ city: "Kota Bekasi", province: "Jawa Barat", region: "JABODETABEK" });
    // Bekasi is Jawa Barat, but the Jawa Barat dealer is in another region.
    expect(result?.basis).toBe("province");
    expect(result?.dealerId).toBe("d5");
  });

  it("breaks ties with the dealer that takes the most prospects", () => {
    const result = run({ city: null, province: "DKI Jakarta", region: "JABODETABEK" }, { loadOverall: new Map([["d4", 9], ["d3", 2]]) });
    expect(result?.dealerId).toBe("d4");
  });

  it("is stable when nothing has been routed yet", () => {
    const result = run({ city: null, province: null, region: "JABODETABEK" });
    expect(result?.dealerId).toBe("d4"); // DIPO PLUIT sorts before DIPO PURI INDAH
    expect(result?.reason).toContain("cek lagi");
  });

  it("never suggests an inactive dealer, even one with history", () => {
    const result = run({ city: "Kota Tangerang", province: "Banten", region: "BANTEN" }, { historyHere: new Map([["d7", 5]]) });
    expect(result?.dealerId).toBe("d1");
  });

  it("suggests nothing when the location matches no dealer at all", () => {
    expect(run({ city: "Kota Kupang", province: "Nusa Tenggara Timur", region: null })).toBeNull();
    expect(run({ city: null, province: null, region: null })).toBeNull();
  });

  it("suggests nothing when every dealer is inactive", () => {
    expect(
      suggestDealer({
        place: { city: "Tangerang", province: "Banten", region: "BANTEN" },
        dealers: DEALERS.map((d) => ({ ...d, is_active: false })),
        historyHere: new Map(),
        loadOverall: new Map(),
      }),
    ).toBeNull();
  });

  it("always explains the pick", () => {
    for (const place of [
      { city: "Kota Tangerang", province: "Banten", region: "BANTEN" as const },
      { city: null, province: "Jambi", region: "SUMATERA & KALIMANTAN" as const },
      { city: null, province: null, region: "BANTEN" as const },
    ]) {
      expect(run(place)?.reason.length).toBeGreaterThan(10);
    }
  });
});
