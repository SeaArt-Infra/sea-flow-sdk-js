# SeaFlow JavaScript SDK Usage Guide

`sea-flow-sdk-js` is a dependency-free Node.js client for the SeaFlow
project-facing API. It uses the runtime `fetch` implementation and keeps the
Production Key in the server-side process.

## Configure the client

```js
import { newClient } from "sea-flow-sdk-js";

const client = newClient({
  baseURL: "https://seainfra.dev/flow",
  productionKey: process.env.SEA_FLOW_SDK_PRODUCTION_KEY,
});
const user = client.withEndUser("customer-42");
```

`baseURL` is the OpenResty or Engine root; the SDK derives `/api/v1`. Set
`apiBaseURL` only for a non-standard mount or isolated test server.
`productionKey` is the single project credential and is sent as
`Authorization: Bearer <key>` on every request. `endUserID` becomes
`X-Infra-User-Id`, an opaque product-user identifier rather than a credential.

## Create, publish, and run a workflow

```js
import { HANDLE, NODE_KIND } from "sea-flow-sdk-js";

const workspace = await user.workspaces.create({ name: "My workflows" });
const workflow = await user.workspaces.createWorkflow(workspace.id);
await user.workflows.save(workflow.id, {
  name: "Poster",
  graph: {
    nodes: [
      { id: "input-1", type: "workflow", data: { kind: NODE_KIND.INPUT_TEXT, text: "一只小猫" } },
      { id: "image-1", type: "workflow", data: { kind: NODE_KIND.GENERATE_IMAGE, model: "nano_banana_2", prompt: "一只小猫的插画" } },
    ],
    edges: [{ id: "edge-1", source: "input-1", target: "image-1", sourceHandle: HANDLE.TEXT, targetHandle: HANDLE.TEXT }],
  },
});
const published = await user.workflows.publish(workflow.id);
const run = await user.workflows.createRun(workflow.id);
const detail = await user.runs.get(run.id);
console.log(published.publishedVersionId, detail.run.status);
```

`workflows.save` replaces both name and graph. Read the draft first when only
one field changes. A graph with runtime inputs must pass them to `createRun`.

## Resources

- `templateCatalog.search` and `readGraph` query the published catalog.
- `templates.list`, `publish`, `get`, `delete`, `copy`, and `publishVersion`
  manage catalog entries.
- `workspaces.list`, `create`, `get`, `rename`, `delete`, `listWorkflows`, and
  `createWorkflow` manage canvas containers.
- `workflows.list`, `create`, `get`, `save`, `delete`, `publish`, `pinCover`,
  `listRuns`, and `createRun` manage canvases and execution snapshots.
- `runs.get` and `stop` read or stop an execution.
- `models.list`, `assets.list`, and `records.list` expose model, output, and
  replayable-history views.

Production Key ownership scopes workspaces, canvases, assets, and records to a
project. Runs are separated by `endUserID`. Do not send `production_provider`;
SeaFlow resolves it from the onboarded project bound to the key.

## Graphs, constants, and errors

Graphs are plain JSON so canvas layout fields survive a read-modify-write cycle.
Use `NODE_KIND`, `HANDLE`, `WORKFLOW_STATUS`, `RUN_STATUS`, `NODE_RUN_STATUS`,
`TEMPLATE_STATUS`, and `CONTENT_TYPE` instead of string literals. Path
identifiers are escaped as one segment.

Server failures are `WorkflowAPIError`; use `isNotFound` and `isConflict`.
Configuration mistakes are `WorkflowConfigError` with codes such as
`MISSING_BASE_URL`, `MISSING_PRODUCTION_KEY`, and `MISSING_IDENTIFIER`.
Transport failures remain the runtime fetch error. List methods always resolve
to arrays.

## Testing

```bash
npm test
SEA_FLOW_SDK_BASE_URL=http://127.0.0.1:18082 \
SEA_FLOW_SDK_PRODUCTION_KEY=<project-key> \
node --test test-engine.mjs
```

Use a disposable Engine for the E2E test. It covers catalog access, workspace
and canvas lifecycle, publish, list, typed errors, records, assets, and request
shapes. A real model run requires a live model gateway and is not part of the
default SDK E2E test.
