import assert from "node:assert/strict";
import test from "node:test";

import { WorkflowClient, END_USER_HEADER, isConflict, isNotFound, WorkflowAPIError, WorkflowConfigError } from "./src/index.js";
import { captureServer, closeServer, envelope } from "./test-helpers.mjs";

test("a credentialed call carries the token, the end user and the query", async (t) => {
  const { server, requests, url } = await captureServer(envelope([]));
  t.after(() => closeServer(server));

  const client = new WorkflowClient({ baseURL: url, productionKey: "sdk-test-token", endUserID: "end-user-1" });
  await client.workspaces.list({ limit: 20, offset: 5 });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "GET");
  assert.equal(requests[0].path, "/api/v1/seaflow/workspaces");
  assert.equal(requests[0].query, "limit=20&offset=5");
  assert.equal(requests[0].headers.authorization, "Bearer sdk-test-token");
  assert.equal(requests[0].headers[END_USER_HEADER.toLowerCase()], "end-user-1");
});

test("zero pagination values are omitted", async (t) => {
  const { server, requests, url } = await captureServer(envelope([]));
  t.after(() => closeServer(server));

  const client = new WorkflowClient({ baseURL: url, productionKey: "sdk-test-token" });
  await client.workspaces.list({ limit: 0, offset: 0 });

  assert.equal(requests[0].query, "");
});

test("withEndUser names one end user per request without touching the original", async (t) => {
  const { server, requests, url } = await captureServer(envelope([]));
  t.after(() => closeServer(server));

  const shared = new WorkflowClient({ baseURL: url, productionKey: "sdk-test-token", endUserID: "default-user" });
  await shared.withEndUser("user-a").workspaces.list();
  await shared.withEndUser("user-b").workspaces.list();
  await shared.workspaces.list();

  assert.deepEqual(
    requests.map((request) => request.headers[END_USER_HEADER.toLowerCase()]),
    ["user-a", "user-b", "default-user"],
  );
  assert.equal(shared.transport.endUserID, "default-user");
});

test("one client serves many end users concurrently without mixing them up", async (t) => {
  const server = await import("node:http").then(({ createServer }) =>
    createServer((request, response) => {
      // Answer with the identifier the request actually carried.
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(envelope([{ id: request.headers[END_USER_HEADER.toLowerCase()] ?? "" }]));
    }),
  );
  const { listen } = await import("./test-helpers.mjs");
  await listen(server);
  t.after(() => closeServer(server));
  const url = `http://127.0.0.1:${server.address().port}`;

  const shared = new WorkflowClient({ baseURL: url, productionKey: "sdk-test-token" });
  const users = 24;
  const callsPerUser = 5;
  await Promise.all(
    Array.from({ length: users }, async (_unused, index) => {
      const endUser = `end-user-${index}`;
      const client = shared.withEndUser(endUser);
      for (let call = 0; call < callsPerUser; call += 1) {
        const workspaces = await client.workspaces.list();
        assert.equal(workspaces.length, 1);
        assert.equal(workspaces[0].id, endUser);
      }
    }),
  );
  assert.equal(shared.transport.endUserID, "");
});

test("the catalog carries the configured Production Key", async (t) => {
  const { server, requests, url } = await captureServer(envelope({ templates: [{ id: "tpl-1", name: "poster" }] }));
  t.after(() => closeServer(server));

  const client = new WorkflowClient({
    baseURL: url,
    productionKey: "sdk-test-token",
    endUserID: "end-user-1",
    headers: { Authorization: "Bearer wrong-key", "X-Extra": "kept" },
  });
  const result = await client.templateCatalog.search({ query: "poster", limit: 5 });
  assert.deepEqual(result.templates, [{ id: "tpl-1", name: "poster" }]);
  assert.equal(requests[0].headers.authorization, "Bearer sdk-test-token");
  assert.equal(requests[0].headers[END_USER_HEADER.toLowerCase()], "end-user-1");
  assert.equal(requests[0].headers["x-extra"], "kept");
});

test("baseURL derives the OpenResty /flow API path", async (t) => {
  const { server, requests, url } = await captureServer(envelope([]));
  t.after(() => closeServer(server));

  const client = new WorkflowClient({ baseURL: `${url}/flow`, productionKey: "sdk-test-token" });
  await client.models.list();

  assert.equal(requests[0].path, "/flow/api/v1/seaflow/models");
});

