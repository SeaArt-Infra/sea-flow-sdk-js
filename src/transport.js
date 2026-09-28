import { END_USER_HEADER } from "./constants.js";
import { WorkflowAPIError, WorkflowConfigError } from "./errors.js";

const DEFAULT_TIMEOUT_MS = 60_000;

// WorkflowTransport performs the HTTP work: it derives the API URL, sets the
// Production Key and end-user header, and unwraps the platform envelope so every
// resource method returns `data` directly.
export class WorkflowTransport {
  constructor(baseURL, options = {}) {
    this.baseURL = normalizeBaseURL(baseURL);
    this.apiBaseURL = resolveAPIBaseURL(this.baseURL, options.apiBaseURL);
    this.productionKey = String(options.productionKey ?? "").trim();
    this.endUserID = String(options.endUserID ?? "").trim();
    this.headers = { ...(options.headers ?? {}) };
    this.timeoutMs = normalizeTimeoutMs(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  // withEndUser returns a transport that names a different end user. The
  // receiver is unchanged, which is what lets one client serve many end users.
  withEndUser(endUserID) {
    return new WorkflowTransport(this.baseURL, {
      apiBaseURL: this.apiBaseURL,
      productionKey: this.productionKey,
      endUserID,
      headers: this.headers,
      timeoutMs: this.timeoutMs,
    });
  }

  get(path, query) {
    return this.request({ method: "GET", path, query });
  }

  post(path, body) {
    return this.request({ method: "POST", path, body });
  }

  put(path, body) {
    return this.request({ method: "PUT", path, body });
  }

  patch(path, body) {
    return this.request({ method: "PATCH", path, body });
  }

  delete(path, query) {
    return this.request({ method: "DELETE", path, query });
  }

  async request({ method, path, query, body }) {
    const url = this.buildURL(path, query);
    if (this.productionKey === "") {
      throw new WorkflowConfigError(
        "MISSING_PRODUCTION_KEY",
        "sea-flow-sdk-js: productionKey is required",
      );
    }

    // A body goes out only when the caller has one. The contract declares no
    // requestBody for the four write routes that take no input — create a
    // workflow, publish one, create a workspace's workflow, stop a run — and the
    // canvas calls those with none, so an empty write is sent with no body and no
    // Content-Type rather than as {}.
    const hasBody = body !== undefined && body !== null;
    const headers = this.buildHeaders({ hasBody });
    const response = await fetch(url, {
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: this.timeoutMs === 0 ? undefined : AbortSignal.timeout(this.timeoutMs),
    });

    const text = await response.text();
    return decodeEnvelope(response.status, text, { method, path });
  }

  buildURL(path, query) {
    if (this.apiBaseURL === "") {
      throw new WorkflowConfigError(
        "MISSING_BASE_URL",
        "sea-flow-sdk-js: baseURL is required",
      );
    }
    const base = parseBaseURL(this.apiBaseURL);
    base.pathname = `${base.pathname.replace(/\/+$/, "")}${path}`;
    for (const [key, value] of Object.entries(query ?? {})) {
      if (isUnsetQueryValue(value)) {
        continue;
      }
      base.searchParams.set(key, String(value));
    }
    return base.toString();
  }

  // buildHeaders puts the caller's headers on first, then the credential and
  // end-user identifier. endUserID wins over a header of the same name so a
  // client cannot silently shadow it.
  buildHeaders({ hasBody }) {
    const headers = {};
    if (hasBody) {
      headers["Content-Type"] = "application/json";
    }
    headers.Accept = "application/json";
    for (const [key, value] of Object.entries(this.headers)) {
      if (key.trim() !== "") {
        headers[key] = value;
      }
    }
    deleteHeader(headers, "Authorization");
    headers.Authorization = `Bearer ${this.productionKey}`;
    deleteHeader(headers, END_USER_HEADER);
    if (this.endUserID !== "") {
      headers[END_USER_HEADER] = this.endUserID;
    }
    return headers;
  }
}

// decodeEnvelope turns one response into either the payload or a
// WorkflowAPIError. A non-2xx status and a non-zero body code are both failures:
// the contract mirrors them, and reading only one of the two would let a proxy
// or a future Engine slip an error past the caller.
function decodeEnvelope(status, text, request) {
  let decoded;
  try {
    decoded = text === "" ? {} : JSON.parse(text);
  } catch {
    if (status >= 200 && status <= 299) {
      throw new Error(
        `sea-flow-sdk-js: expected a JSON response from ${request.method} ${request.path}, got: ${preview(text)}`,
      );
    }
    throw new WorkflowAPIError(status, status, preview(text) || statusText(status));
  }

  const code = typeof decoded.code === "number" ? decoded.code : status;
  if (status < 200 || status > 299 || code !== 0) {
    const message = String(decoded.message ?? "").trim() || preview(text) || statusText(status);
    throw new WorkflowAPIError(status, code, message);
  }
  return decoded.data === undefined ? null : decoded.data;
}

// parseBaseURL rejects a destination the SDK cannot actually reach, instead of
// letting a bare URL TypeError or a non-HTTP scheme through.
function parseBaseURL(baseURL) {
  let parsed;
  try {
    parsed = new URL(baseURL);
  } catch {
    throw new WorkflowConfigError(
      "INVALID_BASE_URL",
      `sea-flow-sdk-js: invalid baseURL ${JSON.stringify(baseURL)}; an http or https URL is required`,
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new WorkflowConfigError(
      "INVALID_BASE_URL",
      `sea-flow-sdk-js: invalid baseURL ${JSON.stringify(baseURL)}; an http or https URL is required`,
    );
  }
  return parsed;
}

function isUnsetQueryValue(value) {
  return value === undefined || value === null || value === "" || value === 0;
}

function normalizeBaseURL(baseURL) {
  return String(baseURL ?? "").trim().replace(/\/+$/, "");
}

function resolveAPIBaseURL(baseURL, apiBaseURL) {
  const explicit = normalizeBaseURL(apiBaseURL);
  if (explicit !== "") {
    return explicit;
  }
  if (baseURL === "") {
    return "";
  }
  let parsed;
  try {
    parsed = new URL(baseURL);
  } catch {
    // buildURL performs the public validation when the caller first makes a
    // request, consistent with a missing BaseURL and the other SDKs.
    return `${baseURL}/api/v1`;
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  if (!parsed.pathname.endsWith("/api/v1")) {
    parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/api/v1`;
  }
  return normalizeBaseURL(parsed.toString());
}

function normalizeTimeoutMs(timeoutMs) {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new TypeError("timeoutMs must be a non-negative finite number");
  }
  return timeoutMs;
}

function deleteHeader(headers, name) {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      delete headers[key];
    }
  }
}

function preview(text) {
  const collapsed = String(text ?? "").replace(/\s+/g, " ").trim();
  return collapsed.length > 240 ? collapsed.slice(0, 240) : collapsed;
}

function statusText(status) {
  return `request failed with status ${status}`;
}
