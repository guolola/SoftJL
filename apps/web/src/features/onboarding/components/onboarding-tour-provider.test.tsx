// Exercises account-triggered tours, workspace navigation, and exit restoration.
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import confetti from "canvas-confetti";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { SidebarProvider } from "../../../shared/ui/sidebar";
import { WorkspaceShellProvider, useWorkspaceShell } from "../../workspace-shell/state";
import { AuthenticatedRouteSessionProvider } from "../../user-platform/components/authenticated-route-session";
import { ProjectsIndexPage } from "../../user-platform/components/projects-index-page";
import { platformApi } from "../../user-platform/services/platform-api";
import { useProjectOnboarding } from "../hooks/use-project-onboarding";
import { OnboardingTourProvider } from "./onboarding-tour-provider";

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

vi.mock("onborda", async () => {
  const React = await import("react");
  type State = {
    currentTour: string | null;
    currentStep: number;
    startOnborda: (tour: string) => void;
    closeOnborda: () => void;
    setCurrentStep: (step: number) => void;
  };
  const Context = React.createContext<State | null>(null);
  return {
    OnbordaProvider: ({ children }: { children: ReactNode }) => {
      const [currentTour, setCurrentTour] = React.useState<string | null>(null);
      const [currentStep, setCurrentStep] = React.useState(0);
      const startOnborda = React.useCallback((tour: string) => {
        setCurrentStep(0);
        setCurrentTour(tour);
      }, []);
      const closeOnborda = React.useCallback(() => setCurrentTour(null), []);
      const value = React.useMemo(() => ({
        currentTour, currentStep, startOnborda, closeOnborda, setCurrentStep,
      }), [currentTour, currentStep, startOnborda, closeOnborda]);
      return <Context.Provider value={value}>{children}</Context.Provider>;
    },
    useOnborda: () => {
      const value = React.useContext(Context);
      if (!value) throw new Error("Missing Onborda provider");
      return value;
    },
    Onborda: ({ children, steps, cardComponent: Card }: {
      children: ReactNode;
      steps: Array<{ tour: string; steps: Array<{ title: string; content: string }> }>;
      cardComponent: React.ComponentType<{ step: { title: string; content: string }; currentStep: number; totalSteps: number }>;
    }) => {
      const value = React.useContext(Context);
      const tour = steps.find((item) => item.tour === value?.currentTour);
      const step = tour?.steps[value?.currentStep ?? 0];
      return <>{children}{step && <Card step={step} currentStep={value?.currentStep ?? 0} totalSteps={tour?.steps.length ?? 0} />}</>;
    },
  };
});

const user = {
  id: "user-1", email: "owner@example.com", username: "owner", displayName: "Owner",
  status: "active" as const, emailVerified: true, mfaEnabled: false,
};
const session = {
  id: "session-1", userId: user.id, createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z", lastSeenAt: "2026-01-01T00:00:00.000Z",
  ipAddress: null, userAgent: null,
};

function renderEmptyIndex() {
  return render(<AppI18nProvider><OnboardingTourProvider>
    <AuthenticatedRouteSessionProvider value={{ user, session }}>
      <ProjectsIndexPage onNavigate={() => {}} />
    </AuthenticatedRouteSessionProvider>
  </OnboardingTourProvider></AppI18nProvider>);
}

function ProjectHarness({ projectId }: { projectId: string }) {
  const workspace = useWorkspaceShell();
  const { startProjectTour } = useProjectOnboarding(projectId);
  return <>
    <button onClick={() => workspace.openTestHome()}>Open original tab</button>
    <button onClick={() => void startProjectTour()}>Replay project guide</button>
    <output data-testid="selection">{workspace.selection.kind}</output>
    <output data-testid="tabs">{workspace.openTabs.map((tab) => tab.id).join(",")}</output>
    <textarea id="requirement-text" aria-label="System requirements" />
    {workspace.selection.kind === "requirements-text" && <div id="requirement-target-models" />}
    <div id="workspace-active-panel"><h1>{workspace.selection.kind}</h1></div>
    {(["feasibility", "requirements", "design", "workspace:code", "test", "documents"] as const)
      .map((key) => <button key={key} data-onboarding-nav={key}>{key}</button>)}
    <button id="onboarding-tasks-action">Tasks</button>
    <button id="onboarding-history-action">History</button>
    <button id="onboarding-settings-action">Settings</button>
  </>;
}

