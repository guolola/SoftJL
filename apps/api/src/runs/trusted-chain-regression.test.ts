// Cross-domain regression coverage for the trusted generation chain gates.
import assert from "node:assert/strict";
import test from "node:test";
import type {
  
  DiagramModelSpec,
  RequirementRule,
} from "@uml-platform/contracts";
import { buildRequirementBaseline } from "./baselines/requirement-baseline.js";

import {
  assertTrustedChainAllowsCompletion,
  
  buildRequirementStageTrustedChain,
} from "./traceability/trusted-chain-traceability.js";

type PositiveDomainCase = {
  domain: string;
  actor: string;
  action: string;
  object: string;
  text: string;
};

const positiveDomains: PositiveDomainCase[] = [
  {
    domain: "library",
    actor: "读者",
    action: "借阅",
    object: "图书",
    text: "读者可以借阅图书。",
  },
  {
    domain: "e-commerce orders",
    actor: "客户",
    action: "提交",
    object: "订单",
    text: "客户可以提交订单。",
  },
  {
    domain: "appointment scheduling",
    actor: "患者",
    action: "预约",
    object: "医生",
    text: "患者可以预约医生。",
  },
  {
    domain: "course selection",
    actor: "学生",
    action: "选择",
    object: "课程",
    text: "学生可以选择课程。",
  },
  {
    domain: "dormitory repair",
    actor: "学生",
    action: "提交",
    object: "报修工单",
    text: "学生可以提交报修工单。",
  },
  {
    domain: "inventory purchasing",
    actor: "仓库主管",
    action: "审核",
    object: "采购单",
    text: "仓库主管可以审核采购单。",
  },
  {
    domain: "permission approval flow",
    actor: "审批人",
    action: "批准",
    object: "权限申请",
    text: "审批人可以批准权限申请。",
  },
];

function ruleFor(domain: PositiveDomainCase): RequirementRule {
  return {
    id: `rule-${domain.domain.replaceAll(" ", "-")}`,
    category: "业务规则",
    text: domain.text,
    relatedDiagrams: ["usecase"],
  };
}

function useCaseModelFor(domain: PositiveDomainCase): DiagramModelSpec {
  const useCaseId = `uc-${domain.domain.replaceAll(" ", "-")}`;
  return {
    diagramKind: "usecase",
    title: `${domain.domain} requirement model`,
    summary: `${domain.actor}${domain.action}${domain.object}`,
    notes: [],
    actors: [
      {
        id: `actor-${domain.domain.replaceAll(" ", "-")}`,
        name: domain.actor,
        actorType: "human",
        responsibilities: [`${domain.action}${domain.object}`],
      },
    ],
    useCases: [
      {
        id: useCaseId,
        name: `${domain.action}${domain.object}`,
        goal: `${domain.actor}${domain.action}${domain.object}`,
        preconditions: [],
        postconditions: [`系统完成${domain.object}`],
        supportingActorIds: [],
      },
    ],
    systemBoundaries: [],
    relationships: [],
  };
}

test("trusted chain accepts representative ordinary-business domains", () => {
  for (const domain of positiveDomains) {
    const rule = ruleFor(domain);
    const baseline = buildRequirementBaseline({
      runId: `run-${domain.domain}`,
      requirementText: domain.text,
      rules: [rule],
      createdAt: "2026-05-24T00:00:00.000Z",
    });
    const trustedChain = buildRequirementStageTrustedChain({
      runId: `run-${domain.domain}`,
      baseline,
      models: [useCaseModelFor(domain)],
      requirementModelTraceability: [
        {
          ruleId: rule.id,
          target: {
            diagramKind: "usecase",
            elementId: `uc-${domain.domain.replaceAll(" ", "-")}`,
            elementKind: "usecase",
            label: `${domain.action}${domain.object}`,
          },
        },
      ],
    });

    assert.equal(
      baseline.qualityReport.status,
      "passed",
      `${domain.domain} baseline should pass`,
    );
    assert.equal(
      trustedChain.coverageMatrix.rows[0]?.status,
      "covered",
      `${domain.domain} should be covered`,
    );
    assert.doesNotThrow(
      () => assertTrustedChainAllowsCompletion(trustedChain),
      `${domain.domain} should pass trusted-chain gates`,
    );
  }
});

