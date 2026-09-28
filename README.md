# sea-flow-sdk-js

> First release. The contract is maintained in SeaFlow at `docs/seaflow-openapi.yaml`.
> in the Workflow Engine repository; the Engine never depends on this package.

Node.js SDK for the Workflow Engine (SeaFlow). It wraps the project-facing API for
templates, workspaces, workflows, versions, runs and assets, so an integrating
product can publish a canvas and run it by id without hand-rolling HTTP.

No dependencies: it uses the runtime's own `fetch`, its own URL parsing and its own
test runner, so the package installs as a single tree.

## Available Resources

| Resource | Client field | What it does |
| --- | --- | --- |
| Template catalog | `client.templateCatalog` | Search the published catalog and read a template's graph with the caller's Production Key |
| Templates | `client.templates` | List, publish, read, take down, copy, and version catalog entries |
| Workspaces | `client.workspaces` | Create, list, rename, delete a workspace; create and list its canvases |
| Workflows | `client.workflows` | Create a draft, save its graph, publish it, pin a cover, start a run |
| Runs | `client.runs` | Read a run with its node records, and stop it |
| Models | `client.models` | List the models the canvas may bind to execution nodes |
| Assets | `client.assets` | List the terminal outputs of the caller's runs |
| Records | `client.records` | List the caller's replayable run history |

## How It Works

1. Create a client with the OpenResty root URL and the caller's Production Key.
2. Every request carries that same key as `Authorization: Bearer <token>`. OpenResty
   authenticates it, then SeaFlow resolves the workflow project bound to it.
3. The end user travels per request as `X-Infra-User-Id`. Set a default with
   `endUserID`, or copy the client per request with `withEndUser`.
4. The Engine answers with the platform envelope `{"code":0,"message":"ok","data":...}`.
   The SDK resolves with `data` directly and turns a failure into a `WorkflowAPIError`.

## Quick Start

```bash
npm install sea-flow-sdk-js
```

Requires Node 18.17 or newer, where `fetch` and `AbortSignal.timeout` are available.

```js
import { HANDLE, NODE_KIND, newClient } from "sea-flow-sdk-js";

const client = newClient({
  baseURL: "https://seainfra.dev/flow",
  productionKey: process.env.SEA_FLOW_SDK_PRODUCTION_KEY,
});

// The same client serves many end users; only the identifier changes.
const user = client.withEndUser("customer-42");

const workspace = await user.workspaces.create({ name: "My workflows" });
const workflow = await user.workspaces.createWorkflow(workspace.id);

await user.workflows.save(workflow.id, {
  name: "Poster",
  graph: {
    nodes: [
      { id: "input-1", type: "workflow", data: { kind: NODE_KIND.INPUT_TEXT, text: "一只小猫" } },
      {
        id: "image-1",
        type: "workflow",
        data: { kind: NODE_KIND.GENERATE_IMAGE, model: "nano_banana_2", prompt: "一只小猫的插画" },
      },
    ],
    edges: [
      { id: "edge-1", source: "input-1", target: "image-1", sourceHandle: HANDLE.TEXT, targetHandle: HANDLE.TEXT },
    ],
  },
});

const published = await user.workflows.publish(workflow.id);
console.log("published version:", published.publishedVersionId);

// Running it by id is the whole point of the service.
const run = await user.workflows.createRun(workflow.id);
const detail = await user.runs.get(run.id);
console.log("run status:", detail.run.status);
```

## Configuration

| Client option | Required | Meaning |
| --- | --- | --- |
| `baseURL` | yes, unless `apiBaseURL` is set | Gateway or Engine root. The SDK derives `<baseURL>/api/v1`; use `https://seainfra.dev/flow` for OpenResty |
| `apiBaseURL` | no | Explicit full API prefix, mainly for test servers or non-standard mounts |
| `productionKey` | yes | The one Production Key bound to this caller. Every API request carries it as Bearer authentication |
| `endUserID` | no | Default `X-Infra-User-Id`. The Engine stores it as an opaque identifier and never resolves it to an account |
| `headers` | no | Extra headers on every request. `Authorization` is always replaced with `productionKey`; set `endUserID` rather than an `X-Infra-User-Id` header |
| `timeoutMs` | no | Per-request timeout, 60 000 ms by default; `0` disables it |

