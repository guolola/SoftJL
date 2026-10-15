// Positions article headings within the docs viewport without moving outer page ancestors.
export function scrollDocsHeading(
  viewport: HTMLElement,
  heading: HTMLElement,
  toolbarHeight: number,
  behavior: ScrollBehavior = "smooth",
) {
  // Coordinates are relative to the content viewport; the fixed header is outside it.
  const top = Math.max(0,
    viewport.scrollTop + heading.getBoundingClientRect().top -
    viewport.getBoundingClientRect().top - toolbarHeight - 24,
  );
  if (behavior === "instant") viewport.scrollTop = top;
  else viewport.scrollTo({ top, behavior });
}
