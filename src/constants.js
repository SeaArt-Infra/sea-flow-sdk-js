// The header the Engine reads the integrating product's end user from
// (ADR-0010). Set from ClientOptions.endUserID.
export const END_USER_HEADER = "X-Infra-User-Id";

// Node kinds a canvas node may carry in graph node data.kind.
export const NODE_KIND = Object.freeze({
  INPUT_TEXT: "input-text",
  INPUT_IMAGE: "input-image",
  INPUT_VIDEO: "input-video",
  INPUT_AUDIO: "input-audio",
  GENERATE_TEXT: "generate-text",
  GENERATE_IMAGE: "generate-image",
  GENERATE_VIDEO: "generate-video",
  GENERATE_AUDIO: "generate-audio",
});

// Media handles an edge connects on. Both ends must carry the same medium.
export const HANDLE = Object.freeze({
  TEXT: "text",
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
});

export const MODEL_SOURCE = Object.freeze({
  MULTIMODAL: "multimodal",
  LLM: "llm",
});

export const WORKFLOW_STATUS = Object.freeze({
  DRAFT: "draft",
  ACTIVE: "active",
});

export const RUN_STATUS = Object.freeze({
  QUEUED: "queued",
  RUNNING: "running",
  STOPPING: "stopping",
  STOPPED: "stopped",
  COMPLETED: "completed",
  PARTIALLY_FAILED: "partially_failed",
  FAILED: "failed",
});

export const NODE_RUN_STATUS = Object.freeze({
  PENDING: "pending",
  DISPATCHING: "dispatching",
  SUBMITTED: "submitted",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
});

export const TEMPLATE_STATUS = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  OFFLINE: "offline",
});

export const CONTENT_TYPE = Object.freeze({
  TEXT: "text",
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
  FILE: "file",
});
