import "server-only";
import { isReportingRegion } from "../constants";
import { dbError, type Db } from "../db/admin";
import type { LearnedMapping } from "./classify";

export async function findLearnedMapping(db: Db, normalizedName: string): Promise<LearnedMapping | null> {
  const { data, error } = await db
    .from("region_mappings")
    .select("normalized_name, city, province, reporting_region, source, confidence")
    .eq("normalized_name", normalizedName)
    .maybeSingle();
  if (error) throw dbError("Gagal membaca cache lokasi", error);
  if (!data) return null;
  return {
    normalizedName: data.normalized_name,
    city: data.city,
    province: data.province,
    region: isReportingRegion(data.reporting_region) ? data.reporting_region : null,
    source: data.source === "manual" ? "manual" : "ai",
    confidence: data.confidence === "high" || data.confidence === "medium" || data.confidence === "low" ? data.confidence : null,
  };
}

export async function saveLearnedMapping(db: Db, mapping: LearnedMapping): Promise<void> {
  // A manual confirmation always wins over an earlier AI answer.
  if (mapping.source === "ai") {
    const existing = await findLearnedMapping(db, mapping.normalizedName);
    if (existing?.source === "manual") return;
  }
  const { error } = await db.from("region_mappings").upsert(
    {
      normalized_name: mapping.normalizedName,
      city: mapping.city,
      province: mapping.province,
      reporting_region: mapping.region,
      source: mapping.source,
      confidence: mapping.confidence,
    },
    { onConflict: "normalized_name" },
  );
  if (error) throw dbError("Gagal menyimpan cache lokasi", error);
}
