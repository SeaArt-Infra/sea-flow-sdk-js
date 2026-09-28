import assert from "node:assert/strict";
import test from "node:test";

import { WorkflowClient } from "./src/index.js";
import { captureServer, closeServer } from "./test-helpers.mjs";

// The query a call actually sent, with the pairs sorted so the test pins the
// parameters rather than the order a serialiser happened to use.
function sortedQuery(rawQuery) {
  return [...new URLSearchParams(rawQuery).entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

// One entry per path and verb in docs/seaflow-openapi.yaml. A typo here
// is a 404 the Engine would only report at run time, so the whole surface is
// pinned in one table.
const cases = [
  {
    name: "catalog search",
    method: "POST",
    path: "/api/v1/seaflow/template-catalog/search",
    body: '{"query":"海报","limit":5}',
    call: (client) => client.templateCatalog.search({ query: "海报", limit: 5 }),
  },
  {
    name: "catalog graph",
    method: "POST",
    path: "/api/v1/seaflow/template-catalog/graph",
    body: '{"id":"tpl-1"}',
    call: (client) => client.templateCatalog.readGraph("tpl-1"),
  },
  {
    name: "list templates",
    method: "GET",
    path: "/api/v1/seaflow/templates",
    query: "limit=10",
    call: (client) => client.templates.list({ limit: 10 }),
  },
  {
    name: "publish template",
    method: "POST",
    path: "/api/v1/seaflow/templates",
    body: '{"workflowId":"wf-1","name":"海报","category":"marketing","tags":["a","b"]}',
    call: (client) =>
      client.templates.publish({ workflowId: "wf-1", name: "海报", category: "marketing", tags: ["a", "b"] }),
  },
  {
    name: "get template",
    method: "GET",
    path: "/api/v1/seaflow/templates/tpl-1",
    call: (client) => client.templates.get("tpl-1"),
  },
  {
    name: "delete template",
    method: "DELETE",
    path: "/api/v1/seaflow/templates/tpl-1",
    body: "",
    call: (client) => client.templates.delete("tpl-1"),
  },
  {
    name: "copy template",
    method: "POST",
    path: "/api/v1/seaflow/templates/tpl-1/copies",
    body: '{"workspaceId":"ws-1","runtimeInputs":{"story":"一只小猫"}}',
    call: (client) => client.templates.copy("tpl-1", { workspaceId: "ws-1", runtimeInputs: { story: "一只小猫" } }),
  },
  {
    name: "publish template version",
    method: "POST",
    path: "/api/v1/seaflow/templates/tpl-1/versions",
    body: '{"workflowId":"wf-1","name":"海报 v2"}',
    call: (client) => client.templates.publishVersion("tpl-1", { workflowId: "wf-1", name: "海报 v2" }),
  },
  {
    name: "list workspaces",
    method: "GET",
    path: "/api/v1/seaflow/workspaces",
    call: (client) => client.workspaces.list(),
  },
  {
    name: "create workspace",
    method: "POST",
    path: "/api/v1/seaflow/workspaces",
    body: '{"name":"我的工作区"}',
    call: (client) => client.workspaces.create({ name: "我的工作区" }),
  },
  {
    name: "get workspace",
    method: "GET",
    path: "/api/v1/seaflow/workspaces/ws-1",
    call: (client) => client.workspaces.get("ws-1"),
  },
  {
    name: "rename workspace",
    method: "PATCH",
    path: "/api/v1/seaflow/workspaces/ws-1",
    body: '{"name":"新名字"}',
    call: (client) => client.workspaces.rename("ws-1", { name: "新名字" }),
  },
  {
    name: "delete workspace",
    method: "DELETE",
    path: "/api/v1/seaflow/workspaces/ws-1",
    body: "",
    call: (client) => client.workspaces.delete("ws-1"),
  },
  {
    name: "list workspace workflows",
    method: "GET",
    path: "/api/v1/seaflow/workspaces/ws-1/workflows",
    query: "limit=5",
    call: (client) => client.workspaces.listWorkflows("ws-1", { limit: 5 }),
  },
  {
    name: "create workspace workflow",
    method: "POST",
    path: "/api/v1/seaflow/workspaces/ws-1/workflows",
    body: "",
    call: (client) => client.workspaces.createWorkflow("ws-1"),
  },
  {
    name: "list workflows",
    method: "GET",
    path: "/api/v1/seaflow/workflows",
    call: (client) => client.workflows.list(),
  },
  {
    name: "create workflow",
    method: "POST",
    path: "/api/v1/seaflow/workflows",
    body: "",
    call: (client) => client.workflows.create(),
  },
  {
    name: "get workflow",
    method: "GET",
    path: "/api/v1/seaflow/workflows/wf-1",
    call: (client) => client.workflows.get("wf-1"),
  },
  {
    name: "save workflow",
    method: "PATCH",
    path: "/api/v1/seaflow/workflows/wf-1",
    body: '{"name":"海报","graph":{"nodes":[{"id":"n1","data":{"kind":"input-text","text":"一只小猫"}}]}}',
    call: (client) =>
      client.workflows.save("wf-1", {
        name: "海报",
        graph: { nodes: [{ id: "n1", data: { kind: "input-text", text: "一只小猫" } }] },
      }),
  },
  {
    name: "delete workflow",
    method: "DELETE",
    path: "/api/v1/seaflow/workflows/wf-1",
    body: "",
    call: (client) => client.workflows.delete("wf-1"),
  },
  {
    name: "publish workflow",
    method: "POST",
    path: "/api/v1/seaflow/workflows/wf-1/publish",
    body: "",
    call: (client) => client.workflows.publish("wf-1"),
  },
  {
    name: "pin cover",
    method: "PUT",
    path: "/api/v1/seaflow/workflows/wf-1/cover",
    body: '{"nodeRunId":"nr-1"}',
    call: (client) => client.workflows.pinCover("wf-1", { nodeRunId: "nr-1" }),
  },
  {
    name: "list runs",
    method: "GET",
    path: "/api/v1/seaflow/workflows/wf-1/runs",
    query: "offset=10",
    call: (client) => client.workflows.listRuns("wf-1", { offset: 10 }),
  },
  {
    name: "create run",
    method: "POST",
    path: "/api/v1/seaflow/workflows/wf-1/runs",
    body: '{"runtimeInputs":{"story":"一只小猫"}}',
    call: (client) => client.workflows.createRun("wf-1", { runtimeInputs: { story: "一只小猫" } }),
  },
  {
    // create-run is the one input route the canvas also calls with nothing, and
    // the Engine decodes its body, so an empty call still carries {} rather than
    // no body at all.
    name: "create run with no inputs",
    method: "POST",
    path: "/api/v1/seaflow/workflows/wf-1/runs",
    body: "{}",
    call: (client) => client.workflows.createRun("wf-1"),
  },
  {
    name: "get run",
    method: "GET",
    path: "/api/v1/seaflow/runs/run-1",
    call: (client) => client.runs.get("run-1"),
  },
  {
    name: "stop run",
    method: "PATCH",
    path: "/api/v1/seaflow/runs/run-1",
    body: "",
    call: (client) => client.runs.stop("run-1"),
  },
  {
    name: "list models",
    method: "GET",
    path: "/api/v1/seaflow/models",
    call: (client) => client.models.list(),
  },
  {
    name: "list assets",
    method: "GET",
    path: "/api/v1/seaflow/assets",
    query: "limit=3&workflowId=wf-1",
    call: (client) => client.assets.list({ workflowId: "wf-1", limit: 3 }),
  },
  {
    name: "list records",
    method: "GET",
    path: "/api/v1/seaflow/records",
    call: (client) => client.records.list(),
  },
];

test("every resource uses its contract path", async (t) => {
  for (const testCase of cases) {
    await t.test(testCase.name, async (t) => {
      const { server, requests, url } = await captureServer('{"code":0,"message":"ok","data":null}');
      t.after(() => closeServer(server));
      const client = new WorkflowClient({ baseURL: url, productionKey: "sdk-test-token", endUserID: "end-user-1" });

      await testCase.call(client);

      assert.equal(requests.length, 1, "the call must send exactly one request");
      const seen = requests[0];
      assert.equal(seen.method, testCase.method);
      assert.equal(seen.path, testCase.path);
      assert.equal(sortedQuery(seen.query), testCase.query ?? "");
      if (testCase.body !== undefined) {
        assert.equal(seen.body, testCase.body);
        // The Content-Type follows the body: a route the contract declares
        // without one is sent with neither.
        assert.equal(
          seen.headers["content-type"] ?? "",
          testCase.body === "" ? "" : "application/json",
          "Content-Type must follow the body",
        );
      }
    });
  }
});
