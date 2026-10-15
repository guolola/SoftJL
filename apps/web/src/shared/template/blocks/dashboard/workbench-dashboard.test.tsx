import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { WorkbenchDashboard } from "./workbench-dashboard";
import { demoWorkbenchData } from "./demo-workbench-data";

// Only the non-chart stages are asserted here so the suite stays independent of recharts layout.
describe("WorkbenchDashboard reveal stages", () => {
  it("renders only skeletons at stage 0", () => {
    render(<WorkbenchDashboard data={demoWorkbenchData} revealStage={0} />);
    expect(screen.queryByText("项目")).not.toBeInTheDocument();
    expect(screen.queryByText("协作者")).not.toBeInTheDocument();
  });

  it("reveals the KPI row at stage 1", () => {
    render(<WorkbenchDashboard data={demoWorkbenchData} revealStage={1} />);
    expect(screen.getByText("项目")).toBeInTheDocument();
    expect(screen.getByText("协作者")).toBeInTheDocument();
    expect(screen.getByText("生成运行")).toBeInTheDocument();
    expect(screen.getByText("UML 模型")).toBeInTheDocument();
  });
});
