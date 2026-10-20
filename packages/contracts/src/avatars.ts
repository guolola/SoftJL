// Shares the bundled avatar catalog and accepted image references across API and web.
import { z } from "zod";

// GameWith's 2025 favorite-character polls provide one consistent selection basis for both games.
export const CHARACTER_AVATARS = [
  { url: "/avatars/genshin-furina.svg", game: "genshin", zh: "芙宁娜", en: "Furina" },
  { url: "/avatars/genshin-columbina.svg", game: "genshin", zh: "哥伦比娅", en: "Columbina" },
  { url: "/avatars/genshin-flins.svg", game: "genshin", zh: "菲林斯", en: "Flins" },
  { url: "/avatars/genshin-arlecchino.svg", game: "genshin", zh: "阿蕾奇诺", en: "Arlecchino" },
  { url: "/avatars/genshin-wanderer.svg", game: "genshin", zh: "流浪者", en: "Wanderer" },
  { url: "/avatars/genshin-durin.svg", game: "genshin", zh: "杜林", en: "Durin" },
  { url: "/avatars/wuwa-changli.svg", game: "wuwa", zh: "长离", en: "Changli" },
  { url: "/avatars/wuwa-chisa.svg", game: "wuwa", zh: "千咲", en: "Chisa" },
  { url: "/avatars/wuwa-cartethyia.svg", game: "wuwa", zh: "卡提希娅", en: "Cartethyia" },
  { url: "/avatars/wuwa-phrolova.svg", game: "wuwa", zh: "弗洛洛", en: "Phrolova" },
  { url: "/avatars/wuwa-shorekeeper.svg", game: "wuwa", zh: "守岸人", en: "Shorekeeper" },
  { url: "/avatars/wuwa-iuno.svg", game: "wuwa", zh: "尤诺", en: "Iuno" },
] as const;

export const DEFAULT_AVATARS = [CHARACTER_AVATARS[0].url, ...CHARACTER_AVATARS.slice(1).map(avatar => avatar.url)] as const;

export const defaultAvatarSchema = z.enum(DEFAULT_AVATARS);
// Only bundled paths may be relative; external profile updates still require HTTPS.
export const avatarUrlSchema = z.union([defaultAvatarSchema, z.string().url()]);
export const avatarUpdateUrlSchema = z.union([
  defaultAvatarSchema,
  z.string().trim().url().refine((value) => /^https:/iu.test(value), {
    message: "Avatar URL must use HTTPS",
  }),
]);
