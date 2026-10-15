// Renders the product-level route loading state shared by authenticated platform pages.
import { Progress } from "../../../shared/ui/progress";
import Logo from "../../../shared/template/assets/svg/logo";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Grid3X3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../../shared/ui/utils";

type PlatformLoadingScreenVariant = "fullscreen" | "content";
export type PlatformLoadingPhase = "loading" | "completing" | "exiting" | "hidden";

const COMPLETION_HOLD_MS = 120;

type PlatformLoadingEntries = Record<string, string>;

type PlatformLoadingCoordinatorContextValue = {
  entries: PlatformLoadingEntries;
  setRouteLoading: (id: string, message: string, active: boolean) => void;
};

const PlatformLoadingCoordinatorContext =
  createContext<PlatformLoadingCoordinatorContextValue | null>(null);

export function PlatformLoadingCoordinatorProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [entries, setEntries] = useState<PlatformLoadingEntries>({});
  const setRouteLoading = useCallback(
    (id: string, message: string, active: boolean) => {
      setEntries((current) => {
        if (!active) {
          if (!(id in current)) return current;
          const { [id]: _removed, ...rest } = current;
          return rest;
        }
        if (current[id] === message) return current;
        return { ...current, [id]: message };
      });
    },
    [],
  );
  const value = useMemo(
    () => ({ entries, setRouteLoading }),
    [entries, setRouteLoading],
  );

  return (
    <PlatformLoadingCoordinatorContext.Provider value={value}>
      {children}
    </PlatformLoadingCoordinatorContext.Provider>
  );
}

export function usePlatformRouteLoading(message: string, active: boolean) {
  const id = useId();
  const coordinator = useContext(PlatformLoadingCoordinatorContext);
  const setRouteLoading = coordinator?.setRouteLoading;

  useEffect(() => {
    if (!setRouteLoading) return;
    setRouteLoading(id, message, active);
    return () => {
      setRouteLoading(id, message, false);
    };
  }, [active, id, message, setRouteLoading]);

  return Boolean(setRouteLoading);
}

export function usePlatformLoadingCoordinatorState() {
  const coordinator = useContext(PlatformLoadingCoordinatorContext);
  const messages = coordinator ? Object.values(coordinator.entries) : [];
  const message = messages[messages.length - 1] ?? null;
  return {
    active: messages.length > 0,
    message,
  };
}

export function useSimulatedProgress({
  enabled = true,
  initialProgress = 25,
  maxProgress = 90,
}: {
  enabled?: boolean;
  initialProgress?: number;
  maxProgress?: number;
} = {}) {
  const [progress, setProgress] = useState(initialProgress);

  useEffect(() => {
    if (!enabled) return;
    setProgress(initialProgress);
    const intervalId = window.setInterval(() => {
      setProgress((current) => {
        if (current >= maxProgress) return current;
        const nextStep = current < 44 ? 6 : current < 68 ? 4 : 2;
        return Math.min(maxProgress, current + nextStep);
      });
    }, 520);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, initialProgress, maxProgress]);

  return progress;
}

export function useLoadingTransition(
  active: boolean,
  {
    minimumMs = 800,
    exitMs = 520,
    initialProgress = 25,
    maxProgress = 90,
  }: {
    minimumMs?: number;
    exitMs?: number;
    initialProgress?: number;
    maxProgress?: number;
  } = {},
) {
  const [visible, setVisible] = useState(active);
  const [phase, setPhase] = useState<PlatformLoadingPhase>(
    active ? "loading" : "hidden",
  );
  const [progress, setProgress] = useState(active ? initialProgress : 100);
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    const timers: number[] = [];

    if (active) {
      startedAtRef.current = Date.now();
      setVisible(true);
      setPhase("loading");
      setProgress(initialProgress);
      const intervalId = window.setInterval(() => {
        setProgress((current) => {
          if (current >= maxProgress) return current;
          const nextStep = current < 44 ? 6 : current < 68 ? 4 : 2;
          return Math.min(maxProgress, current + nextStep);
        });
      }, 520);
      timers.push(intervalId);
      return () => {
        timers.forEach((timerId) => window.clearTimeout(timerId));
      };
    }

    const finish = () => {
      setVisible(true);
      setProgress(100);
      setPhase("completing");
      const completingTimer = window.setTimeout(() => {
        setPhase("exiting");
        const exitTimer = window.setTimeout(() => {
          setVisible(false);
          setPhase("hidden");
        }, exitMs);
        timers.push(exitTimer);
      }, COMPLETION_HOLD_MS);
      timers.push(completingTimer);
    };

    if (!visible) {
      setPhase("hidden");
      setProgress(100);
      return;
    }

    const remainingMs = Math.max(0, minimumMs - (Date.now() - startedAtRef.current));
    const minimumTimer = window.setTimeout(finish, remainingMs);
    timers.push(minimumTimer);

    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [active, exitMs, initialProgress, maxProgress, minimumMs, visible]);

  return { visible, phase, progress };
}

export function PlatformLoadingScreen({
  message,
  variant = "fullscreen",
  className,
  phase = "loading",
  progress,
}: {
  message: string;
  variant?: PlatformLoadingScreenVariant;
  className?: string;
  phase?: Exclude<PlatformLoadingPhase, "hidden">;
  progress?: number;
}) {
  const { t } = useTranslation();
  const simulatedProgress = useSimulatedProgress({ enabled: progress === undefined });
  const displayProgress = Math.round(progress ?? simulatedProgress);
  const rootClassName = useMemo(
    () =>
      cn(
        "platform-loading-screen relative isolate flex overflow-hidden bg-background text-foreground",
        variant === "fullscreen"
          ? "min-h-0 flex-1 items-center justify-center"
          : "min-h-[420px] w-full items-center justify-center rounded-xl border border-border",
        className,
      ),
    [className, variant],
  );

  return (
    <div
      className={rootClassName}
      data-testid="platform-loading-screen"
      data-loading-variant={variant}
      data-loading-phase={phase}
      aria-busy="true"
      aria-live="polite"
    >
      <section className="mx-auto flex w-full max-w-md flex-col gap-6 px-6">
        <div className="flex items-center justify-center gap-2.5">
          <Logo className="size-9 object-contain" />
          <span className="text-lg font-semibold">{t("loading.appName")}</span>
        </div>
        <Progress value={displayProgress} aria-label={message} data-testid="platform-loading-progress" />
        <div className="text-muted-foreground flex items-center justify-between text-sm">
          <span>{message}</span><span className="font-mono">{displayProgress}%</span>
        </div>
      </section>
    </div>
  );
}
