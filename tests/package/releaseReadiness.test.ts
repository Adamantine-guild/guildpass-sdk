import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as sdkPublicSurface from "../../src/index.js";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const pkgJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));

describe("GuildPass SDK V2 release readiness (#501)", () => {
  it("defines valid semantic version and explicit package metadata", () => {
    expect(pkgJson.name).toBe("@guildpass/sdk");
    expect(pkgJson.version).toMatch(/^\d+\.\d+\.\d+(-(?:alpha|beta|rc)\.\d+)?$/);
    expect(pkgJson.license).toBe("MIT");
    expect(pkgJson.type).toBe("module");
    expect(pkgJson.sideEffects).toBe(false);
    expect(pkgJson.repository?.url).toContain("Adamantine-guild/guildpass-sdk");
  });

  it("declares intentional exports and excludes internal source files from published files whitelist", () => {
    expect(pkgJson.exports["."]).toEqual({
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    });
    expect(pkgJson.files).toContain("dist");
    expect(pkgJson.files).toContain("README.md");
    expect(pkgJson.files).toContain("CHANGELOG.md");
    expect(pkgJson.files).toContain("LICENSE");
    expect(pkgJson.files).not.toContain("src");
    expect(pkgJson.files).not.toContain("tests");
  });

  it("documents semantic versioning policy and release history in CHANGELOG.md", () => {
    const changelogPath = path.join(repoRoot, "CHANGELOG.md");
    expect(fs.existsSync(changelogPath)).toBe(true);
    const changelog = fs.readFileSync(changelogPath, "utf8");
    expect(changelog).toContain("Semantic Versioning");
    expect(changelog).toContain(`[${pkgJson.version}]`);
  });

  it("exposes stable root public exports for downstream consumers", () => {
    expect(typeof sdkPublicSurface.GuildPassClient).toBe("function");
    expect(typeof sdkPublicSurface.AccessResource).toBe("function");
    expect(typeof sdkPublicSurface.HttpTransport).toBe("function");
    expect(typeof sdkPublicSurface.GuildPassError).toBe("function");
  });
});
