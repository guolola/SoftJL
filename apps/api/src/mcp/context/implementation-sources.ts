// Projects platform-approved implementation inputs without exporting historical review metadata.
import { atomicRequirementSchema } from "@uml-platform/contracts";
import { contentHash, type SourceArtifact } from "./source-artifacts.js";

export const implementationAcceptanceSchema = atomicRequirementSchema.pick({
  id: true, sourceRuleId: true, acceptanceCriteria: true,
});

export function implementationSources(input: SourceArtifact[]): SourceArtifact[] {
  const retained = input.flatMap((artifact): SourceArtifact[] => {
    if (artifact.stage === "design" || artifact.stage === "tests" || artifact.id === "feasibility:inputs")
      return [artifact];
    const requirement = implementationAcceptanceSchema.safeParse(artifact.payload.requirement);
    if (artifact.stage !== "requirements" || !requirement.success) return [];
    const { id, sourceRuleId, acceptanceCriteria } = requirement.data;
    // MCP use accepts the saved criteria; prior reviews and repair candidates stay on the platform.
    return [{
      ...artifact,
      title: `验收条件 ${id}`,
      payload: { requirement: {
        id, ...(sourceRuleId ? { sourceRuleId } : {}), acceptanceCriteria,
      } },
    }];
  });
  const retainedIds = new Set(retained.map((artifact) => artifact.id));
  return retained.map((artifact) => {
    // Hash-only provenance keeps upstream edits observable without reintroducing their bodies through dependencies.
    const upstreamVersions = artifact.dependencies.filter((id) => !retainedIds.has(id))
      .flatMap((id) => input.filter((source) => source.id === id).map((source) => source.version));
    const dependencies = [...new Set([
      ...artifact.dependencies.filter((id) => retainedIds.has(id) || !input.some((source) => source.id === id)),
      ...(artifact.stage === "design" ? retained.filter((source) => source.stage === "requirements" &&
        source.requirementIds.some((id) => artifact.requirementIds.includes(id))).map((source) => source.id) : []),
    ])].sort();
    const payload = {
      ...artifact.payload,
      ...(upstreamVersions.length ? { upstreamVersions } : {}),
      ...(artifact.stage === "design" ? { technologyAdvice:
        "完整设计模型是代码实现的直接依据；遵守设计中的技术约束及用户明确指定的工程环境，若与现有仓库冲突应反馈并确认设计，不自行重做设计。" } : {}),
    };
    return { ...artifact, dependencies, payload, version: { ...artifact.version,
      contentHash: contentHash({ payload, dependencies, requirementIds: artifact.requirementIds,
        sourceConsistency: artifact.sourceConsistency, issues: artifact.issues }),
    } };
  });
}