`client.withEndUser(id)` returns a copy with a different end-user identifier. The
receiver is unchanged, so one process can serve many end users concurrently from a
single client — including with `Promise.all`, which the tests pin.

### Request bodies

A request body goes out only where the contract declares one. Four write routes take no
request body at all and are sent with no body and no `Content-Type`:
`workflows.create`, `workflows.publish`, `workspaces.createWorkflow` and `runs.stop`. A
route that does declare one always carries at least `{}`, because the Engine decodes it
and answers 400 to an empty POST/PUT/PATCH — `createRun(id)` with no argument is sent as
`{}` for that reason. `workflows.delete` is a DELETE and never carries one.

An unset field is left out of the body rather than sent as `undefined` or the Go zero
value, so the body is exactly what the caller set.

## Ownership

Ownership follows the Production Key's bound project, not the end user:

- `owner` is the bound project, so **workspaces, canvases, assets and
  records are project-scoped** — every end user of that product shares them.
- Runs are separated per end user: `workflows.listRuns` and `runs.get` only ever
  answer with the caller's own runs.

The catalog still carries the same key even though SeaFlow itself does not use it for
catalog ownership: OpenResty requires it before forwarding `/flow` requests.

## Errors

Every failure the Engine answers with is a `WorkflowAPIError` carrying `httpStatus`,
`code` and `apiMessage`:

```js
import { isConflict, isNotFound } from "sea-flow-sdk-js";

try {
  await client.workflows.get("wf-missing");
} catch (error) {
  if (isNotFound(error)) {
    // 404: the workflow does not exist, or is not visible to this caller
  }
  if (isConflict(error)) {
    // 409: an active run blocks the action, or a duplicate exists
  }
}
```

A non-zero body `code` is treated as a failure even when the HTTP status is 2xx. A
non-2xx status whose body is not JSON also produces a `WorkflowAPIError`, with the body
quoted back as its message.

A `2xx` whose body is not the Engine's envelope is *not* a `WorkflowAPIError`: there is
no failure envelope to carry, so the rejection is a plain `Error` naming the request and
quoting what arrived. That covers an HTML error page from a proxy that answered 200.

Failures raised before any request is sent are caller mistakes rather than server
answers, and they are `WorkflowConfigError`: code `MISSING_BASE_URL` or
`INVALID_BASE_URL` for the baseURL, `MISSING_PRODUCTION_KEY` for the credential, and
`MISSING_IDENTIFIER` for a blank identifier or a required request field
(`workflows.get("")`, `workflows.save(id, {})`). An unusable `timeoutMs` is refused when
the client is constructed, with a `TypeError`.

A failure below HTTP is not wrapped either: a refused connection rejects with `fetch`'s
`TypeError`, and a `timeoutMs` expiry rejects with the runtime's `TimeoutError`. Test
those with `instanceof` rather than with `isNotFound`, which is only about a 404.

List methods always resolve to an array, even when the Engine answers without a
payload, so a caller can map over the result without a null guard.

## Saving a draft

`workflows.save(id, { name, graph })` replaces both fields: the Engine writes the name it
is given and validates the graph it is given, so a request that omits the name blanks the
name rather than leaving it alone. When only one of the two is changing, read the draft
with `workflows.get(id)` first and send both back.

The SDK refuses a save without a name (`MISSING_IDENTIFIER`), so a title cannot disappear
by accident. A save without a graph reaches the Engine and is refused there with a 400.

## Identifiers and graphs

Every path identifier is escaped into a single path segment, so an identifier can never
add a route segment.

