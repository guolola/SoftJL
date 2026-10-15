// Verifies account generation usage policies independent of run route wiring.
import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderUsageTracker } from "../provider-configs/provider-usage-tracker.js";
import { createGenerationUsageService } from "./generation-usage.js";

test("regular users are counted without being limited", async () => {
  const service = createGenerationUsageService({
    now: () => new Date("2026-05-25T08:00:00.000Z"),
  });

  const decision = await service.checkGenerationLimit({
    userId: "user-1",
    email: "student@example.edu",
    ipAddress: "203.0.113.10",
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.usage.limited, false);
  assert.equal(decision.usage.limit, null);

  await service.recordGenerationUsage({
    userId: "user-1",
    email: "student@example.edu",
    ipAddress: "203.0.113.10",
    taskType: "requirements_to_uml",
  });

  const usage = await service.getAccountGenerationUsage({
    userId: "user-1",
    email: "student@example.edu",
    ipAddress: "203.0.113.10",
  });
  assert.equal(usage.usedToday, 1);
  assert.equal(usage.remaining, null);
  assert.equal(usage.scope, "user");
});

test("guest users are limited per visitor", async () => {
  const service = createGenerationUsageService({
    guestEmail: "guest@example.edu",
    guestDailyLimit: 2,
    now: () => new Date("2026-05-25T08:00:00.000Z"),
  });

  for (let index = 0; index < 2; index += 1) {
    const decision = await service.checkGenerationLimit({
      userId: "guest-user",
      email: "guest@example.edu",
      ipAddress: "203.0.113.10",
    });
    assert.equal(decision.allowed, true);
    await service.recordGenerationUsage({
      userId: "guest-user",
      email: "guest@example.edu",
      ipAddress: "203.0.113.10",
      taskType: "requirements_to_uml",
    });
  }

  const exhausted = await service.checkGenerationLimit({
    userId: "guest-user",
    email: "guest@example.edu",
    ipAddress: "203.0.113.10",
  });
  assert.equal(exhausted.allowed, false);
  assert.equal(exhausted.usage.usedToday, 2);
  assert.equal(exhausted.usage.remaining, 0);
  assert.equal(exhausted.usage.scope, "visitor");

  const otherVisitor = await service.checkGenerationLimit({
    userId: "guest-user",
    email: "guest@example.edu",
    ipAddress: "203.0.113.11",
  });
  assert.equal(otherVisitor.allowed, true);
  assert.equal(otherVisitor.usage.usedToday, 0);
  assert.equal(otherVisitor.usage.remaining, 2);
});

test("persisted usage counts use tracker-side filters", async () => {
  let countInput: Parameters<NonNullable<ProviderUsageTracker["countUsageEvents"]>>[0] | null =
    null;
  const tracker: ProviderUsageTracker = {
    async recordUsage() {},
    async checkLimit() {
      return {
        allowed: true,
        usedUnits: 0,
        remainingUnits: 60,
        limit: 60,
        windowSeconds: 3600,
      };
    },
    async countUsageEvents(input) {
      countInput = input;
      return 4;
    },
  };
  const service = createGenerationUsageService({
    guestEmail: "guest@example.edu",
    guestDailyLimit: 5,
    providerUsageTracker: tracker,
    now: () => new Date("2026-05-25T08:00:00.000Z"),
  });

  const usage = await service.getAccountGenerationUsage({
    userId: "guest-user",
    email: "guest@example.edu",
    ipAddress: "203.0.113.10",
  });

  assert.equal(usage.usedToday, 4);
  assert.equal(usage.remaining, 1);
  assert.deepEqual(countInput, {
    userId: "guest-user",
    taskTypes: [
      "requirements_to_uml",
      "design_modeling",
      "code_generation",
      "document_generation",
    ],
    createdAfter: "2026-05-24T08:00:00.000Z",
    ipAddress: "203.0.113.10",
  });
});
