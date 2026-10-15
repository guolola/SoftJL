// Verifies trace entries are compacted before snapshots are persisted.
import assert from "node:assert/strict";
import test from "node:test";
import {
  
  createEmptyDesignSnapshot,
  createEmptySnapshot,
} from "../../records/snapshots.js";
import type { RunRecord } from "../../records/run-record-store.js";
import {
  appendCodeTrace,
  appendDesignTrace,
  appendRequirementTrace,
} from "./trace-events.js";
import { buildEmptyRequirementBaseline } from "../../baselines/requirement-baseline.js";

function createRecord(snapshot: RunRecord["snapshot"]): RunRecord {
  return {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };
}

test("appendRequirementTrace truncates long rawOutput and records metadata", () => {
  const previousLimit = process.env.UML_TRACE_RAW_OUTPUT_MAX_CHARS;
  process.env.UML_TRACE_RAW_OUTPUT_MAX_CHARS = "80";

  try {
    const snapshot = createEmptySnapshot("run-trace", "需求文本", ["class"], []);
    const record = createRecord(snapshot);
    const rawOutput = `${"a".repeat(120)}TAIL`;

    appendRequirementTrace(record, {
      stage: "generate_models",
      attempt: 1,
      kind: "llm_output",
      rawOutput,
    });

    const entry = snapshot.requirementTrace[0];
    assert.equal(entry?.rawOutputTruncated, true);
    assert.equal(entry?.rawOutputOriginalLength, rawOutput.length);
    assert.equal(entry?.rawOutput?.length, 80);
    assert.match(entry?.rawOutput ?? "", /rawOutput truncated/);
    assert.match(entry?.rawOutput ?? "", /TAIL$/);
  } finally {
    if (previousLimit === undefined) {
      delete process.env.UML_TRACE_RAW_OUTPUT_MAX_CHARS;
    } else {
      process.env.UML_TRACE_RAW_OUTPUT_MAX_CHARS = previousLimit;
    }
  }
});

test("appendDesignTrace leaves short rawOutput unchanged", () => {
  const previousLimit = process.env.UML_TRACE_RAW_OUTPUT_MAX_CHARS;
  process.env.UML_TRACE_RAW_OUTPUT_MAX_CHARS = "80";

  try {
    const snapshot = createEmptyDesignSnapshot("design-trace", {
      selectedDiagrams: ["sequence"],
      requirementBaseline: buildEmptyRequirementBaseline({ runId: "design-trace" }),
      requirementModels: [],
      requirementModelTraceability: [],
    });
    const record = createRecord(snapshot);

    appendDesignTrace(record, {
      stage: "generate_design_sequence",
      attempt: 1,
      kind: "llm_output",
      rawOutput: "short output",
    });

    const entry = snapshot.designTrace[0];
    assert.equal(entry?.rawOutput, "short output");
    assert.equal(entry?.rawOutputTruncated, undefined);
    assert.equal(entry?.rawOutputOriginalLength, undefined);
  } finally {
    if (previousLimit === undefined) {
      delete process.env.UML_TRACE_RAW_OUTPUT_MAX_CHARS;
    } else {
      process.env.UML_TRACE_RAW_OUTPUT_MAX_CHARS = previousLimit;
    }
  }
});

