import { describe, expect, it } from "vitest";
import { normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it.each([
    ["081234567890", "081234567890"],
    ["0812-3456-7890", "081234567890"],
    ["+62 812 3456 7890", "081234567890"],
    ["6281234567890", "081234567890"],
    ["81234567890", "081234567890"],
    ["(021) 5551234", "0215551234"],
  ])("%s -> %s (leading zero kept, stored as text)", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "abc", "0812", "08123456789012345", "+1 415 555 0100x", "00812345678"])("rejects %s", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});
