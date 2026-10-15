// Purges retired code runs and nested prototype payloads before any new API instance loads persistence.
import { retiredCodeFields, retiredCodeStages } from "@uml-platform/contracts";
const sqlArray = (values: readonly string[]) => `ARRAY[${values.map((value) => `'${value}'`).join(",")}]::text[]`;

export const retiredCodeDataSql = `
-- The migration runner owns the transaction and lock; old workers must be stopped before deployment.
CREATE OR REPLACE FUNCTION pg_temp.strip_retired_code_data(data jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $body$
DECLARE
  cleaned jsonb;
  item jsonb;
  member record;
  retired_fields text[] := ${sqlArray(retiredCodeFields)};
  retired_stages text[] := ${sqlArray(retiredCodeStages)};
BEGIN
  IF jsonb_typeof(data) = 'array' THEN
    cleaned := '[]'::jsonb;
    FOR item IN SELECT value FROM jsonb_array_elements(data) LOOP
      IF jsonb_typeof(item) = 'object' AND (
        item ? 'files' OR item->'snapshot' ? 'files'
        OR item->>'runKind' = 'code' OR item->>'kind' = 'code'
        OR item->>'type' = 'code_file_changed' OR item->>'workspaceId' = 'code'
        OR item->'selection'->>'workspaceId' = 'code' OR item->>'artifactType' = 'code'
        OR item->>'fromArtifactType' = 'code' OR item->>'toArtifactType' = 'code'
      ) THEN CONTINUE; END IF;
      cleaned := cleaned || jsonb_build_array(pg_temp.strip_retired_code_data(item));
    END LOOP;
    RETURN cleaned;
  ELSIF jsonb_typeof(data) = 'object' THEN
    cleaned := '{}'::jsonb;
    FOR member IN SELECT key, value FROM jsonb_each(data) LOOP
      IF member.key = ANY(retired_fields) OR (member.key = 'snapshot' AND member.value ? 'files') THEN CONTINUE; END IF;
      cleaned := cleaned || jsonb_build_object(member.key, pg_temp.strip_retired_code_data(member.value));
    END LOOP;
    IF cleaned->>'currentStage' = ANY(retired_stages) THEN
      cleaned := jsonb_set(cleaned, '{currentStage}', 'null'::jsonb);
      IF cleaned ? 'runStatus' THEN cleaned := jsonb_set(cleaned, '{runStatus}', '"idle"'::jsonb); END IF;
      IF cleaned ? 'runProgress' THEN cleaned := jsonb_set(cleaned, '{runProgress}', '0'::jsonb); END IF;
      IF cleaned ? 'runMessage' THEN cleaned := jsonb_set(cleaned, '{runMessage}', 'null'::jsonb); END IF;
      IF cleaned ? 'errorMessage' THEN cleaned := jsonb_set(cleaned, '{errorMessage}', 'null'::jsonb); END IF;
    END IF;
    RETURN cleaned;
  END IF;
  RETURN data;
END;
$body$;

-- Snapshot shape is the existing run-kind discriminator, including queued/failed runs.
DELETE FROM run_records WHERE snapshot ? 'files';
-- Foreign keys cascade events and clear document/workspace source references; billing remains intact.
UPDATE project_workspace_states
SET state = pg_temp.strip_retired_code_data(state), version = version + 1, updated_at = now()
WHERE state IS DISTINCT FROM pg_temp.strip_retired_code_data(state);
UPDATE run_records SET snapshot = pg_temp.strip_retired_code_data(snapshot)
WHERE snapshot IS DISTINCT FROM pg_temp.strip_retired_code_data(snapshot);
UPDATE run_events SET payload = pg_temp.strip_retired_code_data(payload)
WHERE payload IS DISTINCT FROM pg_temp.strip_retired_code_data(payload);
DELETE FROM prompt_runtime_active WHERE prompt_id LIKE 'code.%' OR prompt_id = 'skill.ui-ux-pro-max';
DELETE FROM prompt_runtime_versions WHERE prompt_id LIKE 'code.%' OR prompt_id = 'skill.ui-ux-pro-max';
DROP FUNCTION pg_temp.strip_retired_code_data(jsonb);
`;
