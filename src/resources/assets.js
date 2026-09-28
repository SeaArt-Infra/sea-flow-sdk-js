import { asList } from "../util.js";

// The terminal output of the caller's runs, as the asset library lists it.
//
// Ownership follows the credential, not the end user: with the Production Key the
// list spans every end user of that project. Only runs are separated per end
// user. The result never contains another project's assets.
export class AssetsResource {
  constructor(transport) {
    this.transport = transport;
  }

  async list(options = {}) {
    const assets = await this.transport.get("/seaflow/assets", {
      workspaceId: options.workspaceId,
      workflowId: options.workflowId,
      limit: options.limit,
      offset: options.offset,
    });
    return asList(assets);
  }
}
