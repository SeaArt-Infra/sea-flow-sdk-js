import { asList, compact, listQuery, pathIdentifier, requireIdentifier } from "../util.js";

// The caller's own catalog entries.
export class TemplatesResource {
  constructor(transport) {
    this.transport = transport;
  }

  async list(options = {}) {
    const templates = await this.transport.get("/seaflow/templates", listQuery(options));
    return asList(templates);
  }

  // Publish the caller's own workflow as a new catalog entry. It takes effect
  // immediately, with no review step (ADR-0011).
  async publish(request) {
    requireIdentifier("request.workflowId", request?.workflowId);
    requireIdentifier("request.name", request?.name);
    return this.transport.post("/seaflow/templates", compact(request));
  }

  async get(templateId) {
    requireIdentifier("templateId", templateId);
    return this.transport.get(`/seaflow/templates/${pathIdentifier(templateId)}`);
  }

  // Take the caller's own template out of the catalog. Copies already made keep
  // running (ADR-0011).
  async delete(templateId) {
    requireIdentifier("templateId", templateId);
    return this.transport.delete(`/seaflow/templates/${pathIdentifier(templateId)}`);
  }

  async copy(templateId, request = {}) {
    requireIdentifier("templateId", templateId);
    requireIdentifier("request.workspaceId", request?.workspaceId);
    return this.transport.post(
      `/seaflow/templates/${pathIdentifier(templateId)}/copies`,
      compact(request),
    );
  }

  async publishVersion(templateId, request) {
    requireIdentifier("templateId", templateId);
    requireIdentifier("request.workflowId", request?.workflowId);
    requireIdentifier("request.name", request?.name);
    return this.transport.post(
      `/seaflow/templates/${pathIdentifier(templateId)}/versions`,
      compact(request),
    );
  }
}
