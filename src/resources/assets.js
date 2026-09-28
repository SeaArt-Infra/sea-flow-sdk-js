import { asList } from "../util.js";

// The terminal output of the caller's runs, as the asset library lists it.
//
// With endUserID, the list includes only that end user's outputs inside the
// project bound to the Production Key. The result never contains another
// project's or end user's assets.
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
