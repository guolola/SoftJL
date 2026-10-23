// Verifies API render behavior through the assembled server.

import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryAuthStore } from "../../src/auth/in-memory-auth-store.js";

import { assertApiErrorCode, createMockLlmTransport, createTestApiServer } from "../fixtures/api-run-fixtures.js";

test("api proxies manual PlantUML render requests", async () => {
  const authStore = createInMemoryAuthStore();
  const user = await authStore.createUser({
    username: "render_owner",
    displayName: "Render Owner",
    passwordHash: "hash",
  });
  assert.ok(user);
  const session = await authStore.createSession({
    userId: user.id,
    ipAddress: "127.0.0.1",
    userAgent: "node:test",
  });
  const { project } = await authStore.createProject({
    ownerUserId: user.id,
    name: "Render Project",
  });
  const app = await createTestApiServer({
    authStore,
    llmTransport: createMockLlmTransport(),
    renderClient: async (artifact) => ({
      svg: `<svg><text>${artifact.diagramKind}</text></svg>`,
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: artifact.source.length,
        durationMs: 4,
      },
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/render/svg",
    headers: {
      cookie: `uml_session=${encodeURIComponent(session.id)}`,
      "x-uml-project-id": project.id,
    },
    payload: {
      diagramKind: "class",
      plantUmlSource: "@startuml\nclass User\n",
    },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.match(body.svg, /class/);
  assert.equal(body.renderMeta.sourceLength, "@startuml\nclass User\n".length);

  await app.close();
});

test("api rerenders structured use case models without calling the LLM", async () => {
  const authStore = createInMemoryAuthStore();
  const user = await authStore.createUser({
    username: "structured_render_owner",
    displayName: "Structured Render Owner",
    passwordHash: "hash",
  });
  assert.ok(user);
  const session = await authStore.createSession({
    userId: user.id,
    ipAddress: "127.0.0.1",
    userAgent: "node:test",
  });
  const { project } = await authStore.createProject({
    ownerUserId: user.id,
    name: "Structured Render Project",
  });
  let renderedSource = "";
  const app = await createTestApiServer({
    authStore,
    llmTransport: createMockLlmTransport(),
    renderClient: async (artifact) => {
      renderedSource = artifact.source;
      return {
        svg: `<svg><text>${artifact.diagramKind}:${artifact.source.includes("发起")}</text></svg>`,
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: artifact.source.length,
          durationMs: 4,
        },
      };
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/render/model",
    headers: {
      cookie: `uml_session=${encodeURIComponent(session.id)}`,
      "x-uml-project-id": project.id,
    },
    payload: {
      stage: "requirements",
      model: {
        diagramKind: "usecase",
        title: "登录用例模型",
        summary: "教师登录系统。",
        notes: [],
        actors: [
          {
            id: "actor_teacher",
            name: "教师",
            actorType: "human",
            responsibilities: [],
          },
        ],
        useCases: [
          {
            id: "uc_login",
            systemBoundaryId: "system",
            name: "登录",
            goal: "进入系统",
            preconditions: [],
            postconditions: [],
            supportingActorIds: [],
          },
        ],
        systemBoundaries: [{ id: "system", name: "实验平台" }],
        relationships: [
          {
            id: "rel_login",
            type: "association",
            sourceId: "actor_teacher",
            targetId: "uc_login",
            label: "发起",
            description: "教师发起登录。",
          },
        ],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.match(body.plantUmlSource, /actor "教师"/);
  assert.match(body.plantUmlSource, /发起/);
  assert.equal(body.renderMeta.sourceLength, renderedSource.length);
  assert.match(body.svg, /usecase:true/);

  await app.close();
});

test("api rejects anonymous manual PlantUML render requests", async () => {
  const app = await createTestApiServer({
    llmTransport: createMockLlmTransport(),
    renderClient: async () => {
      throw new Error("render should not be called");
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/render/svg",
    payload: {
      diagramKind: "class",
      plantUmlSource: "@startuml\nclass User\n",
    },
  });

  assert.equal(response.statusCode, 401);
  assertApiErrorCode(response, "AUTHENTICATION_REQUIRED");

  await app.close();
});

test("api reports manual PlantUML render failures clearly", async () => {
  const authStore = createInMemoryAuthStore();
  const user = await authStore.createUser({
    username: "render_failure_owner",
    displayName: "Render Failure Owner",
    passwordHash: "hash",
  });
  assert.ok(user);
  const session = await authStore.createSession({
    userId: user.id,
    ipAddress: "127.0.0.1",
    userAgent: "node:test",
  });
  const { project } = await authStore.createProject({
    ownerUserId: user.id,
    name: "Render Failure Project",
  });
  const app = await createTestApiServer({
    authStore,
    llmTransport: createMockLlmTransport(),
    renderClient: async () => {
      throw new Error("Syntax Error? (line 2)");
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/render/svg",
    headers: {
      cookie: `uml_session=${encodeURIComponent(session.id)}`,
      "x-uml-project-id": project.id,
    },
    payload: {
      diagramKind: "activity",
      plantUmlSource: "@startuml\nbroken\n",
    },
  });

  assert.equal(response.statusCode, 400);
  assertApiErrorCode(response, "VALIDATION_FAILED");

  await app.close();
});

test("api rejects invalid manual render requests with 400", async () => {
  const authStore = createInMemoryAuthStore();
  const user = await authStore.createUser({
    username: "render_invalid_owner",
    displayName: "Render Invalid Owner",
    passwordHash: "hash",
  });
  assert.ok(user);
  const session = await authStore.createSession({
    userId: user.id,
    ipAddress: "127.0.0.1",
    userAgent: "node:test",
  });
  const { project } = await authStore.createProject({
    ownerUserId: user.id,
    name: "Render Invalid Project",
  });
  const app = await createTestApiServer({
    authStore,
    llmTransport: createMockLlmTransport(),
    renderClient: async () => ({
      svg: "<svg />",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 0,
        durationMs: 1,
      },
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/render/svg",
    headers: {
      cookie: `uml_session=${encodeURIComponent(session.id)}`,
      "x-uml-project-id": project.id,
    },
    payload: {
      diagramKind: "unknown",
      plantUmlSource: "",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.body, /diagramKind|plantUmlSource/);

  await app.close();
});
