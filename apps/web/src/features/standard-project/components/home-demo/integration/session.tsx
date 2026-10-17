// Maps the authenticated platform identity to the source greeting's session contract.
import { useHomeDemo } from "./environment";
export function useSession(): { status: "signed-in"; user: { name: string } } | { status: "anonymous" } {
  const { displayName } = useHomeDemo();
  return displayName ? { status: "signed-in", user: { name: displayName } } : { status: "anonymous" };
}
