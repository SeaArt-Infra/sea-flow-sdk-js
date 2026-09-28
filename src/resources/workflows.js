import { asList, compact, listQuery, pathIdentifier, requireIdentifier } from "../util.js";

// The canvas lifecycle: draft, save, publish, run.
export class WorkflowsResource {
  constructor(transport) {
    this.transport = transport;
  }

  // Own drafts and published workflows, plus published ones shared with the
  // caller's production line.
  async list(options = {}) {
    const workflows = await this.transport.get("/seaflow/workflows", listQuery(options));
    return asList(workflows);
  }

  // Create a blank draft in the caller's default workspace.
  async create() {
    return this.transport.post("/seaflow/workflows");
  }

  // Read one workflow. isOwner=false on the result means read-only.
  async get(workflowId) {
    requireIdentifier("workflowId", workflowId);
    return this.transport.get(`/seaflow/workflows/${pathIdentifier(workflowId)}`);
  }

  // Save the draft's name and graph. Owner only; the Engine validates the graph
  // and never accepts run results here.
  //
  // A save replaces both: the Engine writes the name it is given, so a call
  // without one blanks the name rather than leaving it alone. Read the draft
  // with get() first if only the graph is changing.
  async save(workflowId, request) {
    requireIdentifier("workflowId", workflowId);
    requireIdentifier("request.name", request?.name);
    return this.transport.patch(`/seaflow/workflows/${pathIdentifier(workflowId)}`, compact(request));
  }

  // Soft-delete a workflow; 409 while it has an active or stopping run.
  async delete(workflowId) {
    requireIdentifier("workflowId", workflowId);
    return this.transport.delete(`/seaflow/workflows/${pathIdentifier(workflowId)}`);
  }

  // Publish the saved draft: it mints an immutable version and moves the
  // definition's pointer to it (ADR-0007). The result's publishedVersionId names
  // the version a new end-user run executes.
  async publish(workflowId) {
    requireIdentifier("workflowId", workflowId);
    return this.transport.post(`/seaflow/workflows/${pathIdentifier(workflowId)}/publish`);
  }

  async pinCover(workflowId, request) {
    requireIdentifier("workflowId", workflowId);
    requireIdentifier("request.nodeRunId", request?.nodeRunId);
    return this.transport.put(
      `/seaflow/workflows/${pathIdentifier(workflowId)}/cover`,
      compact(request),
    );
  }

  // The caller's own runs of this workflow, newest first.
  async listRuns(workflowId, options = {}) {
    requireIdentifier("workflowId", workflowId);
    const runs = await this.transport.get(
      `/seaflow/workflows/${pathIdentifier(workflowId)}/runs`,
      listQuery(options),
    );
    return asList(runs);
  }

  // Start a run and return as soon as the Engine has scheduled it. The snapshot
  // and node records are written in one transaction, so the caller does not have
  // to stay connected. One active run per end user per workflow: a second
  // attempt answers 409, which isConflict reports.
  async createRun(workflowId, request = {}) {
    requireIdentifier("workflowId", workflowId);
    return this.transport.post(
      `/seaflow/workflows/${pathIdentifier(workflowId)}/runs`,
      compact(request),
    );
  }
}
