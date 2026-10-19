// Hosts Onborda tours and coordinates step readiness, dismissal, and account persistence.
"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Onborda, OnbordaProvider, useOnborda, type CardComponentProps, type Step } from "onborda";
import confetti from "canvas-confetti";
import type { OnboardingTour, OnboardingTourOutcome } from "@uml-platform/contracts";
import { Button } from "../../../shared/ui/button";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { platformApi } from "../../user-platform/services/platform-api";
import { TOUR_ITEMS, type TourId } from "../model/tour-catalog";
import { tourCardPosition } from "../lib/tour-card-position";

type TourSession = {
  id: TourId;
  accountTour: OnboardingTour;
  prepareStep?: (index: number) => Promise<void> | void;
  onExit?: () => void;
  focusedBeforeStart: HTMLElement | null;
};

type StartTourOptions = Pick<TourSession, "prepareStep" | "onExit">;

type TourControls = {
  startTour: (id: TourId, options?: StartTourOptions) => Promise<boolean>;
  advanceTo: (index: number) => Promise<void>;
  finishTour: (outcome: OnboardingTourOutcome) => void;
  busy: boolean;
};

const TourControlsContext = createContext<TourControls | null>(null);

export function useOnboardingTours() {
  return useContext(TourControlsContext);
}

