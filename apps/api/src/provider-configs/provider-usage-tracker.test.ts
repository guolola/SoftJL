// Verifies the provider usage tracker skeleton records quota dimensions for future rate limiting.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createProviderUsageTracker,
  resolveProviderRateLimitPolicy,
  selectProviderRateLimitPolicy,
} from "./provider-usage-tracker.js";
import type { Queryable } from "../db/transactions.js";

class CapturingClient implements Queryable {
  readonly calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  rows: unknown[] = [];
  queuedRows: unknown[][] = [];

  async query(sql: string, params: readonly unknown[] = []) {
    this.calls.push({ sql, params });
    const rows = this.queuedRows.shift() ?? this.rows;
    return { rows, rowCount: rows.length };
  }
}

test("provider usage tracker records user/project/provider/taskType usage dimensions", async () => {
  const client = new CapturingClient();
  const tracker = createProviderUsageTracker(client);

  await tracker.recordUsage({
    userId: "user-1",
    projectId: "project-1",
    providerConfigId: "provider-1",
    taskType: "requirements_to_uml",
    ipAddress: "203.0.113.7",
    units: 3,
    outcome: "success",
  });

  assert.match(client.calls[0]?.sql ?? "", /insert into provider_usage_events/i);
  assert.deepEqual(client.calls[0]?.params.slice(1, 9), [
    "user-1",
    "project-1",
    "provider-1",
    "requirements_to_uml",
    "203.0.113.7",
    null,
    3,
    "success",
  ]);
});

test("provider usage tracker records provider model, course, class, and token metadata", async () => {
  const client = new CapturingClient();
  const tracker = createProviderUsageTracker(client);

  await tracker.recordUsage({
    userId: "user-1",
    projectId: "project-1",
    providerConfigId: "provider-1",
    provider: "openai",
    model: "gpt-4.1",
    taskType: "requirements_to_uml",
    courseId: "course-1",
    classId: "class-1",
    tokenUsage: {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
    },
  });

  assert.match(client.calls[0]?.sql ?? "", /metadata/i);
  assert.deepEqual(client.calls[0]?.params.at(-1), {
    provider: "openai",
    model: "gpt-4.1",
    courseId: "course-1",
    classId: "class-1",
    tokenUsage: {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
    },
  });
});

