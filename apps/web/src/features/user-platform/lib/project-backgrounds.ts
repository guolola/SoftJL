// Defines the manual cover gallery and samples a default once when a project form opens.
import type { ProjectBackgroundKey } from "@uml-platform/contracts";
import cover01ImageUrl from "../assets/project-backgrounds/cover-01.webp";
import cover02ImageUrl from "../assets/project-backgrounds/cover-02.webp";
import cover03ImageUrl from "../assets/project-backgrounds/cover-03.webp";
import cover04ImageUrl from "../assets/project-backgrounds/cover-04.webp";
import cover05ImageUrl from "../assets/project-backgrounds/cover-05.webp";
import cover06ImageUrl from "../assets/project-backgrounds/cover-06.webp";
import cover07ImageUrl from "../assets/project-backgrounds/cover-07.webp";
import cover08ImageUrl from "../assets/project-backgrounds/cover-08.webp";
import cover09ImageUrl from "../assets/project-backgrounds/cover-09.webp";
import cover10ImageUrl from "../assets/project-backgrounds/cover-10.webp";
import cover11ImageUrl from "../assets/project-backgrounds/cover-11.webp";
import cover12ImageUrl from "../assets/project-backgrounds/cover-12.webp";
import cover13ImageUrl from "../assets/project-backgrounds/cover-13.webp";
import cover14ImageUrl from "../assets/project-backgrounds/cover-14.webp";
import cover15ImageUrl from "../assets/project-backgrounds/cover-15.webp";
import cover16ImageUrl from "../assets/project-backgrounds/cover-16.webp";
import cover17ImageUrl from "../assets/project-backgrounds/cover-17.webp";
import cover18ImageUrl from "../assets/project-backgrounds/cover-18.webp";
import cover19ImageUrl from "../assets/project-backgrounds/cover-19.webp";
import cover20ImageUrl from "../assets/project-backgrounds/cover-20.webp";
import cover21ImageUrl from "../assets/project-backgrounds/cover-21.webp";

export type ProjectBackgroundOption = {
  key: ProjectBackgroundKey;
  imageUrl: string;
};

// Vite imports image URLs as strings; Next.js imports static image descriptors.
function assetUrl(asset: string | { src: string }) {
  return typeof asset === 'string' ? asset : asset.src;
}

export const PROJECT_BACKGROUND_OPTIONS: ProjectBackgroundOption[] = [
  { key: "erp", imageUrl: assetUrl(cover01ImageUrl) },
  { key: "crm", imageUrl: assetUrl(cover02ImageUrl) },
  { key: "oa", imageUrl: assetUrl(cover03ImageUrl) },
  { key: "finance", imageUrl: assetUrl(cover04ImageUrl) },
  { key: "inventory", imageUrl: assetUrl(cover05ImageUrl) },
  { key: "scm", imageUrl: assetUrl(cover06ImageUrl) },
  { key: "bi", imageUrl: assetUrl(cover07ImageUrl) },
  { key: "project_management", imageUrl: assetUrl(cover08ImageUrl) },
  { key: "orders", imageUrl: assetUrl(cover09ImageUrl) },
  { key: "knowledge_base", imageUrl: assetUrl(cover10ImageUrl) },
  { key: "equipment", imageUrl: assetUrl(cover11ImageUrl) },
  { key: "iot", imageUrl: assetUrl(cover12ImageUrl) },
  { key: "his", imageUrl: assetUrl(cover13ImageUrl) },
  { key: "lms", imageUrl: assetUrl(cover14ImageUrl) },
  { key: "energy", imageUrl: assetUrl(cover15ImageUrl) },
  { key: "ecommerce", imageUrl: assetUrl(cover16ImageUrl) },
  { key: "campus", imageUrl: assetUrl(cover17ImageUrl) },
  { key: "parking", imageUrl: assetUrl(cover18ImageUrl) },
  { key: "booking", imageUrl: assetUrl(cover19ImageUrl) },
  { key: "quality_traceability", imageUrl: assetUrl(cover20ImageUrl) },
  { key: "security", imageUrl: assetUrl(cover21ImageUrl) },
];

const PROJECT_BACKGROUND_BY_KEY = new Map(
  PROJECT_BACKGROUND_OPTIONS.map((background) => [background.key, background]),
);

export function randomProjectBackground(): ProjectBackgroundOption {
  return PROJECT_BACKGROUND_OPTIONS[Math.floor(Math.random() * PROJECT_BACKGROUND_OPTIONS.length)];
}

export function resolveProjectBackground(backgroundKey?: ProjectBackgroundKey | null): ProjectBackgroundOption | null {
  if (backgroundKey == null) return null;
  const background = PROJECT_BACKGROUND_BY_KEY.get(backgroundKey);
  if (!background) throw new Error("Unknown project background key");
  return background;
}
