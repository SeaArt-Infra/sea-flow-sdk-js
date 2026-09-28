import assert from "node:assert/strict";
import test from "node:test";

import { HANDLE, NODE_KIND, RUN_STATUS, WorkflowClient, isNotFound } from "./src/index.js";

// This test drives a real Workflow Engine process. It is skipped unless both
// variables point at one, so the default `node --test` stays offline:
//
//   SEA_FLOW_SDK_BASE_URL=http://127.0.0.1:18082 \
//   SEA_FLOW_SDK_PRODUCTION_KEY=<the project's Production Key> \
//   node --test test-engine.mjs
//
// Point it at a disposable engine. It writes workspaces, workflows and catalog
// state, so never aim it at a shared deployment.
const baseURL = (process.env.SEA_FLOW_SDK_BASE_URL ?? "").trim();
const productionKey = (process.env.SEA_FLOW_SDK_PRODUCTION_KEY ?? "").trim();
const endUserID = (process.env.SEA_FLOW_SDK_END_USER ?? "").trim() || "sdk-e2e-end-user";
const skip =
  baseURL === "" || productionKey === ""
    ? "set SEA_FLOW_SDK_BASE_URL and SEA_FLOW_SDK_PRODUCTION_KEY to run the engine end-to-end test"
    : false;

const terminalRunStatuses = new Set([
  RUN_STATUS.STOPPED,
  RUN_STATUS.COMPLETED,
  RUN_STATUS.PARTIALLY_FAILED,
  RUN_STATUS.FAILED,
]);

async function waitForRun(client, runID, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const detail = await client.runs.get(runID);
    const status = detail?.run?.status;
    if (terminalRunStatuses.has(status)) {
      return detail;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`run ${runID} did not reach a terminal state within ${timeoutMs}ms`);
}

