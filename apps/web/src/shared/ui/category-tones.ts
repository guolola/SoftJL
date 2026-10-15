// Assigns stable accents to categorical data without reusing status colors as meaning.
const tones = [
  { chip: "border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300", text: "text-blue-700 dark:text-blue-300" },
  { chip: "border-teal-300 bg-teal-100 text-teal-800 dark:border-teal-700 dark:bg-teal-950 dark:text-teal-300", text: "text-teal-700 dark:text-teal-300" },
  { chip: "border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-300", text: "text-violet-700 dark:text-violet-300" },
  { chip: "border-pink-300 bg-pink-100 text-pink-800 dark:border-pink-700 dark:bg-pink-950 dark:text-pink-300", text: "text-pink-700 dark:text-pink-300" },
  { chip: "border-cyan-300 bg-cyan-100 text-cyan-800 dark:border-cyan-700 dark:bg-cyan-950 dark:text-cyan-300", text: "text-cyan-700 dark:text-cyan-300" },
  { chip: "border-indigo-300 bg-indigo-100 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-300", text: "text-indigo-700 dark:text-indigo-300" },
  { chip: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", text: "text-emerald-700 dark:text-emerald-300" },
  { chip: "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-300", text: "text-orange-700 dark:text-orange-300" },
] as const;

export function categoryChipTone(index: number) {
  return tones[((index % tones.length) + tones.length) % tones.length].chip;
}

export function categoryTextTone(index: number) {
  return tones[((index % tones.length) + tones.length) % tones.length].text;
}
