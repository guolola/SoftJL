// Tracks generation attempts and applies account-level usage policies.
import type {
  ProviderTaskType,
  ProviderUsageTracker,
} from "../provider-configs/provider-usage-tracker.js";

export type GenerationUsageScope = "user" | "visitor";

export type AccountGenerationUsage = {
  usedToday: number;
  limit: number | null;
  remaining: number | null;
  windowSeconds: number;
  limited: boolean;
  scope: GenerationUsageScope;
};

export type GenerationLimitDecision = {
  allowed: boolean;
  usage: AccountGenerationUsage;
};

export type GenerationUsageIdentity = {
  userId: string;
  email?: string | null;
  ipAddress?: string | null;
};

export type GenerationUsageRecordInput = GenerationUsageIdentity & {
  taskType: ProviderTaskType;
  providerConfigId?: string | null;
};

type MemoryUsageEvent = {
  userId: string;
  email: string | null;
  ipAddress: string | null;
  taskType: ProviderTaskType;
  createdAt: string;
};

const DEFAULT_GUEST_EMAIL = "guest@example.edu";
const DEFAULT_GUEST_DAILY_LIMIT = 5;
const DEFAULT_WINDOW_SECONDS = 60 * 60 * 24;
const GENERATION_TASK_TYPES = new Set<ProviderTaskType>([
  "requirements_to_uml",
  "design_modeling",
  "code_generation",
  "document_generation",
]);
const GENERATION_TASK_TYPE_LIST = Array.from(GENERATION_TASK_TYPES);

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? null;
}

function normalizeIpAddress(ipAddress: string | null | undefined) {
  return ipAddress?.trim() || null;
}

function isGenerationTask(taskType: ProviderTaskType) {
  return GENERATION_TASK_TYPES.has(taskType);
}

function readPositiveInteger(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

export function createGenerationUsageService({
  guestEmail = process.env.UML_GUEST_EMAIL ?? DEFAULT_GUEST_EMAIL,
  guestDailyLimit = readPositiveInteger(
    process.env.UML_GUEST_DAILY_LIMIT,
    DEFAULT_GUEST_DAILY_LIMIT,
  ),
  guestWindowSeconds = readPositiveInteger(
    process.env.UML_GUEST_LIMIT_WINDOW_SECONDS,
    DEFAULT_WINDOW_SECONDS,
  ),
  providerUsageTracker,
  now = () => new Date(),
}: {
  guestEmail?: string;
  guestDailyLimit?: number;
  guestWindowSeconds?: number;
  providerUsageTracker?: ProviderUsageTracker;
  now?: () => Date;
} = {}) {
  const memoryEvents: MemoryUsageEvent[] = [];
  const normalizedGuestEmail = normalizeEmail(guestEmail) ?? DEFAULT_GUEST_EMAIL;

  function isGuest(identity: Pick<GenerationUsageIdentity, "email">) {
    return normalizeEmail(identity.email) === normalizedGuestEmail;
  }

  function policyFor(identity: GenerationUsageIdentity) {
    const limited = isGuest(identity);
    const ipAddress = normalizeIpAddress(identity.ipAddress);
    return {
      limited,
      limit: limited ? guestDailyLimit : null,
      windowSeconds: limited ? guestWindowSeconds : DEFAULT_WINDOW_SECONDS,
      scope: limited && ipAddress ? "visitor" : "user",
      ipAddress,
    } as const;
  }

  function windowStartIso(windowSeconds: number) {
    return new Date(now().getTime() - windowSeconds * 1000).toISOString();
  }

  async function countPersistedUsage(identity: GenerationUsageIdentity, windowSeconds: number) {
    const policy = policyFor(identity);
    const startedAt = windowStartIso(windowSeconds);
    if (providerUsageTracker?.countUsageEvents) {
      return providerUsageTracker.countUsageEvents({
        userId: identity.userId,
        taskTypes: GENERATION_TASK_TYPE_LIST,
        createdAfter: startedAt,
        ipAddress: policy.scope === "visitor" ? policy.ipAddress : null,
      });
    }

    const listUsageEvents = providerUsageTracker?.listUsageEvents;
    if (!listUsageEvents) return 0;
    const events = await listUsageEvents();
    return events.filter((event) => {
      if (event.userId !== identity.userId) return false;
      if (!isGenerationTask(event.taskType)) return false;
      if (event.createdAt < startedAt) return false;
      if (policy.scope === "visitor") {
        return event.ipAddress === policy.ipAddress;
      }
      return true;
    }).length;
  }

  function countMemoryUsage(identity: GenerationUsageIdentity, windowSeconds: number) {
    const policy = policyFor(identity);
    const startedAt = windowStartIso(windowSeconds);
    return memoryEvents.filter((event) => {
      if (event.userId !== identity.userId) return false;
      if (!isGenerationTask(event.taskType)) return false;
      if (event.createdAt < startedAt) return false;
      if (policy.scope === "visitor") {
        return event.ipAddress === policy.ipAddress;
      }
      return true;
    }).length;
  }

  async function getAccountGenerationUsage(
    identity: GenerationUsageIdentity,
  ): Promise<AccountGenerationUsage> {
    const policy = policyFor(identity);
    const usedToday =
      (await countPersistedUsage(identity, policy.windowSeconds)) +
      countMemoryUsage(identity, policy.windowSeconds);
    const remaining =
      policy.limit === null ? null : Math.max(policy.limit - usedToday, 0);
    return {
      usedToday,
      limit: policy.limit,
      remaining,
      windowSeconds: policy.windowSeconds,
      limited: policy.limited,
      scope: policy.scope,
    };
  }

  return {
    async checkGenerationLimit(
      identity: GenerationUsageIdentity,
    ): Promise<GenerationLimitDecision> {
      const usage = await getAccountGenerationUsage(identity);
      return {
        allowed: !usage.limited || usage.remaining === null || usage.remaining > 0,
        usage,
      };
    },

    async recordGenerationUsage(input: GenerationUsageRecordInput) {
      if (!isGenerationTask(input.taskType)) return;
      if (
        (providerUsageTracker?.countUsageEvents || providerUsageTracker?.listUsageEvents) &&
        input.providerConfigId
      ) {
        return;
      }
      memoryEvents.push({
        userId: input.userId,
        email: normalizeEmail(input.email),
        ipAddress: normalizeIpAddress(input.ipAddress),
        taskType: input.taskType,
        createdAt: now().toISOString(),
      });
    },

    getAccountGenerationUsage,
  };
}

export type GenerationUsageService = ReturnType<typeof createGenerationUsageService>;
