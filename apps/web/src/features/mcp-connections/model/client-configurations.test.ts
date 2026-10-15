// Guards the copied coding workflow's design responsibility and source-reading prerequisites.
import { expect, it } from "vitest";
import { projectAgentPrompt } from "./client-configurations";

it("copies a design-driven workflow with separate implementation and verification reads in both languages", () => {
  const chinese = projectAgentPrompt("project-123");
  const english = projectAgentPrompt("project-123", "en-US");
  expect(chinese).toContain("以完整设计为代码直接依据");
  expect(chinese).toContain("不从需求重新推导设计");
  expect(chinese).not.toContain("说明书正文");
  expect(english).toContain("Use complete designs as the direct basis for code");
  expect(english).toContain("instead of deriving designs from requirements");
  expect(english).not.toContain("specification bodies");
  for (const prompt of [chinese, english]) {
    expect(prompt).toContain("project-123");
    expect(prompt).toContain("implementation:bundle");
    expect(prompt).toContain("implementation:report");
    expect(prompt).toContain("implementation:validator");
    expect(prompt).toContain("SHA-256");
  }
});
