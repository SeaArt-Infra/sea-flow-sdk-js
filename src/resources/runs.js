import { pathIdentifier, requireIdentifier } from "../util.js";

// Reads and stops executions.
export class RunsResource {
  constructor(transport) {
    this.transport = transport;
  }

  // Read a run with every node record it created. Runner only.
  async get(runId) {
    requireIdentifier("runId", runId);
    return this.transport.get(`/seaflow/runs/${pathIdentifier(runId)}`);
  }

  // Stop future execution: nodes that have not started are not scheduled. A task
  // already submitted to the model gateway runs to a terminal state and may
  // still incur cost, but its result no longer triggers downstream nodes.
  // Idempotent.
  async stop(runId) {
    requireIdentifier("runId", runId);
    return this.transport.patch(`/seaflow/runs/${pathIdentifier(runId)}`);
  }
}
