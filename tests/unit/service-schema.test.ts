import { describe, expect, it } from "vitest";
import { fieldErrors } from "@/lib/leads/schema";
import { serviceInputSchema } from "@/lib/service/schema";

const valid = {
  submissionId: "0c9d2f9e-3c4b-4f43-9f6b-4b8f5c2d9a11",
  dealerId: "6f1c1e2a-8a8f-4b1e-9d2f-1b2c3d4e5f60",
  name: "  Dina   Adrianti ",
  location: " Rawamangun ",
  unit: "Xpander Exceed Tourer",
  source: "GOOGLE",
  entryDate: "",
  finalNote: "  BOOKING SERVICE   TGL 12/11/2026 ",
};

describe("service input validation", () => {
  it("normalises valid input", () => {
    expect(serviceInputSchema.parse(valid)).toMatchObject({
      name: "Dina Adrianti",
      location: "Rawamangun",
      unit: "Xpander Exceed Tourer",
      source: "GOOGLE",
      entryDate: null,
      finalNote: "BOOKING SERVICE TGL 12/11/2026",
    });
  });

  it("accepts a free-text unit the sales dropdown does not offer", () => {
    for (const unit of ["Outlander", "XPANDER GLS", "FE 74", "DC HDX"]) {
      expect(serviceInputSchema.safeParse({ ...valid, unit }).success, unit).toBe(true);
    }
  });

  it("treats an empty Final as no note", () => {
    expect(serviceInputSchema.parse({ ...valid, finalNote: "   " }).finalNote).toBeNull();
    expect(serviceInputSchema.parse({ ...valid, finalNote: undefined }).finalNote).toBeNull();
  });

  it.each([
    ["dealerId", { dealerId: "" }],
    ["name", { name: " " }],
    ["location", { location: "" }],
    ["unit", { unit: "" }],
    ["source", { source: "FACEBOOK" }],
    ["entryDate", { entryDate: "2026-02-30" }],
    ["entryDate", { entryDate: "2999-01-01" }],
    ["finalNote", { finalNote: "x".repeat(501) }],
  ])("rejects an invalid %s", (field, override) => {
    const result = serviceInputSchema.safeParse({ ...valid, ...override });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error)[field]).toBeTruthy();
  });

  it("has no phone or WhatsApp group field, because service never goes to a group", () => {
    const keys = Object.keys(serviceInputSchema.parse(valid));
    expect(keys).not.toContain("phone");
    expect(keys).not.toContain("groupIds");
    expect(keys).not.toContain("reportingRegion");
  });
});
