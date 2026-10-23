// Shares the bundled avatar catalog and accepted image references across API and web.
import { z } from "zod";

// Local, optimized GIFs keep default avatars animated without depending on remote image hosts.
export const CHARACTER_AVATARS = [
  { url: "/avatars/momonga-tail-wag.gif", zh: "莫莫咖摇尾巴", en: "Momonga wagging tail" },
  { url: "/avatars/usagi-happy-meal.gif", zh: "乌萨奇开心吃饭", en: "Usagi enjoying a meal" },
  { url: "/avatars/hachiware-tongue-out.gif", zh: "小八吐舌头", en: "Hachiware sticking out tongue" },
  { url: "/avatars/hachiware-guitar.gif", zh: "小八弹吉他", en: "Hachiware playing guitar" },
  { url: "/avatars/momonga-bow.gif", zh: "莫莫咖蝴蝶结", en: "Momonga with a bow" },
  { url: "/avatars/chiikawa-shy.gif", zh: "吉伊害羞", en: "Shy Chiikawa" },
  { url: "/avatars/usagi-cola.gif", zh: "乌萨奇喝可乐", en: "Usagi drinking cola" },
  { url: "/avatars/chiikawa-hachiware-jumping.gif", zh: "吉伊小八蹦跳", en: "Chiikawa and Hachiware jumping" },
  { url: "/avatars/chiikawa-shy-turn.gif", zh: "吉伊害羞回头", en: "Chiikawa turning shyly" },
  { url: "/avatars/usagi-arms-folded.gif", zh: "乌萨奇抱手抬头", en: "Usagi looking up with arms folded" },
  { url: "/avatars/chiikawa-cheerleader.gif", zh: "吉伊啦啦队", en: "Chiikawa cheerleading" },
  { url: "/avatars/chiikawa-happy-meal.gif", zh: "吉伊开心吃饭", en: "Chiikawa enjoying a meal" },
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
