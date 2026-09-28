---
name: sea-flow-sdk-js
description: Build and troubleshoot SeaFlow integrations with the JavaScript SDK. Use when creating, publishing, copying, or running workflows, browsing templates and models, or diagnosing Production Key and end-user attribution errors.
---

# SeaFlow JavaScript SDK

Use `sea-flow-sdk-js` on Node.js 18.17+.

## Install

```bash
npm install sea-flow-sdk-js
```

## Workflow

1. Create one `newClient` with the OpenResty root and onboarded Production Key.
2. Call `withEndUser` for the current product user; it sets
   `X-Infra-User-Id` without changing project ownership.
3. Create or copy a workflow, save its graph, publish it, and create a run.
4. Read or stop runs; use `templateCatalog` and `models` for discovery.
5. Do not send `production_provider`; the server resolves it from the key's
   onboarded project.

## Initialize

```js
import { newClient } from "sea-flow-sdk-js";
const client = newClient({
  baseURL: "https://seainfra.dev/flow",
  productionKey: process.env.SEA_FLOW_SDK_PRODUCTION_KEY,
});
const user = client.withEndUser("customer-42");
```

Every request carries `Authorization: Bearer <productionKey>`. The key stays
server-side; the SDK has no browser mode.

## Core call

```js
const workspace = await user.workspaces.create({ name: "Demo" });
const workflow = await user.workspaces.createWorkflow(workspace.id);
await user.workflows.save(workflow.id, { name: "Demo", graph });
await user.workflows.publish(workflow.id);
const run = await user.workflows.createRun(workflow.id);
const detail = await user.runs.get(run.id);
```

## Errors

Catch `WorkflowAPIError`; use `isNotFound` and `isConflict`. Client mistakes
raise `WorkflowConfigError` with codes such as `MISSING_BASE_URL`,
`MISSING_PRODUCTION_KEY`, and `MISSING_IDENTIFIER`.

## Route reference

- `templateCatalog.search`, `readGraph`
- `templates.list`, `publish`, `get`, `delete`, `copy`, `publishVersion`
- `workspaces.list`, `create`, `get`, `rename`, `delete`, `listWorkflows`, `createWorkflow`
- `workflows.list`, `create`, `get`, `save`, `delete`, `publish`, `pinCover`, `listRuns`, `createRun`
- `runs.get`, `stop`; `models.list`; `assets.list`; `records.list`
