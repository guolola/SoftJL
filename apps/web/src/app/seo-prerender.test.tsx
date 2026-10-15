// Guards the server-rendering contract required for crawlable marketing build artifacts.
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { act } from "react";
import { describe, expect, it } from "vitest";
import App from "./App";
import { MARKETING_SEO } from "../features/marketing-site/model/seo";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("marketing prerender contract", () => {
  it.each(Object.keys(MARKETING_SEO))("renders meaningful HTML for %s", (route) => {
    const html = renderToString(<App initialPath={route} />);
    expect(html.length).toBeGreaterThan(1_500);
    expect(html).toContain("<h1");
  });

  it.each(Object.keys(MARKETING_SEO))("hydrates %s without recoverable mismatches", async (route) => {
    window.history.replaceState({}, "", route);
    const container = document.createElement("div");
    container.innerHTML = renderToString(<App initialPath={route} />);
    document.body.replaceChildren(container);
    const errors: unknown[] = [];
    let root: Root | undefined;

    await act(async () => {
      root = hydrateRoot(container, <App />, {
        onRecoverableError: (error) => errors.push(error),
      });
      await Promise.resolve();
    });

    expect(errors).toEqual([]);
    await act(async () => root?.unmount());
  });
});
