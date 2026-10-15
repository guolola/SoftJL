// Defines the canonical metadata contract shared by runtime navigation and static prerendering.
import type { AppRoute, MarketingRoutePath } from "../../../shared/lib/app-route-types";
import { LOCALE_OG_LOCALE, type AppLocale } from "../../../shared/i18n/types";

export const PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
export const SEO_JSON_LD_ID = "marketing-seo-json-ld";

type LocalizedMarketingSeoMetadata = {
  title: string;
  description: string;
};

export type MarketingSeoMetadata = {
  path: MarketingRoutePath;
  title: string;
  description: string;
  canonicalPath: MarketingRoutePath;
  imagePath: "/og-cover.png";
  indexable: true;
  jsonLd?: Record<string, unknown>[];
  localized?: Partial<Record<Exclude<AppLocale, "zh-CN">, LocalizedMarketingSeoMetadata>>;
};

const sharedApplication = {
  "@type": "SoftwareApplication",
  name: "SoftJL",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  url: PUBLIC_SITE_URL,
  description: "面向毕设与课程设计的工程实践工作台，用 AI 关联需求、UML、设计、测试与说明书，提供覆盖检查、更新影响和设计讲解依据，支持独立部署与自带模型。",
};

export const MARKETING_SEO: Record<MarketingRoutePath, MarketingSeoMetadata> = {
  "/": {
    path: "/",
    title: "SoftJL｜毕业设计与课程设计：设计有依据，修改有方向",
    description: "从需求规则关联 UML、设计、测试与说明书，检查覆盖缺口，查看修改影响，梳理答辩依据。导出设计与测试依据，在自己的仓库中运行和验证。",
    canonicalPath: "/",
    imagePath: "/og-cover.png",
    indexable: true,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "SoftJL",
        url: PUBLIC_SITE_URL,
        inLanguage: "zh-CN",
      },
      { "@context": "https://schema.org", ...sharedApplication },
    ],
    localized: {
      en: {
        title: "Capstone & Course Projects: Traceable Design | SoftJL",
        description:
          "Connect requirement rules to UML, designs, tests and specifications. Review coverage gaps, follow change impacts and prepare explanations for your defense. Export your saved models and documents for implementation and verification.",
      },
    },
  },

};

function localizeMetadata(metadata: MarketingSeoMetadata, locale: AppLocale) {
  const localized = locale === "zh-CN" ? null : metadata.localized?.[locale];
  return localized
    ? {
        ...metadata,
        title: localized.title,
        description: localized.description,
      }
    : metadata;
}

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.dataset.seoRuntime = "true";
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) => element!.setAttribute(name, value));
}

function removeManagedStructuredData() {
  document.getElementById(SEO_JSON_LD_ID)?.remove();
}

export function applyRouteMetadata(
  route: AppRoute,
  siteUrl = PUBLIC_SITE_URL,
  locale: AppLocale = "zh-CN",
) {
  const metadata =
    route.kind === "marketing-home"
      ? localizeMetadata(MARKETING_SEO[route.path], locale)
      : null;
  const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!metadata) {
    document.title =
      route.kind === "not-found"
        ? locale === "en"
          ? "Page not found | SoftJL"
          : "页面未找到｜SoftJL"
        : "SoftJL";
    upsertMeta('meta[name="robots"]', { name: "robots", content: "noindex, nofollow" });
    // Next.js owns its server-rendered head nodes. Retire their values in place so
    // React can still remove those nodes safely during navigation or hot reload.
    if (canonical?.dataset.seoRuntime === "true") canonical.remove();
    else canonical?.removeAttribute("href");
    const description = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description?.dataset.seoRuntime === "true") description.remove();
    else description?.setAttribute("content", "");
    document.head.querySelectorAll('[data-seo-social="true"]').forEach((element) => element.remove());
    removeManagedStructuredData();
    return;
  }

  const absoluteCanonical = new URL(metadata.canonicalPath, siteUrl).toString();
  const absoluteImage = new URL(metadata.imagePath, siteUrl).toString();
  document.title = metadata.title;
  upsertMeta('meta[name="description"]', { name: "description", content: metadata.description });
  upsertMeta('meta[name="robots"]', {
    name: "robots",
    content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  });

  const canonicalElement = canonical ?? document.createElement("link");
  canonicalElement.setAttribute("rel", "canonical");
  canonicalElement.setAttribute("href", absoluteCanonical);
  if (!canonical) {
    canonicalElement.dataset.seoRuntime = "true";
    document.head.appendChild(canonicalElement);
  }

  document.head.querySelectorAll('[data-seo-social="true"]').forEach((element) => element.remove());
  const socialTags: Array<Record<string, string>> = [
    { property: "og:type", content: "website" },
    { property: "og:locale", content: LOCALE_OG_LOCALE[locale] },
    {
      property: "og:site_name",
      content: "SoftJL",
    },
    { property: "og:title", content: metadata.title },
    { property: "og:description", content: metadata.description },
    { property: "og:url", content: absoluteCanonical },
    { property: "og:image", content: absoluteImage },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: metadata.title },
    { name: "twitter:description", content: metadata.description },
    { name: "twitter:image", content: absoluteImage },
  ];
  socialTags.forEach((attributes) => {
    const element = document.createElement("meta");
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    element.dataset.seoSocial = "true";
    document.head.appendChild(element);
  });

  removeManagedStructuredData();
  // The initial Next.js JSON-LD script belongs to React; only add a client script after SPA navigation.
  if (metadata.jsonLd?.length && !document.getElementById("marketing-seo-json-ld-server")) {
    const script = document.createElement("script");
    script.id = SEO_JSON_LD_ID;
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(metadata.jsonLd);
    document.head.appendChild(script);
  }
}
