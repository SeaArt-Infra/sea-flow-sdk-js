// The Engine answers every path with the platform envelope
// {"code":0,"message":"ok","data":...} on success and {"code":<status>,...} on
// failure. WorkflowAPIError is that failure, with the HTTP status kept separate
// from the body code because the contract mirrors them but does not have to.

export class WorkflowAPIError extends Error {
  constructor(httpStatus, code, message) {
    super(
      code === 0 || code === httpStatus
        ? `workflow engine HTTP ${httpStatus}: ${message}`
        : `workflow engine HTTP ${httpStatus} (code ${code}): ${message}`,
    );
    this.name = "WorkflowAPIError";
    this.httpStatus = httpStatus;
    this.code = code;
    // The Engine's own wording, without the SDK's formatting.
    this.apiMessage = message;
  }
}

// WorkflowConfigError is raised before any request is sent, for a caller
// mistake rather than a server answer.
export class WorkflowConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WorkflowConfigError";
    this.code = code;
  }
}

export function isNotFound(error) {
  return error instanceof WorkflowAPIError && error.httpStatus === 404;
}

export function isConflict(error) {
  return error instanceof WorkflowAPIError && error.httpStatus === 409;
}