function waitForTarget(selector: string, timeoutMs = 4000): Promise<void> {
  if (document.querySelector(selector)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) return;
      observer.disconnect();
      window.clearTimeout(timeout);
      resolve();
    });
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Onboarding target unavailable: ${selector}`));
    }, timeoutMs);
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function TourCard({ step, currentStep, totalSteps }: CardComponentProps) {
  const { t } = useTranslation();
  const controls = useOnboardingTours();
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 16, top: 16 });

  useLayoutEffect(() => {
    const update = () => {
      const card = cardRef.current;
      const target = document.querySelector(step.selector);
      if (!card || !target) return;
      setPosition(tourCardPosition(target.getBoundingClientRect(), card.getBoundingClientRect(), {
        width: window.innerWidth, height: window.innerHeight,
      }, step.side));
    };
    update();
    const observer = new ResizeObserver(update);
    if (cardRef.current) observer.observe(cardRef.current);
    const target = document.querySelector(step.selector);
    if (target) observer.observe(target);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [step.selector, step.side, currentStep]);

  useEffect(() => {
    cardRef.current?.focus();
  }, [currentStep]);

  // Portal out of Onborda's positioned wrapper so its transforms cannot push controls off-screen.
  return createPortal(
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("onboarding.dialogLabel")}
      tabIndex={-1}
      style={{ position: "fixed", ...position, zIndex: 10000, maxHeight: "calc(100dvh - 2rem)", overflowY: "auto" }}
      onKeyDown={(event) => {
        if (event.key === "Escape") controls?.finishTour("skipped");
        if (event.key === "ArrowLeft" && currentStep > 0) void controls?.advanceTo(currentStep - 1);
        if (event.key === "ArrowRight" && currentStep < totalSteps - 1) void controls?.advanceTo(currentStep + 1);
        if (event.key === "Tab") {
          // Keep keyboard navigation inside the card while the tour blocks the workspace.
          const buttons = Array.from(cardRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (event.shiftKey && (document.activeElement === cardRef.current || document.activeElement === first)) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
      className="w-[min(21rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xl outline-none sm:p-5"
    >
      <p className="text-xs font-medium text-muted-foreground">
        {t("onboarding.progress", { current: currentStep + 1, total: totalSteps })}
      </p>
      <h2 className="mt-2 text-base font-semibold">{step.title}</h2>
      <div className="mt-2 text-sm leading-6 text-muted-foreground">{step.content}</div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm"
          onClick={() => controls?.finishTour("skipped")}>
          {t("onboarding.skip")}
        </Button>
        <div className="flex items-center gap-2">
          {currentStep > 0 && (
            <Button type="button" variant="outline" size="sm" disabled={controls?.busy}
              onClick={() => void controls?.advanceTo(currentStep - 1)}>
              {t("onboarding.previous")}
            </Button>
          )}
          <Button type="button" size="sm" disabled={controls?.busy}
            onClick={() => currentStep === totalSteps - 1
              ? controls?.finishTour("completed")
              : void controls?.advanceTo(currentStep + 1)}>
            {t(currentStep === totalSteps - 1 ? "onboarding.finish" : "onboarding.next")}
          </Button>
        </div>
      </div>
    </div>, document.body
  );
}

function TourRuntime({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { closeOnborda, setCurrentStep, startOnborda } = useOnborda();
  const sessionRef = useRef<TourSession | null>(null);
  const startingRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const tours = useMemo(() =>
    (Object.entries(TOUR_ITEMS) as Array<[TourId, typeof TOUR_ITEMS[TourId]]>).map(([tour, items]) => ({
      tour,
      steps: items.map((item): Step => ({
        icon: null,
        title: t(`onboarding.${item.key}.title`),
        content: t(`onboarding.${item.key}.content`),
        selector: item.selector,
        side: item.side,
        pointerPadding: 8,
        pointerRadius: 10,
      })),
    })), [t]);

  const finishTour = useCallback((outcome: OnboardingTourOutcome) => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    closeOnborda();
    session.onExit?.();
    session.focusedBeforeStart?.focus();
    void platformApi.saveOnboardingOutcome(session.accountTour, outcome).catch(() => {
      floatingAlert.error(t("onboarding.saveFailed"));
    });
    // Celebrate completion immediately, independently of account persistence.
    if (outcome === "completed") {
      void confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [closeOnborda, t]);

  const startTour = useCallback(async (id: TourId, options: StartTourOptions = {}) => {
    if (startingRef.current || sessionRef.current) return false;
    startingRef.current = true;
    setBusy(true);
    try {
      await options.prepareStep?.(0);
      await waitForTarget(TOUR_ITEMS[id][0].selector);
      sessionRef.current = {
        id,
        accountTour: id === "empty-workspace" ? "empty-workspace" : "first-project",
        ...options,
        focusedBeforeStart: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      };
      startOnborda(id);
      return true;
    } catch {
      options.onExit?.();
      floatingAlert.error(t("onboarding.startFailed"));
      return false;
    } finally {
      startingRef.current = false;
      setBusy(false);
    }
  }, [startOnborda, t]);

  const advanceTo = useCallback(async (index: number) => {
    const session = sessionRef.current;
    if (!session || busy || index < 0 || index >= TOUR_ITEMS[session.id].length) return;
    setBusy(true);
    try {
      await session.prepareStep?.(index);
      await waitForTarget(TOUR_ITEMS[session.id][index].selector);
      if (sessionRef.current === session) setCurrentStep(index);
    } catch {
      floatingAlert.error(t("onboarding.startFailed"));
    } finally {
      setBusy(false);
    }
  }, [busy, setCurrentStep, t]);

  useEffect(() => {
    const skipOnRouteChange = () => finishTour("skipped");
    const skipOnOverlay = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-name="onborda-overlay"]')) finishTour("skipped");
    };
    const skipOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") finishTour("skipped"); };
    document.addEventListener("click", skipOnOverlay);
    document.addEventListener("keydown", skipOnEscape);
    window.addEventListener("uml-route-change", skipOnRouteChange);
    window.addEventListener("popstate", skipOnRouteChange);
    return () => {
      document.removeEventListener("click", skipOnOverlay);
      document.removeEventListener("keydown", skipOnEscape);
      window.removeEventListener("uml-route-change", skipOnRouteChange);
      window.removeEventListener("popstate", skipOnRouteChange);
    };
  }, [finishTour]);

  const controls = useMemo(() => ({ startTour, advanceTo, finishTour, busy }),
    [startTour, advanceTo, finishTour, busy]);

  return (
    <TourControlsContext.Provider value={controls}>
      <Onborda steps={tours} cardComponent={TourCard} shadowOpacity="0.6">
        {children}
      </Onborda>
    </TourControlsContext.Provider>
  );
}

export function OnboardingTourProvider({ children }: { children: ReactNode }) {
  return <OnbordaProvider><TourRuntime>{children}</TourRuntime></OnbordaProvider>;
}