A graph is plain JSON, passed through untouched. That is on purpose: the canvas stores
its own layout fields (`dimensions`, `handleBounds`, …) next to the documented ones, and
a decoder that modelled only the documented keys would drop them on a
read-modify-write round trip. The documented keys are `kind` (one of `NODE_KIND`,
required), `label`, `model`, `prompt`, `params`, `text`, `assetUrl` and `runtimeInput`.
Edge handles are `HANDLE`, and both ends of an edge must carry the same medium.

The status values the API answers with are exported as `WORKFLOW_STATUS`,
`RUN_STATUS`, `NODE_RUN_STATUS` and `TEMPLATE_STATUS`, and asset kinds as
`CONTENT_TYPE`, so a caller compares against a constant instead of a string literal.

## Testing

```bash
npm test                      # offline: request shapes, envelope handling, error typing
```

The end-to-end test drives a real Engine process and is skipped unless you point it at
one. Use a disposable engine — it writes workspaces, canvases and catalog state:

```bash
SEA_FLOW_SDK_BASE_URL=http://127.0.0.1:18082 \
SEA_FLOW_SDK_PRODUCTION_KEY=<the Production Key> \
node --test test-engine.mjs
```

It covers: authenticated catalog access, an unbound Production Key being refused, create
workspace → create canvas → save a graph → read it back → publish → list workflows,
workspace workflows, workspace counts, runs, records and assets → typed 404s → delete.

Not covered end to end: starting a run, because that needs a live model gateway and a
credential that may call models. `createRun`, `runs.get` and `runs.stop` are covered by
the offline tests for request shape and error typing; the live path is exercised by the
Engine's own tests. There is no browser-side mode: the credential stays on the server.

See [docs/usage-guide.md](docs/usage-guide.md) for the complete developer guide and
[skills/sea-flow-sdk-js/SKILL.md](skills/sea-flow-sdk-js/SKILL.md) for the Agent skill.

<script type="text/plain" data-doc-skill data-doc-skill-id="sea-flow-sdk-js" data-doc-skill-label="Sea Flow SDK JS" data-doc-skill-filename="sea-flow-sdk-js-SKILL.md" data-doc-skill-version="1">
---
name: sea-flow-sdk-js
description: Implement or troubleshoot server-side SeaFlow workflow integrations with the JavaScript SDK. Use for template, workspace, workflow, run, model, asset, or record operations; do not use for browser clients.
---

# Sea Flow SDK JS

Use `sea-flow-sdk-js` on Node.js 18.17+.

## Scope

- Use this SDK from server code only. Keep `productionKey` in the host
  application's existing secret mechanism; do not expose it to a browser.
- Use the SDK rather than duplicating its REST transport or adding a
  `production_provider` request field.
- Read `docs/usage-guide.md` before using a resource method not covered here.

## Client and identity

```js
import { newClient } from "sea-flow-sdk-js"

const client = newClient({
  baseURL: process.env.SEA_FLOW_BASE_URL,
  productionKey: process.env.SEA_FLOW_SDK_PRODUCTION_KEY,
})

const user = client.withEndUser(currentUserID)
```

- Construct one shared client per server configuration. `withEndUser` returns a
  copy with a different `X-Infra-User-Id`; it does not change project ownership.
- Workspaces, workflows, templates, assets, and records belong to the project
  bound to the credential. End-user identity scopes run activity, not ownership.

## Workflow changes

- Standard write flow: create or copy a workspace workflow, `save` its complete
  graph and name, `publish`, then `createRun`.
- `workflows.save` replaces both name and graph. For a partial change, read the
  workflow first and preserve the field that is not changing.
- Treat graph objects as opaque JSON. Preserve canvas layout and unknown node
  fields during read-modify-write operations.
- `createRun` schedules asynchronous work. A concurrent active run can return a
  conflict; do not retry it blindly.

## Errors

- `WorkflowConfigError` means local input/configuration failed before a request;
  inspect its code, including `MISSING_BASE_URL`, `MISSING_PRODUCTION_KEY`, and
  `MISSING_IDENTIFIER`.
- `WorkflowAPIError` is an API envelope or HTTP failure. Use `isNotFound` and
  `isConflict` for 404 and 409 handling; preserve other error details for callers.
</script>
