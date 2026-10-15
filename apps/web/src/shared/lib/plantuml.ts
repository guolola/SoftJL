export function plantUmlSvgUrl(source: string) {
  const bytes = new TextEncoder().encode(source);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return `https://www.plantuml.com/plantuml/svg/~h${hex}`;
}
