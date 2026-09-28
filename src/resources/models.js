import { asList } from "../util.js";

// What the canvas may bind to an execution node.
export class ModelsResource {
  constructor(transport) {
    this.transport = transport;
  }

  // Models the caller may bind, under their model entitlement. The answer comes
  // from the live gateway catalog, and the gateway stays the final authority at
  // run time.
  async list() {
    const models = await this.transport.get("/seaflow/models");
    return asList(models);
  }
}