test("the engine end to end", { skip }, async (t) => {
  // 1. A credential the Engine cannot resolve is refused, not silently accepted.
  const unresolved = new WorkflowClient({ baseURL, productionKey: "not-an-onboarded-token", endUserID });
  await assert.rejects(unresolved.workspaces.list(), (error) => {
    // OpenResty may reject an unknown bearer before SeaFlow sees it (403),
    // while a direct Engine deployment answers 401.
    assert.ok([401, 403].includes(error.httpStatus));
    return true;
  });

  const client = new WorkflowClient({ baseURL, productionKey, endUserID });
  const otherUser = new WorkflowClient({ baseURL, productionKey, endUserID: "sdk-e2e-other-end-user" });

  // 2. Catalog requests use the same authenticated gateway path.
  const catalog = await client.templateCatalog.search({ limit: 5 });
  t.diagnostic(`catalog search returned ${catalog.templates.length} templates`);

  // 3. Create a workspace, then a canvas inside it.
  const workspace = await client.workspaces.create({ name: "SDK 端到端测试" });
  assert.notEqual(workspace.id, "");
  assert.equal(workspace.name, "SDK 端到端测试");

  const created = await client.workspaces.createWorkflow(workspace.id);
  assert.notEqual(created.id, "");
  assert.equal(created.workspaceId, workspace.id);
  const createdWorkflows = [created.id];
  t.after(async () => {
    // The test deletes the first workflow itself; a second delete is a no-op 404.
    for (const workflowId of createdWorkflows) {
      try {
        await client.workflows.delete(workflowId);
      } catch (error) {
        if (!isNotFound(error)) {
          t.diagnostic(`cleanup: delete ${workflowId}: ${error.message}`);
        }
      }
    }
    try {
      await client.workspaces.delete(workspace.id);
    } catch (error) {
      t.diagnostic(`cleanup: delete ${workspace.id}: ${error.message}`);
    }
  });

  // 4. Save a graph and read back what was written, layout fields included.
  // A text input feeding one generation node: publishing requires a generation
  // node (the Engine refuses a graph that produces nothing). The model name is
  // only read at run creation, which this test does not reach.
  const graph = {
    nodes: [
      {
        id: "local-input-1",
        type: "workflow",
        position: { x: 183, y: 75 },
        data: {
          kind: NODE_KIND.INPUT_TEXT,
          label: "Text input",
          text: "一只小猫",
          runtimeInput: true,
          dimensions: { width: 296, height: 256 },
        },
      },
      {
        id: "local-image-1",
        type: "workflow",
        position: { x: 584, y: 50 },
        data: {
          kind: NODE_KIND.GENERATE_IMAGE,
          label: "Image generation",
          model: "nano_banana_2",
          prompt: "一只小猫的插画",
          params: { resolution: "1K", aspect_ratio: "1:1" },
        },
      },
    ],
    edges: [
      { id: "edge-1", source: "local-input-1", target: "local-image-1", sourceHandle: HANDLE.TEXT, targetHandle: HANDLE.TEXT },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  const saved = await client.workflows.save(created.id, { name: "SDK 端到端测试画布", graph });
  assert.equal(saved.name, "SDK 端到端测试画布");
  assert.equal(saved.graph.nodes.length, 2);
  assert.equal(saved.graph.edges.length, 1);
  assert.equal(saved.graph.nodes[0].data.text, "一只小猫");
  assert.ok("dimensions" in saved.graph.nodes[0].data, "the canvas layout field did not survive the round trip");
  assert.equal(saved.graph.nodes[1].data.model, "nano_banana_2");

  // 5. Draft workflows are private to the end user that created them.
  await assert.rejects(otherUser.workflows.get(created.id), isNotFound);

  // 5b. Publish it, which mints the immutable version a run executes (ADR-0007).
  const published = await client.workflows.publish(created.id);
  assert.notEqual(published.publishedVersionId, "");
  t.diagnostic(`published version ${published.publishedVersionId}`);

  // Published workflows are visible to callers on the same production line.
  await otherUser.workflows.get(created.id);

  // 6. Reads that must agree with the writes.
  const workflows = await client.workflows.list({ limit: 100 });
  assert.ok(workflows.some((workflow) => workflow.id === created.id));
  const inWorkspace = await client.workspaces.listWorkflows(workspace.id, { limit: 100 });
  assert.ok(inWorkspace.some((workflow) => workflow.id === created.id));
  const reloaded = await client.workspaces.get(workspace.id);
  assert.ok(reloaded.workflowCount >= 1);
  const runs = await client.workflows.listRuns(created.id, { limit: 10 });
  assert.deepEqual(runs, []);
  await client.records.list({ limit: 5 });
  await client.assets.list({ limit: 5 });

  // 7. A missing resource is a typed 404, not a generic failure.
  await assert.rejects(client.workflows.get("wf-does-not-exist"), isNotFound);
  await assert.rejects(client.runs.get("run-does-not-exist"), isNotFound);
  await assert.rejects(client.runs.stop("run-does-not-exist"), isNotFound);

  // 8. Delete, then confirm the Engine agrees it is gone.
  await client.workflows.delete(created.id);
  createdWorkflows.splice(createdWorkflows.indexOf(created.id), 1);
  await assert.rejects(client.workflows.get(created.id), isNotFound);

  // 9. Run a published graph through the live model gateway and wait for the
  // asynchronous node result before cleanup. This also verifies that the SDK
  // preserves the run detail and generated asset/record surfaces.
  const runGraph = structuredClone(graph);
  delete runGraph.nodes[0].data.runtimeInput;
  const runner = await client.workspaces.createWorkflow(workspace.id);
  createdWorkflows.push(runner.id);
  await client.workflows.save(runner.id, { name: "SDK 端到端运行测试", graph: runGraph });
  await client.workflows.publish(runner.id);
  const started = await client.workflows.createRun(runner.id);
  assert.ok(started.id);
  const detail = await waitForRun(client, started.id);
  assert.ok(terminalRunStatuses.has(detail.run.status));
  assert.equal(detail.run.status, RUN_STATUS.COMPLETED);
  assert.equal(detail.nodeRuns.length, 1);
  assert.equal(detail.nodeRuns[0].status, "completed");
  assert.ok(detail.nodeRuns[0].output?.length > 0);
  const runRecords = await client.records.list({ limit: 20 });
  assert.ok(Array.isArray(runRecords));
  const runAssets = await client.assets.list({ workflowId: runner.id, limit: 10 });
  assert.ok(Array.isArray(runAssets));
});
