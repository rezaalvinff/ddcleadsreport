import { describe, expect, it } from "vitest";
import { UNIT_OPTIONS } from "@/lib/constants";
import { fieldErrors, leadInputSchema } from "@/lib/leads/schema";

const valid = {
  submissionId: "0c9d2f9e-3c4b-4f43-9f6b-4b8f5c2d9a11",
  name: "  Budi   Santoso ",
  phone: "+62 812-3456-7890",
  domicile: "Muara Bungo",
  leadDate: "",
  dealerId: "6f1c1e2a-8a8f-4b1e-9d2f-1b2c3d4e5f60",
  unit: "Pajero Sport",
  unitOther: "",
  source: "TIKTOK",
  reportingRegion: "SUMATERA & KALIMANTAN",
  groupIds: [],
};

describe("unit options", () => {
  it("offers the units the branches actually sell, in order", () => {
    expect([...UNIT_OPTIONS]).toEqual([
      "Xpander",
      "Xforce ICE",
      "Xforce HEV",
      "Destinator",
      "Pajero Sport",
      "Triton",
      "L300",
      "Fuso Canter",
    ]);
  });

  it("accepts each of them on the form", () => {
    for (const unit of UNIT_OPTIONS) {
      expect(leadInputSchema.safeParse({ ...valid, unit }).success, unit).toBe(true);
    }
  });
});

describe("lead input validation", () => {
  it("normalises valid input", () => {
    const parsed = leadInputSchema.parse(valid);
    expect(parsed).toMatchObject({ name: "Budi Santoso", phone: "081234567890", leadDate: null, unit: "Pajero Sport", confirmDuplicate: false });
  });

  it.each([
    ["name", { name: " " }],
    ["phone", { phone: "12" }],
    ["domicile", { domicile: "" }],
    ["dealerId", { dealerId: "" }],
    ["source", { source: "FACEBOOK" }],
    ["reportingRegion", { reportingRegion: "JAWA TENGAH" }],
    ["unit", { unit: "Pajero" }],
    ["leadDate", { leadDate: "2026-02-30" }],
    ["leadDate", { leadDate: "2999-01-01" }],
  ])("rejects an invalid %s", (field, override) => {
    const result = leadInputSchema.safeParse({ ...valid, ...override });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error)[field]).toBeTruthy();
  });

  it("requires a custom unit for Lainnya and stores it", () => {
    expect(leadInputSchema.safeParse({ ...valid, unit: "Lainnya" }).success).toBe(false);
    expect(leadInputSchema.parse({ ...valid, unit: "Lainnya", unitOther: "Outlander PHEV" }).unit).toBe("Outlander PHEV");
  });

  it("accepts an optional customer note and normalises it", () => {
    expect(leadInputSchema.parse(valid).customerNote).toBeNull();
    expect(leadInputSchema.parse({ ...valid, customerNote: "   " }).customerNote).toBeNull();
    expect(leadInputSchema.parse({ ...valid, customerNote: "  Minta   info  angsuran " }).customerNote).toBe("Minta info angsuran");
    const tooLong = leadInputSchema.safeParse({ ...valid, customerNote: "x".repeat(501) });
    expect(tooLong.success).toBe(false);
    if (!tooLong.success) expect(fieldErrors(tooLong.error).customerNote).toBeTruthy();
  });

  it("deduplicates destination groups", () => {
    const g = "2b0f8c1e-1f4a-4c5d-8e9f-0a1b2c3d4e5f";
    expect(leadInputSchema.parse({ ...valid, groupIds: [g, g] }).groupIds).toEqual([g]);
  });
});
