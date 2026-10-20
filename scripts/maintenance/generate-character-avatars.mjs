// Draws compact, original chibi SVG interpretations of the selected game characters.
import { mkdir, writeFile } from "node:fs/promises";

const destination = new URL("../../apps/web/public/avatars/", import.meta.url);
const ink = "#3e3b58";
const gold = "#d5ad65";
const path = (d, fill, stroke = "none", width = 1) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const ellipse = (x, y, rx, ry, fill) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
const jewel = (x, y, color) => path(`M${x} ${y - 5}l4 5-4 6-4-6Z`, color, gold);
const star = (x, y, color, size = 4) => path(`M${x} ${y - size}q0 ${size} ${size} ${size}q-${size} 0-${size} ${size}q0-${size}-${size}-${size}q${size} 0 ${size}-${size}`, color);

// Silhouette, fringe, and ornaments are drawn separately so large headgear and long hair stay readable at 40px.
const characters = [
  {
    id: "genshin-furina", name: "Furina", bg: "#e4efff", hair: "#e9efff", tip: "#86a7e4", eye: "#4779c4", otherEye: "#87c7ea", outfit: "#283d75",
    back: path("M28 55Q20 104 28 120L43 117 40 58M91 53Q111 89 99 119L83 114 86 54", "url(#hair)"),
    fringe: "M28 66Q20 28 50 25Q74 15 95 38L99 67 88 57 85 43Q82 55 69 57L72 38Q62 58 43 56L37 70 34 49Z",
    detail: path("M37 39Q48 29 61 31M88 62 94 102M34 77 33 100", "none", "#aec2eb", 1.5),
    accessory: path("M26 25 32 6 51 10 51 29Z", "#243c72", gold, 1.4) + path("M20 27Q35 20 57 29L54 34Q36 29 20 33Z", "#253d73", gold) + path("M30 19 50 23", "none", "#f5f6ff", 3) + jewel(42, 22, "#69b1e8"),
    costume: path("M45 105 57 109 64 104 70 110 83 104 78 122 64 114 50 122Z", "#f2f4ff") + jewel(64, 114, "#6aaee2"),
  },
  {
    id: "genshin-columbina", name: "Columbina", bg: "#f4e6f2", hair: "#383349", tip: "#c2729e", eye: "#b26594", outfit: "#f1eef5",
    back: path("M30 49Q19 84 24 128H48L42 50M88 45Q109 77 103 128H82L85 48", "url(#hair)"),
    fringe: "M28 65Q21 24 63 22Q105 23 100 66L87 60 84 43 76 56 67 45 60 57 49 47 40 59 36 73Z",
    detail: path("M31 80 37 119M96 77 91 120", "none", "#ca7caa", 4),
    accessory: path("M33 40Q15 37 15 22L30 31Q16 17 26 14L40 33Q30 15 39 12L47 34M92 40Q111 37 113 22L98 31Q112 17 102 14L88 33Q98 15 89 12L81 34", "#fffaf7", "#d9cddd", 1.1)
      + path("M34 65Q63 56 94 65L93 74Q63 70 35 75Z", "#fff9fa", "#e2cddd")
      + path("M38 65 47 74 57 64 66 72 77 64 89 72M38 73 47 64 57 73 66 63 77 73 89 64", "none", "#c9adc5", .8),
    costume: path("M37 107 50 103 64 111 77 103 91 108 79 119 64 116 49 119Z", "#fff", "#d6cada") + jewel(64, 114, "#ad6f9e"),
  },
  {
    id: "genshin-flins", name: "Flins", bg: "#e4eaf4", hair: "#34384e", tip: "#7fabc1", eye: "#d7b566", outfit: "#2c3248",
    back: path("M35 49Q26 96 40 125L54 113 46 49M84 49Q106 92 99 126L82 114 79 52", "url(#hair)"),
    fringe: "M27 65 22 47 28 37 23 33 40 29 45 18 54 26 66 18 76 27 89 25 98 36 103 52 96 69 87 52 81 42 73 57 65 45 57 59 49 45 40 57 35 69Z",
    detail: path("M42 54 36 70 34 59M86 53 94 70 91 55", "none", "#8db5cb", 2.5),
    accessory: path("M40 81Q47 85 55 81M73 81Q81 85 88 80", "none", "#9e96ba", 2) + path("M98 85V104M94 99h8v13h-8Z", "#6e8cae", gold, 1) + ellipse(98, 105, 2, 4, "#d9e6e5"),
    costume: path("M43 102 58 110 64 105 72 111 86 102 78 127H51Z", "#44445e", gold) + path("M59 107 64 114 69 107 66 126H62Z", "#c2b8d6") + jewel(64, 114, "#8fa3bd"),
  },
  {
    id: "genshin-arlecchino", name: "Arlecchino", bg: "#f6e6e7", hair: "#f2f0f2", tip: "#b8bbc9", eye: "#c54253", outfit: "#333441",
    back: path("M33 49Q28 94 41 113L51 107 44 51M86 45Q102 92 91 115L79 107 82 50", "#e5e5eb"),
    fringe: "M28 65Q21 27 56 22Q83 18 99 42L98 68 88 56 85 42 73 62 69 39 56 56 53 40 41 54 36 70Z",
    detail: path("M67 25Q84 24 94 43L87 57 81 43 73 61 70 40Z", "#43434f") + path("M41 40Q46 31 57 31", "none", "#fff", 2),
    crossEyes: true,
    accessory: path("M39 79 43 82M89 79 85 82", "none", "#b95765") + jewel(94, 86, "#c3485a"),
    costume: path("M43 103 61 112 64 108 68 112 86 102 79 122 69 116 64 126 58 116 49 122Z", "#f6f3ed", "#bbb7be") + path("M61 109h6l3 18H58Z", "#ad344d") + jewel(64, 114, "#db4b61"),
  },
  {
    id: "genshin-wanderer", name: "Wanderer", bg: "#e2f1f2", hair: "#3b3c6a", tip: "#777ba7", eye: "#747bc0", outfit: "#3b537e",
    back: path("M23 38 18 110 29 104 33 42M98 39 112 108 100 102 93 44", "#7cbdc4", "#e3e5cd", 1),
    fringe: "M29 66Q24 32 63 31Q100 32 97 70L86 63 84 48 77 58 70 49 64 59 56 47 47 58 41 47 37 70Z",
    detail: path("M37 63V82L44 85V57M85 59V86L93 82V64", "#494b7c"),
    accessory: path("M11 37Q64 11 117 37L109 46Q66 40 18 47Z", "#284c61", gold, 1.5) + path("M31 32 41 14Q63 7 87 16L99 32Z", "#32596c", gold, 1.3) + path("M22 39Q65 27 106 39M43 17 46 30M84 18 82 30", "none", "#6ca5ac", 2) + jewel(64, 23, "#b9ccbc") + path("M17 44 18 84M110 43 109 84", "none", gold, 1.2),
    costume: path("M42 104 54 108 64 102 76 108 87 104 80 121 64 116 48 122Z", "#e9ede5") + ellipse(64, 115, 6, 6, gold) + ellipse(64, 115, 3, 3, "#4979a0"),
  },
  {
    id: "genshin-durin", name: "Durin", bg: "#ede6fa", hair: "#c6acd9", tip: "#8c78af", eye: "#bd426a", outfit: "#484057",
    back: path("M27 53 24 94 38 104 46 54M87 50 104 89 91 104 81 54", "url(#hair)"),
    fringe: "M27 65 22 47 28 34 40 30 48 21 66 25 81 20 93 33 102 50 97 68 86 56 82 43 74 58 68 43 58 61 52 45 40 59 34 72Z",
    detail: path("M35 40 48 31 56 33M77 34 88 41M32 61 28 79M95 61 99 80", "none", "#e0cfea", 1.5),
    accessory: path("M34 34Q18 26 24 10Q27 22 41 23L45 34M87 34Q107 23 102 10Q99 23 86 23L82 35", "#403951", "#7c648c", 1.5) + path("M25 18 31 24M99 18 94 24", "none", "#b789b9", 1.5),
    costume: path("M43 103 58 110 64 105 70 110 85 103 80 124 68 117 64 125 59 117 49 124Z", "#e8e4ee", "#9f8cae") + jewel(64, 114, "#c85692"),
  },
  {
    id: "wuwa-changli", name: "Changli", bg: "#ffebe4", hair: "#fff0e6", tip: "#e98795", eye: "#d97460", outfit: "#762f43",
    back: path("M31 42Q10 57 18 98L29 119 43 106 42 48M83 42Q111 54 110 98L97 121 82 109 84 49", "url(#hair)"),
    fringe: "M28 67Q21 28 54 22Q80 17 97 39L99 70 87 58 84 40Q73 46 60 67L63 43 51 57 48 42 38 61 35 74Z",
    detail: path("M33 78 27 108M96 75 102 107M41 37Q51 28 65 29", "none", "#edbbc1", 1.5),
    accessory: path("M78 28Q83 13 102 9L96 25 110 22 100 34 85 40 83 32 74 36Z", "#c74e54", gold) + path("M84 29 99 17M87 32 102 28", "none", "#f4c789", 1.2) + jewel(94, 45, "#d65c5d"),
    costume: path("M39 104 53 100 64 112 77 100 90 105 83 117 70 115 65 128 57 114 46 118Z", "#fff5ec", gold) + jewel(64, 115, "#ca4b55"),
  },
  {
    id: "wuwa-chisa", name: "Chisa", bg: "#f2e6eb", hair: "#33313e", tip: "#5d4b62", eye: "#b94a59", outfit: "#383c4e",
    back: path("M31 42Q17 73 24 128H46L43 47M85 44Q108 72 107 128H83L80 48", "url(#hair)"),
    fringe: "M27 66Q22 24 63 22Q105 26 99 69L87 63 84 44 76 57 69 43 60 56 52 43 43 54 36 70Z",
    detail: path("M39 41 43 32 48 31M92 67 97 114M31 75 29 112", "none", "#675a6b", 1.5),
    accessory: path("M88 37 103 28 101 41 111 48 95 48Z", "#a94c59", "#df8893") + path("M38 44 43 48M43 43 38 49", "none", "#d48991", 1.8) + path("M56 98h16v5H56Z", "#35323f") + ellipse(64, 101, 2, 2, "#b8b4bc"),
    costume: path("M41 104 53 102 64 116 76 102 89 104 79 122 64 119 49 123Z", "#282d3f", "#f1e8e8", 1.5) + path("M58 112 64 116 70 111 67 127 62 122 57 126Z", "#b85465"),
  },
  {
    id: "wuwa-cartethyia", name: "Cartethyia", bg: "#e7f4e9", hair: "#f4e5b8", tip: "#accfae", eye: "#63a9a2", outfit: "#e9f2ed",
    back: path("M31 45Q14 66 24 115L40 119 45 51M86 43Q109 68 104 119L85 116 80 48", "url(#hair)"),
    fringe: "M28 65Q23 25 61 23Q98 21 101 63L90 71 86 43Q74 55 60 53L66 37 53 53 46 44 38 64 34 77Z",
    detail: path("M31 75 27 101M97 76 99 103M43 36Q53 30 61 31", "none", "#fffae0", 1.6),
    accessory: path("M32 42 36 23 49 31 63 17 77 30 92 23 96 43 81 37 65 29 49 38Z", "#404b4c", "#b0c5b6", 1.2) + jewel(64, 29, "#9cd7be") + path("M31 66 17 57 24 77 33 80M96 66 112 57 104 77 95 80", "#fce3cb", "#c9a7a1", .8),
    costume: path("M41 103 54 108 64 102 76 108 87 103 80 122 65 115 49 122Z", "#2e6678", "#b9dad0") + jewel(64, 115, "#91c7ba"),
  },
  {
    id: "wuwa-phrolova", name: "Phrolova", bg: "#f5e4e7", hair: "#c8dbcc", tip: "#819a96", eye: "#b4465a", outfit: "#343844",
    back: path("M32 39Q10 50 16 91L28 123 42 112 43 47M87 40Q112 53 112 94L100 124 85 111 82 47", "url(#hair)"),
    fringe: "M26 68Q20 24 63 23Q103 22 101 65L85 77 84 44Q73 60 58 83L62 42 51 59 47 42 36 63 33 74Z",
    detail: path("M29 77 22 100M100 75 106 98M39 36Q51 28 62 31", "none", "#ecf1e6", 1.5),
    accessory: path("M65 60 89 67 88 79 62 71Z", "#f3eddf", "#c2c8bc") + path("M69 63 85 70M67 67 85 74", "none", "#c6c2b4", .7)
      + path("M26 42 15 34 19 49 12 57 29 54M100 44 113 35 108 51 117 58 100 56", "#94354c") + ellipse(99, 91, 6, 6, "#b9445b") + path("M99 98v13M99 92q-12-9-3-12M99 92q15-8 10-14M99 91q-11 5-13-2M99 92q14 6 14-1", "none", "#cf5364", 1),
    costume: path("M44 104 56 106 64 113 73 106 87 104 80 120 65 117 49 122Z", "#a63c50") + path("M60 110h8l3 18H57Z", "#292e3b") + jewel(64, 114, "#d17583"),
  },
  {
    id: "wuwa-shorekeeper", name: "Shorekeeper", bg: "#e5edff", hair: "#e0eeff", tip: "#88a4d7", eye: "#6f9dd3", otherEye: "#9c91ce", outfit: "#e7edf9",
    back: path("M32 37Q10 76 18 121L42 127 46 48M85 37Q115 71 110 123L86 128 81 48", "#cfdbf6", "#fff", 1.5) + path("M30 43Q24 87 31 117L44 116 43 48M87 43Q104 85 97 118L83 115 82 49", "url(#hair)"),
    fringe: "M28 65Q21 27 59 23Q98 22 100 65L87 67 84 43 74 55 68 40 58 56 50 43 40 59 35 75Z",
    detail: path("M39 36Q51 28 63 31M33 79 35 104M94 80 91 103", "none", "#f7fbff", 1.5),
    accessory: path("M31 43Q63 12 97 43L93 30Q63 8 35 30Z", "#f2f5ff", "#a9b8df") + path("M64 32Q48 21 50 34Q51 43 63 40Q75 44 78 33Q80 22 64 32Z", "#8ca9dc", "#cfdef3") + jewel(64, 37, "#7c8dcb") + star(98, 94, "#a9a6d6", 7) + star(27, 91, "#fff", 4),
    costume: path("M41 103 54 109 64 105 75 109 87 103 79 121 65 116 50 121Z", "#91acd4", "#f5f7ff", 1.2) + jewel(64, 114, "#b2b1e0"),
  },
  {
    id: "wuwa-iuno", name: "Iuno", bg: "#e7edf8", hair: "#7d8da9", tip: "#475d85", eye: "#5986b5", outfit: "#f0eee5",
    back: path("M31 39Q10 50 13 91L25 125 41 117 42 45M87 39Q113 51 115 91L105 126 88 118 82 45", "url(#hair)"),
    fringe: "M28 65Q21 27 62 22Q102 22 100 66L87 63 83 43 75 57 67 44 57 56 49 42 40 61 35 73Z",
    detail: path("M26 65 21 104M101 67 107 106M43 36Q53 29 66 31", "none", "#bdc8db", 1.5),
    accessory: path("M33 47Q40 24 58 25M95 47Q88 24 70 25", "none", gold, 1.5) + path("M36 41Q23 29 39 30Q32 15 47 25Q44 12 55 22L59 26M91 41Q105 29 89 30Q96 15 81 25Q84 12 73 22L69 26", gold, "#ebd7a3", .7) + jewel(64, 32, "#c3d8e4"),
    costume: path("M40 104 52 101 64 110 77 101 89 104 81 119 65 115 48 119Z", "#fffaf0", gold, 1.2) + path("M52 109Q64 125 77 109M54 114Q64 130 74 114", "none", gold, 1.3) + jewel(64, 115, "#87a9c8"),
  },
];

