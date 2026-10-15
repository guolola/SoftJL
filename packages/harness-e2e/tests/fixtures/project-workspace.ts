// Exercises project model navigation and traceability with production-shaped stale scoped models.
import { type Page } from "@playwright/test";

export const projectId = "project-model-navigation";
const now = "2026-06-11T04:00:00.000Z";

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
    goal: `${name}成功完成`,
    description: `${name}业务用例`,
    preconditions: [],
    postconditions: [],
    primaryActorId: "student",
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

function createWorkspaceState() {
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
        renderMeta: { engine: "plantuml" },
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
        category: "功能需求",
        priority: "must",
        relatedDiagrams: ["usecase"],
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
        renderMeta: { engine: "plantuml" },
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
            name: "user",
            chineseName: "用户",
            englishName: "user",
            type: "数据表",
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
            name: "reservation",
            chineseName: "预约",
            englishName: "reservation",
            type: "数据表",
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
        renderMeta: { engine: "plantuml" },
      },
      table: {
        diagramKind: "table",
        svg:
          '<svg width="260" height="120"><g><rect x="4" y="4" width="160" height="92"/><text x="12" y="24">user</text></g><text x="12" y="48">user_id : varchar</text><text x="12" y="72">openid : varchar</text></svg>',
        renderMeta: { engine: "plantuml" },
      },
    },
    designDiagramErrors: {},
  };
}

export async function mockProjectApi(page: Page, workspaceOverrides: Record<string, unknown> = {}) {
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
            email: "model-nav@example.test",
            displayName: "Model Nav Reviewer",
            status: "active",
            emailVerified: true,
            mfaEnabled: false,
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
        }),
      );
      return;
    }

    if (pathname === "/api/system-notices") {
      await route.fulfill(json({ generatedAt: now, notices: [], unreadCount: 0 }));
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
            name: "座位预约系统",
            description: "模型导航验收项目",
            visibility: "private",
            status: "active",
            ownerUserId: "user-1",
            updatedAt: now,
            memberCount: 1,
          },
          membership: {
            id: "member-1",
            projectId,
            userId: "user-1",
            email: "model-nav@example.test",
            displayName: "Model Nav Reviewer",
            role: "owner",
            status: "active",
            joinedAt: now,
          },
          capabilities: ["update_project", "start_runs"],
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
              email: "model-nav@example.test",
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
          state: { ...createWorkspaceState(), ...workspaceOverrides },
        }),
      );
      return;
    }

    unhandledRequests.push(`${request.method()} ${pathname}`);
    await route.fulfill(json({ message: `Unhandled mock route: ${pathname}` }, 500));
  });
  return unhandledRequests;
}
