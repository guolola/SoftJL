// Verifies public Markdown URLs return the selected guide with portable content.
import { describe, expect, it } from "vitest";
import { GET } from "./route";

const context = (article: string) => ({ params: Promise.resolve({ article }) });

describe("public guide Markdown", () => {
  it("returns the current Chinese guide with portable links and no maintenance comment", async () => {
    const response = await GET(new Request("https://docs.example/tutorial/project-basics.md"), context("project-basics.md"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    expect(response.headers.get("Content-Disposition")).toContain("inline");
    const markdown = await response.text();
    expect(markdown).toContain("# 创建与进入项目");
    expect(markdown).toContain("## 操作步骤");
    expect(markdown).not.toContain("<!--");
    expect(markdown).toContain("https://docs.example/help/images/");
  });

  it.each([
    { host: "127.0.0.1:4175", protocol: "http", expected: "http://127.0.0.1:4175" },
    { host: "docs.example", protocol: "https", expected: "https://docs.example" },
  ])("exports the public request origin: $expected", async ({ host, protocol, expected }) => {
    const request = new Request("http://localhost:4175/tutorial/project-basics.md", {
      headers: { host, "x-forwarded-proto": protocol },
    });
    const response = await GET(request, context("project-basics.md"));
    const markdown = await response.text();
    expect(markdown).toContain(expected + "/help/images/");
    expect(markdown).not.toContain("http://localhost:4175");
  });

  it("returns the English article when requested", async () => {
    const response = await GET(new Request("https://docs.example/tutorial/quick-start.md?lang=en"), context("quick-start.md"));
    const markdown = await response.text();
    expect(markdown).toContain("# Quick start");
    expect(markdown).toContain("## Steps");
    expect(markdown).not.toContain("## 操作步骤");
  });

  it.each(["unknown.md", "quick-start", "../quick-start.md"])("does not expose an unrecognized guide: %s", async (filename) => {
    const response = await GET(new Request("https://docs.example/tutorial/unknown.md"), context(filename));
    expect(response.status).toBe(404);
  });
});
