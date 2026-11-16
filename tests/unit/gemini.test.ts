import { describe, expect, it, vi } from "vitest";
import { buildLocationPrompt, GeminiError, getGeminiModelInfo, resolveLocationWithGemini } from "@/lib/location/gemini";

function fakeFetch(status: number, body: unknown) {
  return vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(body), { status }));
}

const answer = {
  recognized: true, city: "Bungo", city_type: "kabupaten", province: "Jambi",
  reporting_region: "SUMATERA & KALIMANTAN", confidence: "high", note: null,
};

describe("Gemini fallback client", () => {
  it("sends only the domicile text with a structured JSON schema to the configured model", async () => {
    const fetchImpl = fakeFetch(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
    const result = await resolveLocationWithGemini("Muara Bungo", { apiKey: "key", model: "gemini-test-model", fetchImpl });
    expect(result).toMatchObject({ province: "Jambi", reporting_region: "SUMATERA & KALIMANTAN", confidence: "high" });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent");
    expect((init!.headers as Record<string, string>)["x-goog-api-key"]).toBe("key");
    const body = JSON.parse(String(init!.body));
    expect(body.generationConfig).toMatchObject({ temperature: 0, responseMimeType: "application/json" });
    expect(body.generationConfig.responseSchema.required).toContain("confidence");
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0].parts[0].text).toBe(buildLocationPrompt("Muara Bungo"));
  });

  it("asks the model to admit uncertainty instead of guessing", () => {
    expect(buildLocationPrompt("x")).toMatch(/Jangan menebak/);
  });

  it("raises on API errors and malformed answers", async () => {
    await expect(
      resolveLocationWithGemini("x", { apiKey: "k", model: "m", fetchImpl: fakeFetch(429, { error: { message: "Quota exceeded" } }) }),
    ).rejects.toThrow(/429: Quota exceeded/);
    await expect(
      resolveLocationWithGemini("x", { apiKey: "k", model: "m", fetchImpl: fakeFetch(200, { candidates: [{ content: { parts: [{ text: "not json" }] } }] }) }),
    ).rejects.toBeInstanceOf(GeminiError);
    await expect(
      resolveLocationWithGemini("x", {
        apiKey: "k", model: "m",
        fetchImpl: fakeFetch(200, { candidates: [{ content: { parts: [{ text: JSON.stringify({ ...answer, reporting_region: "JAWA TENGAH" }) }] } }] }),
      }),
    ).rejects.toThrow(/skema/);
  });

  it("verifies that the configured model exists", async () => {
    const info = await getGeminiModelInfo({
      apiKey: "k", model: "m",
      fetchImpl: fakeFetch(200, { name: "models/m", displayName: "M", supportedGenerationMethods: ["generateContent"] }),
    });
    expect(info).toMatchObject({ name: "models/m", supportsGenerateContent: true });
    await expect(getGeminiModelInfo({ apiKey: "k", model: "m", fetchImpl: fakeFetch(404, { error: { message: "not found" } }) })).rejects.toThrow(/404/);
  });
});
