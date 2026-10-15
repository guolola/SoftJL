// Verifies the public metadata registry and runtime head transitions used by SPA navigation.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render } from "@testing-library/react";
import type { MarketingRoutePath } from "../../../shared/lib/app-route-types";
import { applyRouteMetadata, MARKETING_SEO, PUBLIC_SITE_URL, SEO_JSON_LD_ID } from "./seo";
import { resources } from "../../../shared/i18n/resources";

const expectedRoutes: MarketingRoutePath[] = ["/"];

describe("marketing SEO metadata", () => {
  it("defines complete unique metadata for every public route", () => {
    expect(Object.keys(MARKETING_SEO)).toEqual(expectedRoutes);
    expect(new Set(Object.values(MARKETING_SEO).map((item) => item.title)).size).toBe(expectedRoutes.length);
    expect(new Set(Object.values(MARKETING_SEO).map((item) => item.description)).size).toBe(expectedRoutes.length);

    expectedRoutes.forEach((route) => {
      const metadata = MARKETING_SEO[route];
      expect(metadata.path).toBe(route);
      expect(metadata.canonicalPath).toBe(route);
      expect(metadata.indexable).toBe(true);
      expect(metadata.description.length).toBeGreaterThan(30);
      expect(metadata.jsonLd?.map((item) => item.name)).toEqual(["SoftJL", "SoftJL"]);
    });
  });

  it.each(["zh-CN", "en"] as const)("applies localized student metadata in %s and removes it on private routes", (locale) => {
    applyRouteMetadata({ kind: "marketing-home", path: "/" }, PUBLIC_SITE_URL, locale);
    const expected = resources[locale].translation.seo.home;

    expect(document.title).toBe(expected.title);
    expect(document.title).toContain("SoftJL");
    expect(document.querySelector('meta[property="og:site_name"]')?.getAttribute("content")).toBe("SoftJL");
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      expected.description,
    );
    expect(document.title).toContain(locale === "en" ? "Capstone & Course Project" : "毕业设计与课程设计");
    expect(document.querySelector('meta[property="og:description"]')?.getAttribute("content")).toBe(expected.description);
    expect(document.querySelector('meta[name="twitter:description"]')?.getAttribute("content")).toBe(expected.description);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toContain("index, follow");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(`${PUBLIC_SITE_URL}/`);
    expect(document.getElementById(SEO_JSON_LD_ID)?.textContent).toContain("SoftwareApplication");
    expect(JSON.parse(document.getElementById(SEO_JSON_LD_ID)!.textContent!).map((item: { name: string }) => item.name)).toEqual(["SoftJL", "SoftJL"]);
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      `${PUBLIC_SITE_URL}/og-cover.png`,
    );

    applyRouteMetadata({ kind: "projects-index", path: "/projects" });

    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.querySelector('[data-seo-social="true"]')).toBeNull();
    expect(document.getElementById(SEO_JSON_LD_ID)).toBeNull();
  });

  it("uses an explicit noindex title for unknown routes", () => {
    applyRouteMetadata({ kind: "not-found", path: "/missing" });
    expect(document.title).toBe("页面未找到｜SoftJL");
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
  });

  it("keeps React-owned head nodes attached when entering a private route", () => {
    applyRouteMetadata({ kind: "projects-index", path: "/projects" });
    const { unmount } = render(createElement("div", null,
      createElement("meta", { name: "description", content: MARKETING_SEO["/"].description }),
      createElement("link", { rel: "canonical", href: `${PUBLIC_SITE_URL}/` }),
    ));
    const description = document.head.querySelector('meta[name="description"]');
    const canonical = document.head.querySelector('link[rel="canonical"]');

    applyRouteMetadata({ kind: "projects-index", path: "/projects" });

    expect(canonical?.isConnected).toBe(true);
    expect(description?.isConnected).toBe(true);
    expect(canonical?.getAttribute("href")).toBeNull();
    expect(description?.getAttribute("content")).toBe("");

    applyRouteMetadata({ kind: "marketing-home", path: "/" });
    expect(document.head.querySelector('link[rel="canonical"]')).toBe(canonical);
    expect(canonical?.getAttribute("href")).toBe(`${PUBLIC_SITE_URL}/`);
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(description?.getAttribute("content")).toBe(MARKETING_SEO["/"].description);

    applyRouteMetadata({ kind: "projects-index", path: "/projects" });
    expect(() => unmount()).not.toThrow();
  });
});
