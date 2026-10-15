import assert from "node:assert/strict";
import test from "node:test";
import { numberDocumentSections } from "./document-numbering.js";

test("document numbering rewrites existing numeric headings into a stable hierarchy", () => {
  const numbered = numberDocumentSections([
    { level: 1, title: "1 项目引言", body: [] },
    { level: 1, title: "需求概述", body: [] },
    { level: 1, title: "3 需求规定", body: [] },
    { level: 2, title: "功能需求", body: ["总体功能需求说明"] },
    { level: 3, title: "1.1.1 用例1：名称（编号）", body: [] },
    { level: 1, title: "附录", body: [] },
    { level: 2, title: "附录A:术语表", body: [] },
  ]);

  assert.deepEqual(
    numbered.map((section) => section.title),
    [
      "1 项目引言",
      "2 需求概述",
      "3 需求规定",
      "3.1 功能需求",
      "3.1.1 用例1：名称（编号）",
      "附录",
      "附录A:术语表",
    ],
  );
});

test("feasibility numbering applies a continuous A. prefix through three levels", () => {
  const numbered = numberDocumentSections([
    { level: 1, title: "引言", body: [] },
    { level: 2, title: "背景", body: [] },
    { level: 1, title: "所建议的系统", body: [] },
    { level: 2, title: "影响", body: [] },
    { level: 3, title: "对开发的影响", body: [] },
    { level: 1, title: "结论", body: [] },
  ], { prefix: "A." });

  assert.deepEqual(numbered.map((section) => section.title), [
    "A.1 引言",
    "A.1.1 背景",
    "A.2 所建议的系统",
    "A.2.1 影响",
    "A.2.1.1 对开发的影响",
    "A.3 结论",
  ]);
});