test("provider usage tracker returns an allow decision with current window usage", async () => {
  const client = new CapturingClient();
  client.queuedRows = [[], [{ used_units: "9" }]];
  const tracker = createProviderUsageTracker(client);

  const decision = await tracker.checkLimit({
    userId: "user-1",
    projectId: "project-1",
    providerConfigId: "provider-1",
    taskType: "requirements_to_uml",
    limit: 10,
    windowSeconds: 60,
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.usedUnits, 9);
  assert.equal(decision.remainingUnits, 1);
  assert.match(client.calls.at(-1)?.sql ?? "", /from provider_usage_events/i);
});

test("provider usage tracker sends only parameters referenced by the default limit query", async () => {
  const client = new CapturingClient();
  client.queuedRows = [[], [{ used_units: "0" }]];
  const tracker = createProviderUsageTracker(client);

  await tracker.checkLimit({
    userId: "user-1",
    projectId: "project-1",
    providerConfigId: "provider-1",
    taskType: "requirements_to_uml",
    ipAddress: "203.0.113.7",
    organizationId: "org-1",
    limit: 10,
    windowSeconds: 60,
  });

  assert.equal(client.calls.at(-1)?.params.length, 5);
});

test("provider usage tracker sums units by task type for dashboard metrics", async () => {
  const client = new CapturingClient();
  client.rows = [
    { task_type: "requirements_to_uml", used_units: "4" },
    { task_type: "document_generation", used_units: "2" },
  ];
  const tracker = createProviderUsageTracker(client);

  const sums = await tracker.sumUsageUnits?.({
    taskTypes: ["requirements_to_uml", "document_generation"],
    createdAfter: "2026-06-04T16:00:00.000Z",
    createdBefore: "2026-06-05T10:00:00.000Z",
  });

  assert.deepEqual(sums, [
    { taskType: "requirements_to_uml", units: 4 },
    { taskType: "document_generation", units: 2 },
  ]);
  assert.match(client.calls[0]?.sql ?? "", /group by task_type/i);
  assert.deepEqual(client.calls[0]?.params, [
    ["requirements_to_uml", "document_generation"],
    "2026-06-04T16:00:00.000Z",
    "2026-06-05T10:00:00.000Z",
  ]);
});

test("provider usage tracker exposes a conservative one-hour default policy", () => {
  const policy = resolveProviderRateLimitPolicy({
    UML_PROVIDER_HOURLY_LIMIT: "7",
  });

  assert.equal(policy.limit, 7);
  assert.equal(policy.windowSeconds, 60 * 60);
  assert.equal(policy.source, "env");
});

test("provider usage tracker selects the most specific enabled matching policy", () => {
  const fallback = resolveProviderRateLimitPolicy({
    UML_PROVIDER_HOURLY_LIMIT: "60",
  });
  const selected = selectProviderRateLimitPolicy(
    {
      userId: "user-1",
      projectId: "project-1",
      providerConfigId: "provider-1",
      taskType: "requirements_to_uml",
    },
    [
      {
        id: "global-disabled",
        scopeType: "global",
        scopeId: null,
        providerConfigId: null,
        taskType: null,
        limit: 100,
        windowSeconds: 3600,
        enabled: false,
        createdAt: "2026-05-22T00:00:00.000Z",
        updatedAt: "2026-05-22T00:00:00.000Z",
      },
      {
        id: "provider-generic",
        scopeType: "provider",
        scopeId: null,
        providerConfigId: "provider-1",
        taskType: null,
        limit: 20,
        windowSeconds: 3600,
        enabled: true,
        createdAt: "2026-05-22T00:00:00.000Z",
        updatedAt: "2026-05-22T00:00:00.000Z",
      },
      {
        id: "project-provider-task",
        scopeType: "project",
        scopeId: "project-1",
        providerConfigId: "provider-1",
        taskType: "requirements_to_uml",
        limit: 7,
        windowSeconds: 600,
        enabled: true,
        createdAt: "2026-05-22T00:00:00.000Z",
        updatedAt: "2026-05-22T00:00:00.000Z",
      },
    ],
    fallback,
  );

  assert.equal(selected.id, "project-provider-task");
  assert.equal(selected.limit, 7);
  assert.equal(selected.windowSeconds, 600);
  assert.equal(selected.source, "stored");
});

test("provider usage tracker applies IP-scoped policy checks with IP dimensions", async () => {
  const client = new CapturingClient();
  client.queuedRows = [
    [
      {
        id: "ip-policy",
        scope_type: "ip",
        scope_id: "203.0.113.7",
        provider_config_id: "provider-1",
        task_type: "provider_test",
        limit_count: "1",
        window_seconds: "60",
        enabled: true,
        created_at: "2026-05-22T00:00:00.000Z",
        updated_at: "2026-05-22T00:00:00.000Z",
      },
    ],
    [{ used_units: "1" }],
  ];
  const tracker = createProviderUsageTracker(client);

  const decision = await tracker.checkLimit({
    userId: "user-1",
    projectId: "project-1",
    providerConfigId: "provider-1",
    taskType: "provider_test",
    ipAddress: "203.0.113.7",
    limit: 60,
    windowSeconds: 3600,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.limit, 1);
  assert.match(client.calls.at(-1)?.sql ?? "", /ip_address = \$6/i);
  assert.equal(client.calls.at(-1)?.params[5], "203.0.113.7");
});

test("provider usage tracker lists usage events with nullable token usage", async () => {
  const client = new CapturingClient();
  client.rows = [
    {
      id: "usage-1",
      user_id: "user-1",
      project_id: "project-1",
      provider_config_id: "provider-1",
      provider: "openai",
      default_model: "gpt-4.1",
      task_type: "requirements_to_uml",
      units: "1",
      outcome: "success",
      metadata: {
        courseId: "course-1",
        classId: "class-1",
        model: "gpt-4.1-mini",
      },
      created_at: "2026-05-22T00:00:00.000Z",
    },
  ];
  const tracker = createProviderUsageTracker(client);

  const events = await tracker.listUsageEvents();

  assert.equal(events[0]?.courseId, "course-1");
  assert.equal(events[0]?.classId, "class-1");
  assert.equal(events[0]?.provider, "openai");
  assert.equal(events[0]?.model, "gpt-4.1-mini");
  assert.equal(events[0]?.tokenUsage, null);
  assert.match(client.calls[0]?.sql ?? "", /from provider_usage_events/i);
});
