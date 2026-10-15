// Wraps EventSource so repositories can share completion and failure handling.
import type { RunError, RunEvent } from "@uml-platform/contracts";
import { buildApiUrl } from "../api-client";
import { localizeRunFailure } from "../../shared/i18n/api-errors";

export class RunEventFailedError extends Error {
  readonly runError: RunError;

  constructor(runError: RunError) {
    super(localizeRunFailure(runError, "生成任务失败，请稍后重试。"));
    this.name = "RunEventFailedError";
    this.runError = runError;
  }
}

export interface RunEventHandlers {
  onEvent: (event: RunEvent) => void;
  onError?: () => Promise<void> | void;
}

export interface RunEventSubscription {
  closed: Promise<void>;
  close: () => void;
}

export function subscribeToRunEvents(
  endpoint: string,
  handlers: RunEventHandlers,
): RunEventSubscription {
  const source = new EventSource(buildApiUrl(endpoint), { withCredentials: true });
  let settled = false;

  const closed = new Promise<void>((resolve, reject) => {
    const settleResolve = () => {
      if (settled) return;
      settled = true;
      source.close();
      resolve();
    };
    const settleReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      source.close();
      reject(error);
    };

    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as RunEvent;
        handlers.onEvent(event);
        if (event.type === "completed") {
          settleResolve();
        }
        if (event.type === "cancelled") {
          settleResolve();
        }
        if (event.type === "failed") {
          settleReject(new RunEventFailedError(event.error));
        }
      } catch (error) {
        settleReject(error);
      }
    };

    source.onerror = () => {
      if (settled) {
        source.close();
        return;
      }
      source.close();
      void Promise.resolve(handlers.onError?.()).then(settleResolve, settleReject);
    };
  });

  return {
    closed,
    close: () => {
      if (settled) return;
      settled = true;
      source.close();
    },
  };
}
