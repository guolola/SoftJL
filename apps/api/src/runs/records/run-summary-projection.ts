// Projects persisted history into list metadata without transferring diagrams or LLM transcripts.
const scalarKeys = [
  "runId", "status", "currentStage", "error", "errorMessage", "diagramErrors",
  "selectedDiagrams", "requestedDiagrams", "dependencyDiagrams", "selectedArtifacts",
  "documentKind", "documentId", "fileName", "byteLength", "missingArtifacts",
  "generationDiagnostics", "_offlineDemoFixture",
];
const arrayKeys = ["rules", "models", "requirementModels", "plantUml", "svgArtifacts", "sections"];
const columns = [...scalarKeys, ...arrayKeys, "requirementText", "providerSettings", "coverageMatrix", "traceabilityMatrix", "designModelTraceability"];
const field = (key: string) => `summary."${key}"`;

function compactArray(key: string, fields: string[], extra = "'{}'::jsonb") {
  return `coalesce((select jsonb_agg(
    coalesce((select jsonb_object_agg(k, v) from jsonb_each(case when jsonb_typeof(item) = 'object' then item else '{}'::jsonb end) as entry(k, v)
      where k in (${fields.map(field => `'${field}'`).join(",")})), '{}'::jsonb) || ${extra})
    from jsonb_array_elements(case when jsonb_typeof(${field(key)}) = 'array'
      then ${field(key)} else '[]'::jsonb end) as item), '[]'::jsonb)`;
}

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
    'models', ${compactArray("models", ["id", "modelId", "diagramKind", "title"])},
    'requirementModels', ${compactArray("requirementModels", ["id", "modelId", "diagramKind", "title"])},
    'plantUml', ${compactArray("plantUml", ["modelId", "diagramKind"], "jsonb_build_object('summarySourceLength', length(item->>'source'))")},
    'svgArtifacts', ${compactArray("svgArtifacts", ["modelId", "diagramKind", "renderMeta"], "jsonb_build_object('summaryPreviewAvailable', length(coalesce(item->>'svg', '')) > 0)")},
    'sections', ${compactArray("sections", ["title"])},
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
