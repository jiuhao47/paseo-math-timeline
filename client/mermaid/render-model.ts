// Adapted from Paseo's Apache-2.0 Mermaid render model; see NOTICE.
import type { MathMessage } from "../../shared/message.js";
import type {
  MermaidRenderInput,
  MermaidRenderOutput,
} from "../../shared/mermaid.js";

export type RenderedMermaidDiagram = Extract<MermaidRenderOutput, { ok: true }> & {
  source: string;
  colorScheme: MermaidRenderInput["colorScheme"];
};

export interface MermaidRenderModelInput extends MermaidRenderInput {
  phase: MathMessage["phase"];
  rejected: boolean;
  cached: RenderedMermaidDiagram | null;
}

export interface MermaidRenderRequest extends MermaidRenderInput {
  revision: number;
}

export interface MermaidRenderModel extends MermaidRenderInput {
  revision: number;
  phase: MathMessage["phase"];
  status: "pending" | "rendered" | "failed" | "rejected";
  visible: RenderedMermaidDiagram | null;
}

export type MermaidRenderAction =
  | { type: "inputChanged"; input: MermaidRenderModelInput }
  | {
      type: "rendered";
      revision: number;
      source: string;
      colorScheme: MermaidRenderInput["colorScheme"];
      density: number;
      output: Extract<MermaidRenderOutput, { ok: true }>;
    }
  | { type: "renderFailed"; revision: number };

function matchingCached(input: MermaidRenderModelInput): RenderedMermaidDiagram | null {
  const cached = input.cached;
  return cached &&
    cached.source === input.source &&
    cached.colorScheme === input.colorScheme &&
    cached.density === input.density
    ? cached
    : null;
}

function reduceRendered(
  state: MermaidRenderModel,
  action: Extract<MermaidRenderAction, { type: "rendered" }>,
): MermaidRenderModel {
  if (
    action.colorScheme !== state.colorScheme ||
    action.density !== state.density ||
    action.output.density !== action.density
  ) {
    return state;
  }
  if (action.revision !== state.revision || action.source !== state.source) {
    const isStreamingPrefix =
      state.phase === "streaming" &&
      action.revision < state.revision &&
      state.source.startsWith(action.source);
    const isNewerPreview =
      state.visible === null || action.source.length > state.visible.source.length;
    if (!isStreamingPrefix || !isNewerPreview) return state;
    return {
      ...state,
      visible: {
        ...action.output,
        source: action.source,
        colorScheme: action.colorScheme,
      },
    };
  }
  return {
    ...state,
    status: "rendered",
    visible: {
      ...action.output,
      source: action.source,
      colorScheme: action.colorScheme,
    },
  };
}

export function createMermaidRenderModel(
  input: MermaidRenderModelInput,
): MermaidRenderModel {
  if (input.rejected) {
    return {
      revision: 1,
      source: input.source,
      phase: input.phase,
      colorScheme: input.colorScheme,
      density: input.density,
      status: "rejected",
      visible: input.phase === "complete" ? null : matchingCached(input),
    };
  }
  return {
    revision: 1,
    source: input.source,
    phase: input.phase,
    colorScheme: input.colorScheme,
    density: input.density,
    status: "pending",
    visible: matchingCached(input),
  };
}

export function reduceMermaidRenderModel(
  state: MermaidRenderModel,
  action: MermaidRenderAction,
): MermaidRenderModel {
  if (action.type === "rendered") return reduceRendered(state, action);

  if (action.type === "renderFailed") {
    if (action.revision !== state.revision) return state;
    return {
      ...state,
      status: "failed",
      visible: state.phase === "complete" ? null : state.visible,
    };
  }

  const { input } = action;
  const isSameRender =
    input.source === state.source &&
    input.colorScheme === state.colorScheme &&
    input.density === state.density;
  if (isSameRender) {
    if (input.phase === state.phase) return state;
    const finalFailure =
      input.phase === "complete" &&
      (state.status === "failed" || state.status === "rejected");
    return {
      ...state,
      phase: input.phase,
      visible: finalFailure ? null : state.visible,
    };
  }

  const cached = matchingCached(input);
  if (input.rejected) {
    return {
      revision: state.revision + 1,
      source: input.source,
      phase: input.phase,
      colorScheme: input.colorScheme,
      density: input.density,
      status: "rejected",
      visible: input.phase === "complete" ? null : (cached ?? state.visible),
    };
  }

  return {
    revision: state.revision + 1,
    source: input.source,
    phase: input.phase,
    colorScheme: input.colorScheme,
    density: input.density,
    status: "pending",
    visible: cached ?? state.visible,
  };
}

export function getMermaidRenderRequest(
  state: MermaidRenderModel,
): MermaidRenderRequest | null {
  if (state.status !== "pending") return null;
  return {
    revision: state.revision,
    source: state.source,
    colorScheme: state.colorScheme,
    density: state.density,
  };
}
