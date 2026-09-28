// Shared helpers for the resource modules.

import { WorkflowConfigError } from "./errors.js";

// requireIdentifier rejects an empty identifier before a request is sent, so a
// missing argument reads as a caller mistake instead of the Engine's 400/404.
// Like a missing baseURL or token it is a WorkflowConfigError, so a caller can
// tell "you called this wrong" from "the Engine answered".
export function requireIdentifier(name, value) {
  if (String(value ?? "").trim() === "") {
    throw new WorkflowConfigError(
      "MISSING_IDENTIFIER",
      `sea-flow-sdk-js: ${name} is required`,
    );
  }
}

// pathIdentifier keeps a caller-supplied identifier inside one path segment.
export function pathIdentifier(value) {
  return encodeURIComponent(String(value));
}

// listQuery maps list options onto the limit/offset pair every list route
// takes. Zero means the Engine's default and is not sent.
export function listQuery(options = {}) {
  return { limit: options.limit, offset: options.offset };
}

// asList keeps a list method's answer an array even when the Engine replied
// without a payload, so a caller can map over it without a null guard. A list
// route always means "the collection", and the empty case is an empty list.
export function asList(value) {
  return Array.isArray(value) ? value : [];
}

// compact drops undefined values so an unset field is not sent as null.
export function compact(value) {
  const output = {};
  for (const [key, item] of Object.entries(value ?? {})) {
    if (item !== undefined) {
      output[key] = item;
    }
  }
  return output;
}