test("apiBaseURL overrides the derived API path", async (t) => {
  const { server, requests, url } = await captureServer(envelope([]));
  t.after(() => closeServer(server));

  const client = new WorkflowClient({ apiBaseURL: `${url}/custom`, productionKey: "sdk-test-token" });
  await client.models.list();

  assert.equal(requests[0].path, "/custom/seaflow/models");
});

test("a credentialed call without a token fails before the request", async (t) => {
  const { server, requests, url } = await captureServer(envelope([]));
  t.after(() => closeServer(server));

  const client = new WorkflowClient({ baseURL: url });
  await assert.rejects(client.workspaces.list(), (error) => {
    assert.ok(error instanceof WorkflowConfigError);
    assert.equal(error.code, "MISSING_PRODUCTION_KEY");
    return true;
  });
  assert.equal(requests.length, 0);
});

test("a missing or unusable baseURL fails clearly", async () => {
  await assert.rejects(new WorkflowClient({ productionKey: "sdk-test-token" }).templates.list(), (error) => {
    assert.equal(error.code, "MISSING_BASE_URL");
    return true;
  });
  await assert.rejects(
    new WorkflowClient({ baseURL: "sea-flow.example.com", productionKey: "sdk-test-token" }).models.list(),
    (error) => {
      assert.equal(error.code, "INVALID_BASE_URL");
      return true;
    },
  );
  await assert.rejects(
    new WorkflowClient({ baseURL: "ftp://sea-flow.example.com", productionKey: "sdk-test-token" }).models.list(),
    (error) => {
      assert.equal(error.code, "INVALID_BASE_URL");
      return true;
    },
  );
});

test("an error envelope becomes a typed WorkflowAPIError", async (t) => {
  const notFound = await captureServer(JSON.stringify({ code: 404, message: "workflow not found" }), 404);
  t.after(() => closeServer(notFound.server));
  const client = new WorkflowClient({ baseURL: notFound.url, productionKey: "sdk-test-token" });

  await assert.rejects(client.workflows.get("wf-1"), (error) => {
    assert.ok(error instanceof WorkflowAPIError);
    assert.equal(error.httpStatus, 404);
    assert.equal(error.code, 404);
    assert.equal(error.apiMessage, "workflow not found");
    assert.equal(isNotFound(error), true);
    assert.equal(isConflict(error), false);
    return true;
  });

  const conflict = await captureServer(JSON.stringify({ code: 409, message: "an active run blocks this" }), 409);
  t.after(() => closeServer(conflict.server));
  const other = new WorkflowClient({ baseURL: conflict.url, productionKey: "sdk-test-token" });
  await assert.rejects(other.workflows.createRun("wf-1"), (error) => isConflict(error) === true);
});

test("a non-zero body code on a 2xx status is still an error", async (t) => {
  const { server, url } = await captureServer(JSON.stringify({ code: 403, message: "production key is required" }), 200);
  t.after(() => closeServer(server));

  const client = new WorkflowClient({ baseURL: url, productionKey: "sdk-test-token" });
  await assert.rejects(client.workflows.createRun("wf-1"), (error) => {
    assert.equal(error.httpStatus, 200);
    assert.equal(error.code, 403);
    return true;
  });
});

test("a non-JSON error body is quoted back, and a non-JSON success is an error", async (t) => {
  const badGateway = await captureServer("<html>bad gateway</html>", 502);
  t.after(() => closeServer(badGateway.server));
  const client = new WorkflowClient({ baseURL: badGateway.url, productionKey: "sdk-test-token" });
  await assert.rejects(client.models.list(), (error) => {
    assert.equal(error.httpStatus, 502);
    assert.match(error.apiMessage, /bad gateway/);
    return true;
  });

  const htmlOK = await captureServer("<!doctype html>", 200);
  t.after(() => closeServer(htmlOK.server));
  const other = new WorkflowClient({ baseURL: htmlOK.url, productionKey: "sdk-test-token" });
  await assert.rejects(other.models.list(), (error) => error.name !== "WorkflowAPIError");
});

test("empty and null data need no payload", async (t) => {
  for (const [name, body] of [
    ["empty object", '{"code":0,"message":"ok"}'],
    ["null data", '{"code":0,"message":"ok","data":null}'],
    ["empty list", envelope([])],
  ]) {
    await t.test(name, async (t) => {
      const { server, url } = await captureServer(body);
      t.after(() => closeServer(server));
      const client = new WorkflowClient({ baseURL: url, productionKey: "sdk-test-token" });
      // The Engine answers a delete with no payload at all, so the only promise
      // is that it resolved.
      await client.workflows.delete("wf-1");
      // A list route always resolves to an array, so a caller can map over it.
      assert.deepEqual(await client.workspaces.list(), []);
      assert.deepEqual(await client.templates.list(), []);
    });
  }
});

