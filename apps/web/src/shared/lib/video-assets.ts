// Resolves public OSS video URLs while allowing Next.js build-time overrides.
const DEFAULT_PUBLIC_VIDEO_BASE_URL =
  "https://tuolola.oss-cn-chengdu.aliyuncs.com/video";

function defaultPublicVideoUrl(fileName: string) {
  return `${DEFAULT_PUBLIC_VIDEO_BASE_URL}/${encodeURIComponent(fileName)}`;
}

const DEFAULT_TUTORIAL_QUICK_START_VIDEO_URL =
  defaultPublicVideoUrl("项目演示.mp4");
const DEFAULT_WORKFLOW_CHAIN_VIDEO_URL =
  defaultPublicVideoUrl("使用流程.mp4");
const DEFAULT_MARKETING_PROMO_VIDEO_URL =
  defaultPublicVideoUrl("平台介绍.mp4");

function envVideoUrl(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

export const TUTORIAL_QUICK_START_VIDEO_URL = envVideoUrl(
  process.env.NEXT_PUBLIC_TUTORIAL_QUICK_START_VIDEO_URL,
  DEFAULT_TUTORIAL_QUICK_START_VIDEO_URL,
);

export const MARKETING_PROMO_VIDEO_URL = envVideoUrl(
  process.env.NEXT_PUBLIC_MARKETING_PROMO_VIDEO_URL,
  DEFAULT_MARKETING_PROMO_VIDEO_URL,
);

export const WORKFLOW_CHAIN_VIDEO_URL = envVideoUrl(
  process.env.NEXT_PUBLIC_WORKFLOW_CHAIN_VIDEO_URL,
  DEFAULT_WORKFLOW_CHAIN_VIDEO_URL,
);
