import { createServer } from "node:http";

// captureServer records the requests a test makes and answers every one of them
// with the same envelope.
export async function captureServer(body, status = 200) {
  const requests = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({
        method: request.method,
        path: request.url.split("?")[0],
        query: request.url.includes("?") ? request.url.split("?")[1] : "",
        headers: { ...request.headers },
        body: Buffer.concat(chunks).toString("utf8"),
      });
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(body);
    });
  });
  await listen(server);
  return { server, requests, url: `http://127.0.0.1:${server.address().port}` };
}

export function envelope(data) {
  return JSON.stringify({ code: 0, message: "ok", data });
}

export function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

export function closeServer(server) {
  server.closeAllConnections?.();
  return new Promise((resolve) => server.close(resolve));
}
