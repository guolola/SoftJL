// Verifies API documents behavior through the assembled server.

import assert from "node:assert/strict";
import test from "node:test";

import { DESIGN_SEQUENCE_MODEL, DOCUMENT_WORKSPACE_HEADERS, MANAGED_PROVIDER_SETTINGS, RULES_JSON, USECASE_MODEL_JSON, VALID_PNG, assertApiErrorCode, createTestApiServer, expectedResponseFormat, extractZipEntries, lastPromptText, startProjectRun } from "../fixtures/api-run-fixtures.js";

function currentChapterSections(prompt: string, body: string) {
  const context = JSON.parse(prompt.split("当前产物上下文：").at(-1)!.trim());
  return context.canonicalSections.map((section: { level: number; title: string; tableHeaders?: string[] }) => ({
    level: section.level, title: section.title, body: [body],
    ...(section.tableHeaders ? { table: { headers: section.tableHeaders, rows: [] } } : {}),
  }));
}

test("api document run embeds PlantUML diagrams as PNG files in DOCX", async () => {
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages }) {
        assert.match(lastPromptText(messages), /需求规格说明书/);
        yield JSON.stringify({ sections: currentChapterSections(lastPromptText(messages), "说明系统面向的用户与范围。") });
      },
    },
    pngRenderClient: async (artifact) => ({
      png: VALID_PNG,
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: artifact.source.length,
        durationMs: 1,
      },
    }),
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/document-runs",
    headers: DOCUMENT_WORKSPACE_HEADERS,
    payload: {
      documentKind: "requirementsSpec",
      requirementText: "根据需求生成说明书。",
      rules: JSON.parse(RULES_JSON).rules,
      requirementModels: [JSON.parse(USECASE_MODEL_JSON).models[0]],
      requirementPlantUml: [
        {
          diagramKind: "usecase",
          source: "@startuml\nactor 用户\n",
        },
      ],
      requirementSvgArtifacts: [
        {
          diagramKind: "usecase",
          svg: "<svg><text>usecase</text></svg>",
          renderMeta: {
            engine: "plantuml",
            generatedAt: new Date().toISOString(),
            sourceLength: 24,
            durationMs: 1,
          },
        },
      ],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
      useAiText: true,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const runId = startResponse.json().runId;
  const events = await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/events`,
  });
  assert.match(events.body, /"artifactKind":"document"/);
  assert.match(events.body, /"type":"completed"/);

  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/document-runs/${runId}`,
    })
  ).json();
  assert.equal(snapshot.status, "completed");
  assert.ok(
    !snapshot.missingArtifacts.some((item: string) => item.startsWith("usecase")),
  );

  const download = await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/download`,
  });
  assert.equal(download.statusCode, 200);
  const entries = extractZipEntries(download.rawPayload);
  const mediaPngs = [...entries.keys()].filter((name) =>
    /^word\/media\/.+\.png$/.test(name),
  );
  assert.ok(mediaPngs.length > 0);
  const documentXml = entries.get("word/document.xml")?.toString("utf8") ?? "";
  const stylesXml = entries.get("word/styles.xml")?.toString("utf8") ?? "";
  const relsXml =
    entries.get("word/_rels/document.xml.rels")?.toString("utf8") ?? "";
  assert.match(
    download.headers["content-disposition"] ?? "",
    /%E9%9C%80%E6%B1%82%E8%A7%84%E6%A0%BC%E8%AF%B4%E6%98%8E%E4%B9%A6-\d{8}-\d{6}-\d{3}\.docx/,
  );
  assert.doesNotMatch(documentXml, /成都信息工程大学/);
  assert.doesNotMatch(documentXml, /软件工程学院/);
  assert.match(documentXml, /课程设计文档/);
  assert.match(documentXml, /目录/);
  assert.match(documentXml, /TOC/);
  assert.match(documentXml, /Heading1/);
  assert.match(documentXml, /Heading2/);
  assert.match(documentXml, /Heading3/);
  assert.match(documentXml, /2\.3 功能结构/);
  assert.match(documentXml, /2\.4 总体业务流程/);
  assert.match(documentXml, /3 功能需求（用例模型）/);
  assert.match(documentXml, /3\.1 用例图/);
  assert.match(documentXml, /3\.3 用例：生成模型/);
  assert.match(documentXml, /4 数据需求（领域概念模型）/);
  assert.match(documentXml, /编号/);
  assert.match(documentXml, /需求规则/);
  assert.match(documentXml, /模型元素/);
  assert.doesNotMatch(documentXml, /追踪依据/);
  assert.doesNotMatch(documentXml, /图示：/);
  assert.doesNotMatch(documentXml, /当前阶段未明确|待填写|待补充|待完善|后续评审/);
  assert.match(documentXml, /1 项目引言<\/w:t><w:tab\/><w:t(?: [^>]*)?>1<\/w:t>/);
  assert.match(documentXml, /3 功能需求（用例模型）<\/w:t><w:tab\/><w:t(?: [^>]*)?>\d+<\/w:t>/);
  assert.match(documentXml, /<w:pgNumType w:start="1"\/>/);
  assert.match(documentXml, /项目名称：未提供\/待确认/);
  assert.match(documentXml, /文档类型：需求规格说明书/);
  assert.match(documentXml, /文档版本：V1\.0/);
  assert.match(documentXml, /生成日期：\d{4}-\d{2}-\d{2}/);
  assert.match(documentXml, /图 用例图/);
  assert.match(stylesXml, /Times New Roman/);
  assert.match(stylesXml, /SimHei/);
  assert.match(stylesXml, /SimSun/);
  assert.match(stylesXml, /w:sz[^>]+w:val="32"/);
  assert.match(stylesXml, /w:spacing[^>]+w:before="260"/);
  assert.match(stylesXml, /w:spacing[^>]+w:after="260"/);
  assert.match(stylesXml, /w:spacing[^>]+w:line="415"/);
  assert.match(relsXml, /media\/.+\.png/);

  await app.close();
});

test("api software design document uses generic cover without school names", async () => {
  const app = await createTestApiServer();

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/document-runs",
    headers: DOCUMENT_WORKSPACE_HEADERS,
    payload: {
      documentKind: "softwareDesignSpec",
      requirementText: "根据设计产物生成软件设计说明书。",
      rules: JSON.parse(RULES_JSON).rules,
      requirementModels: JSON.parse(USECASE_MODEL_JSON).models,
      requirementPlantUml: [],
      requirementSvgArtifacts: [],
      designModels: [DESIGN_SEQUENCE_MODEL],
      designPlantUml: [],
      designSvgArtifacts: [],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
      useAiText: false,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const runId = startResponse.json().runId;
  const events = await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/events`,
  });
  assert.match(events.body, /"type":"completed"/);

  const download = await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/download`,
  });
  assert.equal(download.statusCode, 200);
  const entries = extractZipEntries(download.rawPayload);
  const documentXml = entries.get("word/document.xml")?.toString("utf8") ?? "";
  assert.doesNotMatch(documentXml, /成都信息工程大学/);
  assert.doesNotMatch(documentXml, /软件工程学院/);
  assert.match(documentXml, /课程设计文档/);
  assert.match(documentXml, /项目名称：未提供\/待确认/);
  assert.match(documentXml, /文档类型：软件设计说明书/);
  assert.match(documentXml, /文档版本：V1\.0/);
  assert.match(documentXml, /2\.1 系统总体逻辑流程设计/);
  assert.match(documentXml, /2\.2 系统架构设计/);
  assert.match(documentXml, /3 用例实现设计 \(Use Case Realization\)/);
  assert.match(documentXml, /3\.1 用例 生成模型 的实现方案/);
  assert.match(documentXml, /5 交互响应与前端组件设计/);
  assert.match(documentXml, /5\.3 跟踪关系/);
  assert.match(documentXml, /界面名称/);
  assert.match(documentXml, /4\.4 设计类跟踪矩阵/);
  assert.match(documentXml, /6 数据库设计/);
  assert.match(documentXml, /6\.2 表的详述/);
  assert.match(documentXml, /6\.3 表与表的关系详述/);
  assert.doesNotMatch(documentXml, /追踪依据/);
  assert.doesNotMatch(documentXml, /图示：/);
  assert.doesNotMatch(documentXml, /当前阶段未明确|待填写|待补充|待完善|后续评审/);

  await app.close();
});

test("api rejects legacy anonymous document workspace runs", async () => {
  const workspaceSuffix = Date.now().toString(36);
  const workspaceAHeaders = {
    "x-uml-workspace-id": `api-isolation-${workspaceSuffix}`,
    "x-uml-workspace-secret": "api-isolation-secret-value-123456",
  };
  const app = await createTestApiServer({ testRunAccessContext: undefined });

  try {
    const startResponse = await startProjectRun(app, {
      method: "POST",
      url: "/api/document-runs",
      headers: workspaceAHeaders,
      payload: {
        documentKind: "requirementsSpec",
        requirementText: "A 工作区需求说明书。",
        rules: [],
        requirementModels: [JSON.parse(USECASE_MODEL_JSON).models[0]],
        requirementPlantUml: [],
        requirementSvgArtifacts: [],
        designModels: [],
        designPlantUml: [],
        designSvgArtifacts: [],
        providerSettings: MANAGED_PROVIDER_SETTINGS,
        useAiText: false,
      },
    });
    assert.equal(startResponse.statusCode, 401);
    assertApiErrorCode(startResponse, "AUTHENTICATION_REQUIRED");
  } finally {
    await app.close();
  }
});

test("api document commands reject SVG-only sources without current PlantUML", async () => {
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion() {
        yield JSON.stringify({
          sections: [
            {
              level: 1,
              title: "1 项目引言",
              body: ["说明项目背景。"],
              diagramKind: "usecase",
            },
          ],
        });
      },
    },
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/document-runs",
    headers: DOCUMENT_WORKSPACE_HEADERS,
    payload: {
      documentKind: "requirementsSpec",
      requirementText: "根据需求生成说明书。",
      requirementModels: [JSON.parse(USECASE_MODEL_JSON).models[0]],
      requirementSvgArtifacts: [
        {
          diagramKind: "usecase",
          svg: "<svg><text>usecase</text></svg>",
          renderMeta: {
            engine: "plantuml",
            generatedAt: new Date().toISOString(),
            sourceLength: 24,
            durationMs: 1,
          },
        },
      ],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
      useAiText: true,
    },
  }, { plantUml: {} });

  assert.equal(startResponse.statusCode, 409);
  assertApiErrorCode(startResponse, "REQUIREMENT_PLANTUML_MISSING");
  await app.close();
});

test("api repairs document content JSON before rendering DOCX", async () => {
  let attempts = 0;
  const chapterAttempts = new Map<string, number>();
  const prompts: string[] = [];
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, runContext }) {
        const prompt = lastPromptText(messages);
        prompts.push(prompt);
        attempts += 1;
        const chapter = runContext?.subtaskId ?? "unknown";
        const count = (chapterAttempts.get(chapter) ?? 0) + 1;
        chapterAttempts.set(chapter, count);
        if (count === 1) {
          yield '{"sections":[{"level":4,"title":"","body":"bad"}]}';
          return;
        }
        assert.match(prompt, /修复上下文/);
        assert.match(prompt, /"level":4/);
        assert.match(prompt, /解析或校验错误/);
        const repair = JSON.parse(prompt.split("修复上下文：")[1]!.split("\n")[0]!);
        const corrected = { sections: currentChapterSections(prompt, "修复后的说明书正文。") };
        yield JSON.stringify({ targetId: repair.targetId, baseFingerprint: repair.baseFingerprint,
          changes: repair.paths.map((path: string) => ({ path, value: path.split(".").reduce<any>((value, key) => value[key], corrected) })),
        });
      },
    },
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/document-runs",
    headers: DOCUMENT_WORKSPACE_HEADERS,
    payload: {
      documentKind: "requirementsSpec",
      requirementText: "根据需求生成说明书。",
      requirementModels: [JSON.parse(USECASE_MODEL_JSON).models[0]],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
      useAiText: true,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const runId = startResponse.json().runId;
  const events = await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/events`,
  });
  assert.match(events.body, /说明书正文 JSON 结构不合法/);
  assert.match(events.body, /"type":"completed"/);
  assert.equal(attempts, chapterAttempts.size * 2);
  assert.ok(chapterAttempts.size > 1);
  assert.ok([...chapterAttempts.values()].every((count) => count === 2));
  assert.equal(prompts.length, attempts);

  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/document-runs/${runId}`,
    })
  ).json();
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.sections[0].title, "项目引言");
  const repairedSection = snapshot.sections.find(
    (section: { title: string }) => section.title === "需求概述",
  );
  assert.deepEqual(repairedSection?.body, ["修复后的说明书正文。"]);

  await app.close();
});

test("api fails document runs after document content repair attempts are exhausted", async () => {
  let attempts = 0;
  const chapterAttempts = new Map<string, number>();
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({ responseFormat, runContext }) {
        assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
        attempts += 1;
        const chapter = runContext?.subtaskId ?? "unknown";
        chapterAttempts.set(chapter, (chapterAttempts.get(chapter) ?? 0) + 1);
        yield '{"sections":[{"level":4,"title":"","body":"bad"}]}';
      },
    },
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/document-runs",
    headers: DOCUMENT_WORKSPACE_HEADERS,
    payload: {
      documentKind: "requirementsSpec",
      requirementText: "根据需求生成说明书。",
      requirementModels: [JSON.parse(USECASE_MODEL_JSON).models[0]],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
      useAiText: true,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const runId = startResponse.json().runId;
  const events = await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/events`,
  });
  assert.match(events.body, /"type":"failed"/);
  assert.equal(attempts, chapterAttempts.size * 6);
  assert.ok(chapterAttempts.size > 1);
  assert.ok([...chapterAttempts.values()].every((count) => count === 6));

  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/document-runs/${runId}`,
    })
  ).json();
  assert.equal(snapshot.status, "failed");
  assert.match(snapshot.error.message, /generate_document_text structured output failed/);

  await app.close();
});

test("api document run rejects exports before the required models exist", async () => {
  const app = await createTestApiServer();

  const requirementsResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/document-runs",
    headers: DOCUMENT_WORKSPACE_HEADERS,
    payload: {
      documentKind: "requirementsSpec",
      requirementText: "根据需求生成说明书。",
      providerSettings: MANAGED_PROVIDER_SETTINGS,
      useAiText: false,
    },
  });
  assert.equal(requirementsResponse.statusCode, 409);
  assertApiErrorCode(requirementsResponse, "REQUIREMENT_MODELS_MISSING");

  const designResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/document-runs",
    headers: DOCUMENT_WORKSPACE_HEADERS,
    payload: {
      documentKind: "softwareDesignSpec",
      requirementText: "根据设计产物生成软件设计说明书。",
      requirementModels: [JSON.parse(USECASE_MODEL_JSON).models[0]],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
      useAiText: false,
    },
  });
  assert.equal(designResponse.statusCode, 409);
  assertApiErrorCode(designResponse, "DESIGN_MODELS_MISSING");

  await app.close();
});
