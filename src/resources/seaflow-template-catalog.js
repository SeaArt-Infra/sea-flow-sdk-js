import { requireIdentifier } from "../util.js";

// The published template catalog. Its requests carry the caller's Production
// Key because OpenResty protects the /flow route.
export class TemplateCatalogResource {
  constructor(transport) {
    this.transport = transport;
  }

  async search(request = {}) {
    return this.transport.post("/seaflow/template-catalog/search", {
      query: request.query,
      category: request.category,
      limit: request.limit,
    });
  }

  async readGraph(templateId) {
    requireIdentifier("templateId", templateId);
    return this.transport.post("/seaflow/template-catalog/graph", { id: templateId });
  }
}
