import { asList, listQuery } from "../util.js";

// The replayable run history across every workspace.
export class RecordsResource {
  constructor(transport) {
    this.transport = transport;
  }

  // The caller's run records, newest first.
  async list(options = {}) {
    const records = await this.transport.get("/seaflow/records", listQuery(options));
    return asList(records);
  }
}
