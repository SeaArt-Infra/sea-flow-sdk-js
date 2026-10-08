import { TemplateCatalogResource } from "./resources/seaflow-template-catalog.js";
import { TemplatesResource } from "./resources/templates.js";
import { WorkspacesResource } from "./resources/workspaces.js";
import { WorkflowsResource } from "./resources/workflows.js";
import { RunsResource } from "./resources/runs.js";
import { ModelsResource } from "./resources/models.js";
import { AssetsResource } from "./resources/assets.js";
import { RecordsResource } from "./resources/records.js";
import { WorkflowTransport } from "./transport.js";

// WorkflowClient is the whole Engine surface, grouped by resource.
//
// The Production Key stays on the server side of whatever product embeds
// this SDK (ADR-0015: no package offers a browser-side mode).
export class WorkflowClient {
  constructor(options = {}) {
    this.transport = new WorkflowTransport(options.baseURL, options);

    this.templateCatalog = new TemplateCatalogResource(this.transport);
    this.templates = new TemplatesResource(this.transport);
    this.workspaces = new WorkspacesResource(this.transport);
    this.workflows = new WorkflowsResource(this.transport);
    this.runs = new RunsResource(this.transport);
    this.models = new ModelsResource(this.transport);
    this.assets = new AssetsResource(this.transport);
    this.records = new RecordsResource(this.transport);
  }

  get baseURL() {
    return this.transport.baseURL;
  }

  get apiBaseURL() {
    return this.transport.apiBaseURL;
  }

  // withEndUser returns a client that names a different end user. The receiver is
  // unchanged, and the copy shares configuration — only the `X-Infra-User-Id`
  // value differs. Use it when one process serves many end users, which is the
  // normal shape for an integrating product's server.
  withEndUser(endUserID) {
    const clone = Object.create(WorkflowClient.prototype);
    clone.transport = this.transport.withEndUser(endUserID);
    clone.templateCatalog = new TemplateCatalogResource(clone.transport);
    clone.templates = new TemplatesResource(clone.transport);
    clone.workspaces = new WorkspacesResource(clone.transport);
    clone.workflows = new WorkflowsResource(clone.transport);
    clone.runs = new RunsResource(clone.transport);
    clone.models = new ModelsResource(clone.transport);
    clone.assets = new AssetsResource(clone.transport);
    clone.records = new RecordsResource(clone.transport);
    return clone;
  }

  // withScope returns a client whose reads resolve against another read scope.
  // The receiver is unchanged, and the copy shares configuration — only the
  // scope of a read differs. SCOPE.TEAM reads the project's shared space;
  // writes are unaffected and always stay in the caller's own space.
  withScope(scope) {
    const clone = Object.create(WorkflowClient.prototype);
    clone.transport = this.transport.withScope(scope);
    clone.templateCatalog = new TemplateCatalogResource(clone.transport);
    clone.templates = new TemplatesResource(clone.transport);
    clone.workspaces = new WorkspacesResource(clone.transport);
    clone.workflows = new WorkflowsResource(clone.transport);
    clone.runs = new RunsResource(clone.transport);
    clone.models = new ModelsResource(clone.transport);
    clone.assets = new AssetsResource(clone.transport);
    clone.records = new RecordsResource(clone.transport);
    return clone;
  }
}

export function newClient(options) {
  return new WorkflowClient(options);
}