function eyes(character) {
  if (character.name === "Columbina") return path("M40 73Q47 77 54 72M74 72Q81 77 88 72", "none", ink, 1.5);
  return [47, 81].map((x, index) => {
    const iris = index === 1 ? character.otherEye ?? character.eye : character.eye;
    return ellipse(x, 73, 9, 10, "#fffdf9") + ellipse(x, 74, 6.4, 9, iris)
      + ellipse(x, 72, 3, 6, "#343447") + ellipse(x - 2.5, 69, 2.6, 2.8, "#fff")
      + ellipse(x + 2.5, 78, 1.5, 1.5, "#fff7e7")
      + path(`M${x - 9} 69q7-8 18 0l2-2`, "none", ink, 1.8)
      + (character.crossEyes ? path(`M${x - 3} 71l6 6m0-6-6 6`, "none", "#ffb4b9", 1) : "");
  }).join("");
}

function portrait(character) {
  const skin = "#ffe9db";
  const defs = `<defs><linearGradient id="hair" x2=".25" y2="1"><stop stop-color="${character.hair}"/><stop offset=".55" stop-color="${character.hair}"/><stop offset="1" stop-color="${character.tip}"/></linearGradient></defs>`;
  const background = `<rect width="128" height="128" rx="28" fill="${character.bg}"/>` + ellipse(64, 68, 52, 52, "#ffffff45") + star(109, 24, "#fff", 5) + star(17, 86, "#fff", 3);
  const body = path("M23 128Q25 104 52 101H76Q102 104 105 128", character.outfit, ink, .8)
    + path("M56 91H72V105Q64 112 56 105Z", skin, "#dabfbc", .6) + character.costume;
  const face = ellipse(31, 72, 7, 10, skin) + ellipse(97, 72, 7, 10, skin)
    + path("M32 49Q34 27 64 28Q94 27 96 49V74Q94 99 64 103Q34 99 32 74Z", skin, "#d6b8b5", .8)
    + path("M34 77Q36 98 64 101Q93 96 94 77Q87 96 64 97Q41 96 34 77", "#f9d3c8")
    + eyes(character) + ellipse(40, 85, 6.5, 2.8, "#eeabb3") + ellipse(88, 85, 6.5, 2.8, "#eeabb3")
    + path("M61 93Q64 96 68 92", "none", "#986c77", 1.2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><title>${character.name}</title>${defs}${background}${character.back}${body}${face}${path(character.fringe, "url(#hair)", character.name === "Arlecchino" ? "#a8a4b4" : ink, .7)}${character.detail}${character.accessory}</svg>\n`;
}

await mkdir(destination, { recursive: true });
for (const character of characters) {
  const svg = portrait(character);
  if (Buffer.byteLength(svg) > 6144) throw new Error(`${character.id} exceeds the 6 KiB size budget`);
  await writeFile(new URL(`${character.id}.svg`, destination), svg);
}
console.log(`Generated ${characters.length} character avatars.`);
