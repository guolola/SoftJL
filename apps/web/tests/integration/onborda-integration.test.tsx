// Smoke tests the installed Onborda overlay with the app's custom tour card.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import confetti from "canvas-confetti";
import { expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../src/shared/i18n/index";
import { platformApi } from "../../src/features/user-platform/services/platform-api";
import { OnboardingTourProvider, useOnboardingTours } from "../../src/features/onboarding/components/onboarding-tour-provider";
import "../../src/app/styles/business.css";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

function TourEntry() {
  const tours = useOnboardingTours();
  return <>
    <button onClick={() => void tours?.startTour("empty-workspace")}>Start guide</button>
    <div id="onboarding-empty-state">Empty workspace</div>
    <button id="onboarding-create-first">Create a project</button>
  </>;
}

it("opens and advances a real Onborda tour without changing routes", async () => {
  vi.spyOn(platformApi, "saveOnboardingOutcome").mockResolvedValue({
    emptyWorkspace: "completed", firstProject: null, firstProjectId: null,
  });
  render(<AppI18nProvider><OnboardingTourProvider><TourEntry /></OnboardingTourProvider></AppI18nProvider>);
  const person = userEvent.setup();
  await person.click(screen.getByRole("button", { name: "Start guide" }));
  expect(await screen.findByRole("dialog", { name: "工作台引导" })).toBeInTheDocument();
  const overlay = document.querySelector<HTMLElement>('[data-name="onborda-overlay"]');
  expect(overlay).not.toBeNull();
  await person.click(screen.getByRole("button", { name: "下一步" }));
  expect(await screen.findByText("创建第一个项目", { selector: "h2" })).toBeInTheDocument();
  await person.click(screen.getByRole("button", { name: "完成引导" }));
  expect(screen.queryByRole("dialog", { name: "工作台引导" })).not.toBeInTheDocument();
  expect(confetti).toHaveBeenCalledExactlyOnceWith({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
  });
});
