// Includes maintained quick-modeling Markdown resources in the API build at the same module-relative location.
import { cp } from "node:fs/promises";

await cp(new URL("../src/runs/pipelines/standard/resources/", import.meta.url),
  new URL("../dist/runs/pipelines/standard/resources/", import.meta.url), { recursive: true });
