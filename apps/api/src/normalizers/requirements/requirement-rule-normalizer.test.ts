// Verifies requirement rule extraction tolerates model-specific labels before contract validation.
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRequirementRulesResult } from "./requirement-rule-normalizer.js";

test("wraps top-level rule arrays returned by non-strict JSON models", () => {
  const result = normalizeRequirementRulesResult([
    {
      id: "r1",
      category: "功能",
      text: "学生可以查询空闲座位并提交预约。",
      relatedDiagrams: ["用例图"],
    },
  ]);

  assert.deepEqual(result.rules, [
    {
      id: "r1",
      category: "功能需求",
      text: "学生可以查询空闲座位并提交预约。",
      relatedDiagrams: ["usecase"],
    },
  ]);
});

test("normalizes requirement rule category aliases and diagram aliases", () => {
  const result = normalizeRequirementRulesResult({
    rules: [
      {
        id: "r1",
        category: "安全需求",
        text: "接口请求做合法性校验，防止恶意预约。",
        relatedDiagrams: ["部署图", "外部接口"],
      },
      {
        id: "r2",
        category: "接口需求",
        text: "用户通过微信一键授权登录系统。",
        relatedDiagrams: ["功能分解图", "用例图", "流程图"],
      },
    ],
  });

  assert.deepEqual(result.rules, [
    {
      id: "r1",
      category: "非功能需求",
      text: "接口请求做合法性校验，防止恶意预约。",
      relatedDiagrams: ["deployment"],
    },
    {
      id: "r2",
      category: "外部接口",
      text: "用户通过微信一键授权登录系统。",
      relatedDiagrams: ["usecase", "activity"],
    },
  ]);
});

test("preserves source fragments separately from readable rule text", () => {
  const result = normalizeRequirementRulesResult({
    rules: [
      {
        id: "r1",
        category: "功能需求",
        text: "图书管理员可以借阅图书。",
        sourceFragment: "(1)借书",
        relatedDiagrams: ["用例图"],
      },
    ],
  });

  assert.deepEqual(result.rules[0], {
    id: "r1",
    category: "功能需求",
    text: "图书管理员可以借阅图书。",
    sourceFragment: "(1)借书",
    relatedDiagrams: ["usecase"],
  });
});

test("renames duplicate requirement rule ids deterministically", () => {
  const result = normalizeRequirementRulesResult({
    rules: [
      {
        id: "r1",
        category: "功能需求",
        text: "读者可以检索图书。",
        relatedDiagrams: ["用例图"],
      },
      {
        id: "R1",
        category: "数据需求",
        text: "系统需要记录图书库存。",
        relatedDiagrams: ["类图"],
      },
      {
        id: "r1",
        category: "异常处理",
        text: "检索失败时系统提示原因。",
        relatedDiagrams: ["活动图"],
      },
    ],
  });

  assert.deepEqual(
    result.rules.map((rule) => rule.id),
    ["r1", "R1-2", "r1-3"],
  );
});

test("infers related diagrams when model returns only invalid diagram labels", () => {
  const result = normalizeRequirementRulesResult({
    rules: [
      {
        id: "r3",
        category: "性能需求",
        text: "系统支持至少100人同时在线使用，页面加载速度小于2秒。",
        relatedDiagrams: ["性能需求", "安全需求"],
      },
      {
        id: "r4",
        category: "功能需求",
        text: "用户选择日期、时间段与座位后提交预约请求。",
        relatedDiagrams: ["外部接口"],
      },
    ],
  });

  assert.equal(result.rules[0]?.category, "非功能需求");
  assert.deepEqual(result.rules[0]?.relatedDiagrams, ["deployment"]);
  assert.deepEqual(result.rules[1]?.relatedDiagrams, [
    "function",
    "usecase",
    "activity",
    "analysis",
    "class",
  ]);
});

test("filters function structure mappings from non-functional and interface rules", () => {
  const result = normalizeRequirementRulesResult({
    rules: [
      {
        id: "r5",
        category: "非功能需求",
        text: "系统响应时间应小于 2 秒。",
        relatedDiagrams: ["功能结构图", "部署图"],
      },
      {
        id: "r6",
        category: "界面需求",
        text: "首页展示博客列表和登录入口。",
        relatedDiagrams: ["功能分解图", "原型界面关系"],
      },
    ],
  });

  assert.deepEqual(result.rules[0]?.relatedDiagrams, ["deployment"]);
  assert.deepEqual(result.rules[1]?.relatedDiagrams, ["prototype"]);
});

test("restores confirmed labeled facts omitted by the provider", () => {
  const result = normalizeRequirementRulesResult(
    {
      rules: [
        {
          id: "r12",
          category: "业务规则",
          text: "正好5000元必须进入直属经理审批。",
          relatedDiagrams: ["usecase"],
        },
      ],
    },
    [
      "[CONFIRMED-B03] 报销总额达到5000元（包含正好5000元）时必须由直属经理审批。",
      "[PENDING-B01] 大额报销阈值没有确认。",
      "[AC-B01] 正好5000元必须进入直属经理审批。",
    ].join("\n"),
  );

  assert.equal(result.rules.length, 2);
  assert.ok(
    result.rules.some(
      (rule) =>
        rule.id === "r3" &&
        rule.text.includes("达到5000元") &&
        rule.sourceFragment?.startsWith("[CONFIRMED-B03]"),
    ),
  );
  assert.equal(
    result.rules.some((rule) => rule.id.includes("pending")),
    false,
  );
});

test("does not duplicate a labeled line already preserved by the provider", () => {
  const text = "通知失败最多自动重试3次，仍失败时不得回滚业务结果。";
  const result = normalizeRequirementRulesResult(
    {
      rules: [
        {
          id: "r15",
          category: "异常处理",
          text,
          relatedDiagrams: ["activity"],
        },
      ],
    },
    `[R-A15] ${text}`,
  );

  assert.equal(result.rules.length, 1);
  assert.equal(
    result.rules[0]?.sourceFragment,
    `[R-A15] ${text}`,
  );
});

test("rejects shifted provider source fragments instead of trusting the label", () => {
  const result = normalizeRequirementRulesResult(
    {
      rules: [
        {
          id: "r4",
          category: "业务规则",
          text: "报销总额达到5000元时必须由直属经理审批。",
          sourceFragment:
            "[CONFIRMED-B04] 每个报销明细必须包含费用日期、费用类型、金额和发票号码。",
          relatedDiagrams: ["activity"],
        },
        {
          id: "r5",
          category: "数据需求",
          text: "每个报销明细必须包含费用日期、费用类型、金额和发票号码。",
          relatedDiagrams: ["class"],
        },
      ],
    },
    [
      "[CONFIRMED-B03] 报销总额达到5000元时必须由直属经理审批。",
      "[CONFIRMED-B04] 每个报销明细必须包含费用日期、费用类型、金额和发票号码。",
    ].join("\n"),
  );

  assert.equal(
    result.rules.find((rule) => rule.id === "r4")?.sourceFragment,
    "[CONFIRMED-B03] 报销总额达到5000元时必须由直属经理审批。",
  );
  assert.equal(
    result.rules.find((rule) => rule.id === "r5")?.sourceFragment,
    "[CONFIRMED-B04] 每个报销明细必须包含费用日期、费用类型、金额和发票号码。",
  );
});
