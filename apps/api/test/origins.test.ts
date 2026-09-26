import { describe, expect, it } from "vitest";
import { originMatcher } from "../src/lib/origins";

describe("CORS_ORIGINS", () => {
  it("matches exact origins, ignoring a trailing slash", () => {
    const allowed = originMatcher(["http://localhost:3000", "https://handy.example.com/"]);
    expect(allowed("http://localhost:3000")).toBe(true);
    expect(allowed("https://handy.example.com")).toBe(true);
    expect(allowed("http://localhost:3001")).toBe(false);
  });

  it("lets a * stand for one subdomain, for preview deploys", () => {
    const allowed = originMatcher(["https://*.vercel.app"]);
    expect(allowed("https://handy-git-main-kyler.vercel.app")).toBe(true);
    expect(allowed("https://vercel.app")).toBe(false);
    expect(allowed("https://evil.com/.vercel.app")).toBe(false);
    expect(allowed("https://a.b.vercel.app")).toBe(false);
    expect(allowed("http://handy.vercel.app")).toBe(false);
  });

  it("allows anything with just *", () => {
    expect(originMatcher(["*"])("https://whatever.dev")).toBe(true);
  });
});
