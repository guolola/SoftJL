// Describes the frozen run artifacts used by the offline demo branch.
import type {
  
  DesignRunSnapshot,
  RunSnapshot,
} from "@uml-platform/contracts";

export interface DemoProjectFixture {
  projectId: string;
  projectName: string;
  source: {
    workspaceVersion: number | null;
    exportedAt: string;
    requirementRunId: string;
    designRunId: string;
    codeRunId: string;
  };
  requirementSnapshot: RunSnapshot;
  designSnapshot: DesignRunSnapshot;
  
}
