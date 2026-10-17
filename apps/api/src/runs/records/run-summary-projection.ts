// Projects persisted history into list metadata without transferring diagrams or LLM transcripts.
const scalarKeys = [
  "operationType", "outputManifest", "analysisTargetUseCaseIds", "runId", "status", "currentStage", "error", "errorMessage", "diagramErrors",
  "selectedDiagrams", "requestedDiagrams", "dependencyDiagrams", "selectedArtifacts",
  "documentKind", "documentId", "fileName", "byteLength", "missingArtifacts",
  "generationDiagnostics", "_offlineDemoFixture", "tokenUsage", "publicationSkipped",
];
const arrayKeys = ["rules", "models", "requirementModels", "plantUml", "svgArtifacts", "sections"];
const columns = [...scalarKeys, ...arrayKeys, "requirementText", "providerSettings", "coverageMatrix", "traceabilityMatrix", "designModelTraceability", "contextModel", "contextSvg", "contextPlantUml", "businessFlow", "implementationPlan"];
const field = (key: string) => `summary."${key}"`;

function compactArray(key: string, fields: string[], extra = "'{}'::jsonb") {
  return `coalesce((select jsonb_agg(
    coalesce((select jsonb_object_agg(k, v) from jsonb_each(case when jsonb_typeof(item) = 'object' then item else '{}'::jsonb end) as entry(k, v)
      where k in (${fields.map(field => `'${field}'`).join(",")})), '{}'::jsonb) || ${extra})
    from jsonb_array_elements(case when jsonb_typeof(${field(key)}) = 'array'
      then ${field(key)} else '[]'::jsonb end) as item), '[]'::jsonb)`;
}

// Only use-case identity is needed for target-completeness checks; business flow text stays in detail reads.
const useCaseIds = "case when item->>'diagramKind' = 'usecase' then jsonb_build_object('useCases', coalesce((select jsonb_agg(jsonb_build_object('id', uc->'id')) from jsonb_array_elements(case when jsonb_typeof(item->'useCases') = 'array' then item->'useCases' else '[]'::jsonb end) uc), '[]'::jsonb)) else '{}'::jsonb end";

// Keep kind markers and artifact identity/counts compatible with existing history/admin views.
export const RUN_SUMMARY_SNAPSHOT_SQL = `
  (select coalesce((select jsonb_object_agg(k, v) from (values
    ${scalarKeys.map(key => `('${key}', ${field(key)})`).join(",")}) as entry(k, v)
    where v is not null), '{}'::jsonb)
  || jsonb_build_object(
    'error', summary."error", 'currentStage', summary."currentStage",
    'summaryRequirementTextLength', length(summary."requirementText" #>> '{}'),
    'providerSettings', jsonb_strip_nulls(jsonb_build_object(
      'model', summary."providerSettings"->'model',
      'providerConfigId', summary."providerSettings"->'providerConfigId')),
    'rules', ${compactArray("rules", ["id", "text"])},
    'models', ${compactArray("models", ["id", "modelId", "diagramKind", "title", "sourceUseCaseId"], useCaseIds)},
    'requirementModels', ${compactArray("requirementModels", ["id", "modelId", "diagramKind", "title", "sourceUseCaseId"], useCaseIds)},
    'plantUml', ${compactArray("plantUml", ["modelId", "diagramKind"], "jsonb_build_object('summarySourceLength', length(item->>'source'))")},
    'svgArtifacts', ${compactArray("svgArtifacts", ["modelId", "diagramKind", "renderMeta"], "jsonb_build_object('summaryPreviewAvailable', length(coalesce(item->>'svg', '')) > 0)")},
    'sections', ${compactArray("sections", ["title"])},
    'contextModel', case when summary."contextModel" is not null and summary."contextModel" != 'null'::jsonb then jsonb_build_object('title', summary."contextModel"->'title', 'modelId', summary."contextModel"->'modelId', 'diagramKind', summary."contextModel"->'diagramKind') else 'null'::jsonb end,
    'contextSvg', case when summary."contextSvg" is not null and summary."contextSvg" != 'null'::jsonb then jsonb_build_object('summaryPreviewAvailable', length(coalesce(summary."contextSvg"->>'svg','')) > 0) else 'null'::jsonb end,
    'businessFlow', case when summary."businessFlow" is not null and summary."businessFlow" != 'null'::jsonb then jsonb_build_object('model', jsonb_build_object('title', summary."businessFlow"->'model'->'title', 'modelId', summary."businessFlow"->'model'->'modelId', 'diagramKind', 'activity'), 'svg', jsonb_build_object('summaryPreviewAvailable', length(coalesce(summary."businessFlow"->'svg'->>'svg','')) > 0)) else 'null'::jsonb end,
    'implementationPlan', case when summary."implementationPlan" is not null and summary."implementationPlan" != 'null'::jsonb then '{}'::jsonb else 'null'::jsonb end,
    'coverageMatrix', case when summary."coverageMatrix" is not null and summary."coverageMatrix" != 'null'::jsonb
      then '{}'::jsonb else 'null'::jsonb end,
    'traceabilityMatrix', case when jsonb_typeof(summary."traceabilityMatrix") = 'object'
      then jsonb_build_object('summaryLinkCount', jsonb_array_length(case when jsonb_typeof(summary."traceabilityMatrix"->'links') = 'array' then summary."traceabilityMatrix"->'links' else '[]'::jsonb end),
        'summaryDiagnosticCount', jsonb_array_length(case when jsonb_typeof(summary."traceabilityMatrix"->'diagnostics') = 'array' then summary."traceabilityMatrix"->'diagnostics' else '[]'::jsonb end))
      else 'null'::jsonb end)
  || case when summary."designModelTraceability" is not null then '{"designModelTraceability":[]}'::jsonb else '{}'::jsonb end
  -- Expand each large JSON snapshot once, instead of decompressing it separately for every list field.
  from jsonb_to_record(snapshot) as summary(${columns.map(key => `"${key}" jsonb`).join(",")}))
`;
