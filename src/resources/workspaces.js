import { asList, compact, listQuery, pathIdentifier, requireIdentifier } from "../util.js";

// Workspaces group canvases, and belong to the caller identity: with a project
// token that is the project, so every end user of the product shares them. An
// end user separates runs, not canvases (ADR-0005, ADR-0010).
export class WorkspacesResource {
  constructor(transport) {
    this.transport = transport;
  }

  async list(options = {}) {
    const workspaces = await this.transport.get("/seaflow/workspaces", listQuery(options));
    return asList(workspaces);
  }

  async create(request) {
    requireIdentifier("request.name", request?.name);
    return this.transport.post("/seaflow/workspaces", compact(request));
  }

  async get(workspaceId) {
    requireIdentifier("workspaceId", workspaceId);
    return this.transport.get(`/seaflow/workspaces/${pathIdentifier(workspaceId)}`);
  }

  async rename(workspaceId, request) {
    requireIdentifier("workspaceId", workspaceId);
    requireIdentifier("request.name", request?.name);
    return this.transport.patch(
      `/seaflow/workspaces/${pathIdentifier(workspaceId)}`,
      compact(request),
    );
  }

  async delete(workspaceId) {
    requireIdentifier("workspaceId", workspaceId);
    return this.transport.delete(`/seaflow/workspaces/${pathIdentifier(workspaceId)}`);
  }

  async listWorkflows(workspaceId, options = {}) {
    requireIdentifier("workspaceId", workspaceId);
    const workflows = await this.transport.get(
      `/seaflow/workspaces/${pathIdentifier(workspaceId)}/workflows`,
      listQuery(options),
    );
    return asList(workflows);
  }

  // Create a blank draft, named "Untitled workflow" until the first save.
  async createWorkflow(workspaceId) {
    requireIdentifier("workspaceId", workspaceId);
    return this.transport.post(`/seaflow/workspaces/${pathIdentifier(workspaceId)}/workflows`);
  }
}