function renderProject(projectId = "project-first") {
  return render(<AppI18nProvider><SidebarProvider><WorkspaceShellProvider>
    <OnboardingTourProvider><ProjectHarness projectId={projectId} /></OnboardingTourProvider>
  </WorkspaceShellProvider></SidebarProvider></AppI18nProvider>);
}

describe("first-use onboarding", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(confetti).mockClear();
    window.innerWidth = 1440;
    vi.spyOn(platformApi, "saveOnboardingOutcome").mockResolvedValue({
      emptyWorkspace: "completed", firstProject: null, firstProjectId: null,
    });
  });

  it("starts only after an empty list and successful account read, then allows replay", async () => {
    vi.spyOn(platformApi, "listProjects").mockResolvedValue({ projects: [] });
    vi.spyOn(platformApi, "getOnboardingState").mockResolvedValue({
      emptyWorkspace: null, firstProject: null, firstProjectId: null,
    });
    renderEmptyIndex();
    const person = userEvent.setup();
    expect(await screen.findByRole("dialog", { name: "工作台引导" })).toBeInTheDocument();
    expect(screen.getByText("从项目开始")).toBeInTheDocument();
    await person.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByText("创建第一个项目", { selector: "h2" })).toBeInTheDocument();
    await person.click(screen.getByRole("button", { name: "跳过引导" }));
    await waitFor(() => expect(platformApi.saveOnboardingOutcome).toHaveBeenCalledWith("empty-workspace", "skipped"));
    expect(screen.queryByRole("dialog", { name: "工作台引导" })).not.toBeInTheDocument();
    expect(confetti).not.toHaveBeenCalled();
    await person.click(screen.getByRole("button", { name: "查看引导" }));
    await person.click(screen.getByRole("button", { name: "下一步" }));
    await person.click(screen.getByRole("button", { name: "完成引导" }));
    await waitFor(() => expect(platformApi.saveOnboardingOutcome).toHaveBeenCalledWith("empty-workspace", "completed"));
    expect(confetti).toHaveBeenCalledExactlyOnceWith({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
  });

  it("suppresses automatic guidance when account state cannot be read", async () => {
    vi.spyOn(platformApi, "listProjects").mockResolvedValue({ projects: [] });
    const getState = vi.spyOn(platformApi, "getOnboardingState").mockRejectedValue(new Error("offline"));
    renderEmptyIndex();
    await waitFor(() => expect(getState).toHaveBeenCalled());
    expect(screen.queryByRole("dialog", { name: "工作台引导" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看引导" })).toBeInTheDocument();
  });

  it("supports keyboard navigation and exits when saving the outcome fails", async () => {
    vi.spyOn(platformApi, "listProjects").mockResolvedValue({ projects: [] });
    vi.spyOn(platformApi, "getOnboardingState").mockResolvedValue({
      emptyWorkspace: null, firstProject: null, firstProjectId: null,
    });
    vi.spyOn(platformApi, "saveOnboardingOutcome").mockRejectedValue(new Error("offline"));
    const alert = vi.spyOn(floatingAlert, "error").mockImplementation(() => "guide-alert");
    renderEmptyIndex();
    expect(await screen.findByText("从项目开始")).toBeInTheDocument();
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("button", { name: "下一步" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(await screen.findByText("创建第一个项目", { selector: "h2" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "工作台引导" })).not.toBeInTheDocument();
    await waitFor(() => expect(alert).toHaveBeenCalledWith(expect.stringContaining("未能保存")));
    expect(confetti).not.toHaveBeenCalled();
  });

  it("does not start on a nonempty project list or after a recorded skip", async () => {
    const listProjects = vi.spyOn(platformApi, "listProjects").mockResolvedValue({ projects: [{
      id: "invited-project", name: "Shared project", description: null,
      visibility: "team", status: "active", ownerUserId: "another-user",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }] });
    const getState = vi.spyOn(platformApi, "getOnboardingState").mockResolvedValue({
      emptyWorkspace: "skipped", firstProject: null, firstProjectId: null,
    });
    const view = renderEmptyIndex();
    expect(await screen.findByRole("article")).toBeInTheDocument();
    expect(getState).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "工作台引导" })).not.toBeInTheDocument();
    view.unmount();
    listProjects.mockResolvedValue({ projects: [] });
    renderEmptyIndex();
    await waitFor(() => expect(getState).toHaveBeenCalled());
    expect(screen.queryByRole("dialog", { name: "工作台引导" })).not.toBeInTheDocument();
  });

  it("restores desktop tabs after stage navigation and skip", async () => {
    vi.spyOn(platformApi, "getOnboardingState").mockResolvedValue({
      emptyWorkspace: "completed", firstProject: "ineligible", firstProjectId: "other-project",
    });
    renderProject();
    const person = userEvent.setup();
    await person.click(screen.getByRole("button", { name: "Open original tab" }));
    const originalTabs = screen.getByTestId("tabs").textContent;
    expect(screen.getByTestId("selection")).toHaveTextContent("test-home");
    await person.click(screen.getByRole("button", { name: "Replay project guide" }));
    expect(await screen.findByText("输入系统需求")).toBeInTheDocument();
    await person.click(screen.getByRole("button", { name: "下一步" }));
    await waitFor(() => expect(screen.getByTestId("selection")).toHaveTextContent("feasibility-home"));
    await screen.findByText("可行性分析", { selector: "h2" });
    await person.click(screen.getByRole("button", { name: "下一步" }));
    await waitFor(() => expect(screen.getByTestId("selection")).toHaveTextContent("requirements-text"));
    expect(await screen.findByText("需求模型", { selector: "h2" })).toBeInTheDocument();
    await person.click(screen.getByRole("button", { name: "上一步" }));
    expect(await screen.findByText("可行性分析", { selector: "h2" })).toBeInTheDocument();
    await person.click(screen.getByRole("button", { name: "跳过引导" }));
    expect(screen.getByTestId("selection")).toHaveTextContent("test-home");
    expect(screen.getByTestId("tabs")).toHaveTextContent(originalTabs ?? "");
    await waitFor(() => expect(platformApi.saveOnboardingOutcome).toHaveBeenCalledWith("first-project", "skipped"));
    expect(confetti).not.toHaveBeenCalled();
  });

  it("uses condensed mobile stages and completes the first owned project tour", async () => {
    window.innerWidth = 390;
    vi.spyOn(platformApi, "getOnboardingState").mockResolvedValue({
      emptyWorkspace: "completed", firstProject: null, firstProjectId: "project-first",
    });
    renderProject();
    const person = userEvent.setup();
    expect(await screen.findByText("从系统需求开始")).toBeInTheDocument();
    for (const [title, kind] of [
      ["分析与 UML", "feasibility-home"],
      ["设计与测试", "design-home"],
      ["文档交付", "documents-home"],
      ["跟踪项目", "documents-home"],
    ]) {
      await person.click(screen.getByRole("button", { name: "下一步" }));
      await waitFor(() => expect(screen.getByTestId("selection")).toHaveTextContent(kind));
      expect(await screen.findByText(title, { selector: "h2" })).toBeInTheDocument();
    }
    await person.click(screen.getByRole("button", { name: "完成引导" }));
    expect(screen.getByTestId("selection")).toHaveTextContent("system-requirements");
    await waitFor(() => expect(platformApi.saveOnboardingOutcome).toHaveBeenCalledWith("first-project", "completed"));
    expect(confetti).toHaveBeenCalledExactlyOnceWith({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
  });
});
