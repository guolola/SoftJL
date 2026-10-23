// Supplies durable project state and actions to imported elements and project integration components.
import { createContext, useContext, type ReactNode } from "react";
import type { ModelContextSettings, StandardProjectState } from "@uml-platform/contracts";
import type { SendConversationCommand } from "../../../hooks/use-conversation-runtime";

type Environment = {
  projectId: string; displayName?: string; model: string; modelRevision: string; modelContext?: ModelContextSettings; state: StandardProjectState;
  disabled: boolean; onAnswer: SendConversationCommand;
};
const Context = createContext<Environment | null>(null);
export function HomeDemoEnvironment({ value, children }: { value: Environment; children: ReactNode }) { return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useHomeDemo() { const value = useContext(Context); if (!value) throw new Error("Homepage environment is missing"); return value; }
