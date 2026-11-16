import type { ReportingRegion } from "../constants";
import { normalizeLocation } from "../location/match";
import type { Dealer } from "./types";

/**
 * Picks the dealer a prospect from this location should go to.
 *
 * There are no coordinates for dealers or for domiciles, so "nearest" is not a
 * straight-line distance. It is answered from data the app actually holds, best
 * evidence first:
 *
 *   1. history  — the dealer this same location was routed to before, which is
 *                 the user's own routing decision and beats any guess;
 *   2. city     — a dealer sitting in the domicile's own kota/kabupaten;
 *   3. province — a dealer in the same province;
 *   4. region   — a dealer in the same reporting region.
 *
 * Within one tier the dealer that has taken the most prospects so far wins, so
 * the suggestion converges on how the branches are really used. Nothing is
 * suggested when no tier matches.
 */

export type SuggestionBasis = "history" | "city" | "province" | "region";

export interface DealerSuggestion {
  dealerId: string;
  dealerName: string;
  basis: SuggestionBasis;
  /** Shown under the Dealer field so the pick is never silent. */
  reason: string;
}

export interface SuggestPlace {
  city: string | null;
  province: string | null;
  region: ReportingRegion | null;
}

/** Dealer cities are stored bare ("Bandung"); the classifier returns "Kota Bandung". */
function cityKey(name: string): string {
  return normalizeLocation(name).replace(/^(kota|kabupaten|kab)\s+/, "");
}

function pickByLoad(dealers: Dealer[], load: Map<string, number>): Dealer {
  return [...dealers].sort(
    (a, b) => (load.get(b.id) ?? 0) - (load.get(a.id) ?? 0) || a.dealer_name.localeCompare(b.dealer_name),
  )[0]!;
}

export interface SuggestInput {
  place: SuggestPlace;
  dealers: Dealer[];
  /** dealer id -> prospects routed there from this very location. */
  historyHere: Map<string, number>;
  /** dealer id -> prospects routed there overall, used to break ties. */
  loadOverall: Map<string, number>;
}

export function suggestDealer({ place, dealers, historyHere, loadOverall }: SuggestInput): DealerSuggestion | null {
  const active = dealers.filter((d) => d.is_active);
  if (active.length === 0) return null;

  const byId = new Map(active.map((d) => [d.id, d]));
  const seen = [...historyHere].filter(([id]) => byId.has(id)).sort((a, b) => b[1] - a[1]);
  const top = seen[0];
  if (top) {
    const dealer = byId.get(top[0])!;
    return {
      dealerId: dealer.id,
      dealerName: dealer.dealer_name,
      basis: "history",
      reason: `Biasanya prospek dari sini dikirim ke dealer ini (${top[1]} prospek sebelumnya).`,
    };
  }

  if (place.city) {
    const key = cityKey(place.city);
    const sameCity = active.filter((d) => cityKey(d.city) === key);
    if (sameCity.length > 0) {
      const dealer = pickByLoad(sameCity, loadOverall);
      return {
        dealerId: dealer.id,
        dealerName: dealer.dealer_name,
        basis: "city",
        reason:
          sameCity.length === 1
            ? `Satu kota dengan domisili (${place.city}).`
            : `Satu kota dengan domisili (${place.city}); ${sameCity.length} dealer di kota ini, dipilih yang paling sering dipakai.`,
      };
    }
  }

  if (place.province) {
    const key = normalizeLocation(place.province);
    const sameProvince = active.filter((d) => d.province && normalizeLocation(d.province) === key);
    if (sameProvince.length > 0) {
      const dealer = pickByLoad(sameProvince, loadOverall);
      return {
        dealerId: dealer.id,
        dealerName: dealer.dealer_name,
        basis: "province",
        reason: `Dealer terdekat yang ada di ${place.province}. Ganti bila cabang lain lebih pas.`,
      };
    }
  }

  if (place.region) {
    const sameRegion = active.filter((d) => d.reporting_region === place.region);
    if (sameRegion.length > 0) {
      const dealer = pickByLoad(sameRegion, loadOverall);
      return {
        dealerId: dealer.id,
        dealerName: dealer.dealer_name,
        basis: "region",
        reason:
          sameRegion.length === 1
            ? `Satu-satunya dealer di ${place.region}.`
            : `Belum ada riwayat untuk domisili ini. Dipilih dealer ${place.region} yang paling sering dipakai — cek lagi sebelum submit.`,
      };
    }
  }

  return null;
}
