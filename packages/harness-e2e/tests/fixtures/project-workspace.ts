// Supplies saved scoped project models; explicit overrides select stale or failed scenarios.
import { type Page } from "@playwright/test";
import { assertCurrentWorkspaceState, designInputFingerprint, snapshotInputFingerprint } from "@uml-platform/contracts";

export const projectId = "project-model-navigation";
const now = "2026-06-11T04:00:00.000Z";
const renderMeta = { engine: "plantuml", generatedAt: now, sourceLength: 0, durationMs: 0 };

function json(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

function useCase(id: string, name: string) {
  return {
    id,
    name,
    systemBoundaryId: "seat-reservation-system",
    goal: `${name}成功完成`,
    description: `${name}业务用例`,
    preconditions: [],
    postconditions: [],
    primaryActorId: "student",
    systemBoundaryId: "seat-reservation-system",
    supportingActorIds: [],
    eventFlows: [
      {
        id: `${id}-main`,
        name: `${name}主成功场景`,
        flowType: "main",
        trigger: "用户发起操作",
        steps: [
          {
            order: 1,
            actor: "actor",
            actorAction: `${name}请求`,
            systemAction: "系统校验并返回结果",
          },
        ],
      },
    ],
  };
}

function sequenceModel(id: string, sourceUseCaseName: string) {
  return {
    diagramKind: "sequence",
    modelId: `sequence:${id}`,
    sourceUseCaseId: id,
    sourceUseCaseName,
    title: `${sourceUseCaseName}用例实现设计`,
    summary: `${sourceUseCaseName}调用链`,
    notes: [],
    participants: [
      { id: "student", name: "学生", participantType: "actor" },
      { id: "reservation-service", name: "SeatReservationService", participantType: "service" },
    ],
    messages: [
      {
        id: "send-reservation-request",
        type: "sync",
        sourceId: "student",
        targetId: "reservation-service",
        name: id === "uc-3" ? "发送预约请求" : `${sourceUseCaseName}请求`,
        parameters: [],
      },
    ],
    fragments: [],
  };
}

export function createWorkspaceState() {
  const currentUseCases = [
    useCase("uc-1", "微信授权登录"),
    useCase("uc-2", "查询座位"),
    useCase("uc-3", "预约座位"),
    useCase("uc-4", "查看预约记录"),
    useCase("uc-5", "签到确认"),
  ];
  const sequenceNames = [
    ...currentUseCases.map((item) => [item.id, item.name] as const),
    ["uc-6", "查看预约详情"] as const,
    ["uc-7", "取消预约"] as const,
    ["uc-8", "自动处理超时预约"] as const,
  ];
  const designModels = Object.fromEntries(
    sequenceNames.map(([id, name]) => [`sequence:${id}`, sequenceModel(id, name)]),
  );
  const designSvgArtifacts = Object.fromEntries(
    sequenceNames.map(([id, name]) => [
      `sequence:${id}`,
      {
        diagramKind: "sequence",
        modelId: `sequence:${id}`,
        svg: `<svg width="180" height="60"><text x="8" y="24">${name}</text></svg>`,
        renderMeta,
      },
    ]),
  );

  return {
    id: "workspace-model-navigation",
    name: "座位预约系统",
    requirementText: "学生可以授权登录、查询座位、预约座位、查看预约记录并签到。",
    selectedDiagramTypes: ["usecase", "analysis"],
    generatedDiagramTypes: ["usecase", "analysis"],
    rules: [
      {
        id: "r1",
        text: "学生预约座位时系统必须校验座位可用并记录预约。",
        type: "functional" as const,

      },
    ],
    models: {
      usecase: {
        diagramKind: "usecase",
        title: "用例模型",
        summary: "座位预约核心用例",
        notes: [],
        actors: [
          {
            id: "student",
            name: "学生",
            actorType: "human",
            responsibilities: [],
          },
        ],
        useCases: currentUseCases,
        systemBoundaries: [
          {
            id: "seat-reservation-system",
            name: "座位预约系统",
          },
        ],
        relationships: currentUseCases.map((item) => ({
          id: `rel-${item.id}`,
          type: "association",
          sourceId: "student",
          targetId: item.id,
        })),
      },
      ...Object.fromEntries(
        sequenceNames.map(([id, name]) => [
          `analysis:${id}`,
          {
            diagramKind: "analysis",
            modelId: `analysis:${id}`,
            sourceUseCaseId: id,
            sourceUseCaseName: name,
            title: `${name}需求分析模型`,
            summary: `${name}需求交互`,
            notes: [],
            participants: [
              { id: "student", name: "学生", participantType: "actor" },
              { id: "system", name: "座位预约系统", participantType: "control" },
            ],
            messages: [
              {
                id: `analysis-${id}-message`,
                type: "sync",
                sourceId: "student",
                targetId: "system",
                name: `${name}分析请求`,
                parameters: [],
              },
            ],
            fragments: [],
          },
        ]),
      ),
    },
    requirementModelTraceability: [
      {
        ruleId: "r1",
        target: {
          diagramKind: "usecase",
          modelId: "usecase",
          elementId: "uc-3",
          elementKind: "usecase",
          label: "预约座位",
        },
      },
    ],
    plantUml: {},
    svgArtifacts: {
      usecase: {
        diagramKind: "usecase",
        svg: '<svg width="180" height="60"><text x="8" y="24">用例模型</text></svg>',
        renderMeta,
      },
    },
    diagramErrors: {},
    selectedDesignDiagramTypes: ["sequence", "class", "table"],
    generatedDesignDiagramTypes: ["sequence", "class", "table"],
    designModels: {
      ...designModels,
      class: {
        diagramKind: "class",
        title: "设计类图",
        summary: "服务与实体类",
        notes: [],
        classes: [
          {
            id: "SeatReservationService",
            name: "SeatReservationService",
            chineseName: "座位预约服务",
            englishName: "SeatReservationService",
            type: "service",
            classKind: "service",
            stereotype: "service",
            description: "处理座位预约用例实现",
            constraints: [],
            attributes: [],
            operations: [],
          },
        ],
        interfaces: [],
        enums: [],
        relationships: [],
      },
      table: {
        diagramKind: "table",
        title: "数据库设计",
        summary: "座位预约数据表",
        notes: [],
        tables: [
          {
            id: "tbl_user",
            relationalConstraints: [{ id: "pk-user", type: "primary-key", columnIds: ["user_id"] }],
            name: "user",
            chineseName: "用户",
            englishName: "user",
            type: "数据表",
            relationalConstraints: [{ id: "pk_user", type: "primary-key", columnIds: ["user_id"] }],
            constraints: [],
            columns: [
              {
                id: "user_id",
                name: "user_id",
                chineseName: "用户ID",
                englishName: "user_id",
                dataType: "varchar",
                constraints: [],
                isPrimaryKey: true,
                isForeignKey: false,
                nullable: false,
              },
              {
                id: "openid",
                name: "openid",
                chineseName: "微信OpenID",
                englishName: "openid",
                dataType: "varchar",
                constraints: [],
                isPrimaryKey: false,
                isForeignKey: false,
                nullable: false,
              },
            ],
          },
          {
            id: "tbl_reservation",
            relationalConstraints: [{ id: "pk-reservation", type: "primary-key", columnIds: ["reservation_id"] }],
            name: "reservation",
            chineseName: "预约",
            englishName: "reservation",
            type: "数据表",
            relationalConstraints: [{ id: "pk_reservation", type: "primary-key", columnIds: ["reservation_id"] }],
            constraints: [],
            columns: [
              {
                id: "reservation_id",
                name: "reservation_id",
                dataType: "varchar",
                constraints: [],
                isPrimaryKey: true,
                isForeignKey: false,
                nullable: false,
              },
            ],
          },
        ],
        relationships: [],
      },
    },
    designModelTraceability: [
      {
        source: {
          diagramKind: "sequence",
          modelId: "sequence:uc-3",
          elementId: "send-reservation-request",
          elementKind: "message",
          label: "发送预约请求",
        },
        targets: [
          {
            diagramKind: "usecase",
            modelId: "usecase",
            elementId: "uc-3",
            elementKind: "usecase",
            label: "预约座位",
          },
        ],
      },
      {
        source: {
          diagramKind: "class",
          modelId: "class",
          elementId: "SeatReservationService",
          elementKind: "class",
          label: "SeatReservationService",
        },
        upstreamDesignRefs: [{
          diagramKind: "sequence", modelId: "sequence:uc-3", elementId: "send-reservation-request",
          elementKind: "message", label: "发送预约请求",
        }],
        targets: [
          {
            diagramKind: "usecase",
            modelId: "usecase",
            elementId: "uc-3",
            elementKind: "usecase",
            label: "预约座位",
          },
        ],
      },
    ],
    designPlantUml: {},
    designSvgArtifacts: {
      ...designSvgArtifacts,
      class: {
        diagramKind: "class",
        svg: '<svg width="220" height="80"><text x="8" y="28">SeatReservationService</text></svg>',
        renderMeta,
      },
      table: {
        diagramKind: "table",
        svg:
          '<svg width="260" height="120"><g><rect x="4" y="4" width="160" height="92"/><text x="12" y="24">user</text></g><text x="12" y="48">user_id : varchar</text><text x="12" y="72">openid : varchar</text></svg>',
        renderMeta,
      },
    },
    designDiagramErrors: {},
  };
}

export async function mockProjectApi(page: Page, workspaceOverrides: Record<string, unknown> = {}) {
  const saved = createWorkspaceState();
  const savedRulesFingerprint = snapshotInputFingerprint({ requirementText: saved.requirementText, rules: saved.rules });
  const savedDesignFingerprint = designInputFingerprint(Object.values(saved.models), saved.requirementModelTraceability);
  const state = {
    ...saved,
    diagramInputFingerprints: Object.fromEntries(Object.keys(saved.models).map(id => [id, savedRulesFingerprint])),
    designInputFingerprints: Object.fromEntries(Object.keys(saved.designModels).map(id => [id, savedDesignFingerprint])),
    ...workspaceOverrides,
  };
  // Fail at fixture setup instead of silently exercising an empty, rejected workspace.
  assertCurrentWorkspaceState(state);
  const unhandledRequests: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname === "/api/auth/me") {
      await route.fulfill(
        json({
          user: {
            id: "user-1",
            username: "model_nav",
            displayName: "Model Nav Reviewer",
            status: "active",
            mfaEnabled: false,
            avatarUrl: null, systemRoles: [], createdAt: now, updatedAt: now, lastLoginAt: now,
          },
          session: {
            id: "session-1",
            userId: "user-1",
            createdAt: now,
            expiresAt: "2026-06-12T04:00:00.000Z",
            lastSeenAt: now,
            ipAddress: "127.0.0.1",
            userAgent: "Playwright",
          },
          mfa: { enabled: false, enforcement: "totp" },
          generationUsage: { usedToday: 0, limit: null, remaining: null, windowSeconds: 86400, limited: false, scope: "user" },
        }),
      );
      return;
    }

    if (pathname === "/api/account/onboarding") {
      await route.fulfill(json({ emptyWorkspace: "completed", firstProject: "completed", firstProjectId: projectId }));
      return;
    }

    if (pathname === "/api/inbox") {
      await route.fulfill(json({ messages: [], unreadCount: 0 }));
      return;
    }

    if (pathname === "/api/system-notices") {
      await route.fulfill(json({ generatedAt: now, notices: [], unreadCount: 0 }));
      return;
    }

    if (pathname === "/api/account/onboarding") {
      await route.fulfill(json({ emptyWorkspace: "completed", firstProject: "completed", firstProjectId: projectId }));
      return;
    }

    if (pathname === "/api/provider-configs") {
      await route.fulfill(json({ generatedAt: now, providerConfigs: [] }));
      return;
    }

    if (pathname === `/api/projects/${projectId}`) {
      await route.fulfill(
        json({
          project: {
            id: projectId,
            projectMode: "professional",
            name: "座位预约系统",
            description: "模型导航验收项目",

            status: "active",
            ownerUserId: "user-1",
            updatedAt: now,
            memberCount: 1,
          },
          membership: {
            id: "member-1",
            projectId,
            userId: "user-1",
            username: "model_nav",
            displayName: "Model Nav Reviewer",
            role: "owner",
            status: "active",
            joinedAt: now,
          },
          capabilities: ["update_project", "start_runs"],
          generationExecutionMode: "provider",
        }),
      );
      return;
    }

    if (pathname === `/api/projects/${projectId}/members`) {
      await route.fulfill(
        json({
          members: [
            {
              id: "member-1",
              projectId,
              userId: "user-1",
              username: "model_nav",
              displayName: "Model Nav Reviewer",
              role: "owner",
              status: "active",
              joinedAt: now,
            },
          ],
        }),
      );
      return;
    }

    if (pathname === `/api/projects/${projectId}/documents`) {
      await route.fulfill(json({ documents: [] }));
      return;
    }

    if (pathname === `/api/projects/${projectId}/runs`) {
      await route.fulfill(json({ generatedAt: now, projectId, runs: [] }));
      return;
    }

    if (pathname === `/api/projects/${projectId}/workspace`) {
      await route.fulfill(
        json({
          projectId,
          version: 3,
          state,
        }),
      );
      return;
    }

    unhandledRequests.push(`${request.method()} ${pathname}`);
    await route.fulfill(json({ message: `Unhandled mock route: ${pathname}` }, 500));
  });
  return unhandledRequests;
}