test("a payload is returned as it arrived, and an absent one is null", async (t) => {
  const { server, url } = await captureServer('{"code":0,"message":"ok"}');
  t.after(() => closeServer(server));
  const client = new WorkflowClient({ baseURL: url, productionKey: "sdk-test-token" });

  // A read-modify-write caller gets exactly the object the Engine answered.
  assert.equal(await client.workflows.delete("wf-1"), null);

  const object = await captureServer(envelope({ id: "wf-1", name: "海报" }));
  t.after(() => closeServer(object.server));
  const other = new WorkflowClient({ baseURL: object.url, productionKey: "sdk-test-token" });
  assert.deepEqual(await other.workflows.get("wf-1"), { id: "wf-1", name: "海报" });
});

test("a missing identifier fails before the request", async (t) => {
  const { server, requests, url } = await captureServer(envelope(null));
  t.after(() => closeServer(server));
  const client = new WorkflowClient({ baseURL: url, productionKey: "sdk-test-token" });

  await assert.rejects(client.workflows.get("  "), /workflowId is required/);
  await assert.rejects(client.runs.stop(""), /runId is required/);
  await assert.rejects(client.workspaces.create({}), /request.name is required/);
  await assert.rejects(client.templates.get(undefined), /templateId is required/);
  await assert.rejects(client.templates.publish({ workflowId: "wf-1" }), /request.name is required/);
  await assert.rejects(client.workspaces.rename("ws-1", {}), /request.name is required/);
  await assert.rejects(client.workflows.pinCover("wf-1", {}), /request.nodeRunId is required/);
  await assert.rejects(client.templates.copy("tpl-1", {}), /request.workspaceId is required/);
  assert.equal(requests.length, 0);
});

// A caller mistake is a WorkflowConfigError, the same class as a missing baseURL
// or token, so `instanceof` tells it from the Engine's own answer. A plain Error
// here would make the documented check fall through.
test("a refusal before the request is a WorkflowConfigError", async (t) => {
  const { server, requests, url } = await captureServer(envelope(null));
  t.after(() => closeServer(server));
  const client = new WorkflowClient({ baseURL: url, productionKey: "sdk-test-token" });

  for (const [call, code] of [
    [() => client.workflows.get(""), "MISSING_IDENTIFIER"],
    [() => client.workflows.save("wf-1", {}), "MISSING_IDENTIFIER"],
  ]) {
    const error = await call().then(
      () => null,
      (thrown) => thrown,
    );
    assert.ok(error instanceof WorkflowConfigError, `want a WorkflowConfigError, got ${error}`);
    assert.equal(error.code, code);
  }
  assert.equal(requests.length, 0);
});

// A save replaces the draft's name: the Engine writes the name it is given, so a
// call without one would blank it. Refusing it locally is what keeps the canvas
// title from disappearing.
test("a save without a name is refused rather than blanking the name", async (t) => {
  const { server, requests, url } = await captureServer(envelope(null));
  t.after(() => closeServer(server));
  const client = new WorkflowClient({ baseURL: url, productionKey: "sdk-test-token" });

  await assert.rejects(
    client.workflows.save("wf-1", { graph: { nodes: [], edges: [] } }),
    /request.name is required/,
  );
  await assert.rejects(client.workflows.save("wf-1", { name: "   " }), /request.name is required/);
  assert.equal(requests.length, 0, "a refused save must not reach the Engine");
});

test("an identifier is escaped into a single path segment", async (t) => {
  const { server, requests, url } = await captureServer(envelope(null));
  t.after(() => closeServer(server));
  const client = new WorkflowClient({ baseURL: url, productionKey: "sdk-test-token" });

  await client.workflows.get("wf 1/../../etc");

  assert.equal(requests.length, 1);
  const prefix = "/api/v1/seaflow/workflows/";
  assert.ok(requests[0].path.startsWith(prefix), `path = ${requests[0].path}`);
  assert.equal(requests[0].path.slice(prefix.length).includes("/"), false);
});

test("a base path on the baseURL is preserved and the trailing slash is trimmed", async (t) => {
  const { server, requests, url } = await captureServer(envelope([]));
  t.after(() => closeServer(server));

  const client = new WorkflowClient({ baseURL: `${url}/prefix/`, productionKey: "sdk-test-token" });
  assert.equal(client.baseURL, `${url}/prefix`);
  await client.models.list();
  assert.equal(requests[0].path, "/prefix/api/v1/seaflow/models");
});