test("trusted chain negative cases fail through their expected gates", () => {
  const conflictBaseline = buildRequirementBaseline({
    runId: "run-negative-conflict",
    requirementText: "管理员必须审批退款。管理员不得审批退款。",
    rules: [
      {
        id: "conflict-allow",
        category: "业务规则",
        text: "管理员必须审批退款。",
        relatedDiagrams: ["usecase"],
      },
      {
        id: "conflict-deny",
        category: "业务规则",
        text: "管理员不得审批退款。",
        relatedDiagrams: ["usecase"],
      },
    ],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  assert.equal(conflictBaseline.qualityReport.status, "pending-review");
  assert.equal(
    conflictBaseline.qualityReport.issues.some((issue) => issue.code === "conflict"),
    true,
  );

  const missingRoleBaseline = buildRequirementBaseline({
    runId: "run-negative-missing-role",
    requirementText: "必须审批退款。",
    rules: [
      {
        id: "missing-role",
        category: "业务规则",
        text: "必须审批退款。",
        relatedDiagrams: ["usecase"],
      },
    ],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  assert.equal(missingRoleBaseline.qualityReport.status, "pending-review");
  assert.equal(
    missingRoleBaseline.qualityReport.issues.some(
      (issue) => issue.code === "missing-actor",
    ),
    true,
  );

  const missingBoundaryBaseline = buildRequirementBaseline({
    runId: "run-negative-missing-boundary",
    requirementText: "系统库存不得超过容量。",
    rules: [
      {
        id: "missing-boundary",
        category: "业务规则",
        text: "系统库存不得超过容量。",
        relatedDiagrams: ["class"],
      },
    ],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  assert.equal(missingBoundaryBaseline.qualityReport.status, "pending-review");
  assert.equal(
    missingBoundaryBaseline.qualityReport.issues.some(
      (issue) => issue.code === "missing-boundary",
    ),
    true,
  );

  const nfrBaseline = buildRequirementBaseline({
    runId: "run-negative-nfr",
    requirementText: "系统响应时间不超过2秒。",
    rules: [
      {
        id: "nfr",
        category: "非功能需求",
        text: "系统响应时间不超过2秒。",
        relatedDiagrams: ["deployment"],
      },
    ],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const nfrChain = buildRequirementStageTrustedChain({
    runId: "run-negative-nfr",
    baseline: nfrBaseline,
    models: [],
    requirementModelTraceability: [],
  });
  assert.equal(nfrChain.coverageMatrix.rows[0]?.status, "not-modelable");
  assert.deepEqual(nfrChain.coverageMatrix.rows[0]?.reviewItems, [
    "alternative-evidence:REQ-001",
  ]);

  const refundRule: RequirementRule = {
    id: "refund",
    category: "业务规则",
    text: "管理员必须审批退款。",
    relatedDiagrams: ["usecase"],
  };
  const fakeTraceBaseline = buildRequirementBaseline({
    runId: "run-negative-fake-trace",
    requirementText: refundRule.text,
    rules: [refundRule],
    createdAt: "2026-05-24T00:00:00.000Z",
  });
  const fakeTraceChain = buildRequirementStageTrustedChain({
    runId: "run-negative-fake-trace",
    baseline: fakeTraceBaseline,
    models: [
      {
        diagramKind: "usecase",
        title: "退款记录",
        summary: "只查看退款记录，没有审批行为。",
        notes: [],
        actors: [],
        useCases: [
          {
            id: "uc-view-refund",
            name: "查看退款记录",
            goal: "查看退款记录",
            preconditions: [],
            postconditions: ["系统显示退款记录"],
            supportingActorIds: [],
          },
        ],
        systemBoundaries: [],
        relationships: [],
      },
    ],
    requirementModelTraceability: [
      {
        ruleId: "refund",
        target: {
          diagramKind: "usecase",
          elementId: "uc-view-refund",
          elementKind: "usecase",
          label: "查看退款记录",
        },
      },
    ],
  });
  assert.equal(
    fakeTraceChain.traceabilityMatrix.diagnostics.some(
      (diagnostic) => diagnostic.code === "semantic-model-gap",
    ),
    true,
  );

  const lowConfidenceCritical = missingRoleBaseline.requirements[0];
  assert.equal(lowConfidenceCritical?.status, "pending-review");
  assert.equal(lowConfidenceCritical?.criticality, "critical");
  assert.equal(
    missingRoleBaseline.qualityReport.issues.some(
      (issue) => issue.code === "low-confidence",
    ),
    true,
  );
});
