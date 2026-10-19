// Shows chat-generated ordinary specifications through the shared document library and preview.
import { useCallback, useMemo, useState } from "react";
import type { StandardProjectState } from "@uml-platform/contracts";
import { InstructionDocumentsPage } from "../../documents/components/instruction-documents-page";

export function StandardDocumentsPage({ state, disabled }: {
  state: StandardProjectState; disabled: boolean;
}) {
  const [activeDocumentId, setActiveDocumentId] = useState<string>();
  const onBack = useCallback(() => setActiveDocumentId(undefined), []);
  const revision = Object.values(state.documents ?? {}).map(document => document.documentId ?? "").join(",");
  const ordinary = useMemo(() => ({ onOpen: setActiveDocumentId, onBack, revision, disabled }), [onBack, revision, disabled]);
  return <InstructionDocumentsPage activeDocumentId={activeDocumentId} ordinary={ordinary} />;
}
