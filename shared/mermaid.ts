// Modified in 2026 for the math-timeline adaptation; see NOTICE.
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const MERMAID_RENDER_REVISION = 1;

export const mermaidRenderInput = z.object({
  source: z
    .string()
    .min(1)
    .max(50_000)
    .refine((value) => value.trim().length > 0, "Mermaid source is empty"),
  colorScheme: z.enum(["light", "dark"]),
  density: z.number().min(1).max(8),
});

export const mermaidRenderOutput = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    png: z.string().max(8 * 1024 * 1024),
    width: z.number().positive().max(4096),
    height: z.number().positive().max(4096),
    density: z.number().min(1).max(8),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(["invalid", "too-large", "timeout", "unavailable"]),
  }),
]);

export const renderMermaid = defineRpc({
  name: "mermaid.render",
  input: mermaidRenderInput,
  output: mermaidRenderOutput,
});

export type MermaidRenderInput = z.infer<typeof mermaidRenderInput>;
export type MermaidRenderOutput = z.infer<typeof mermaidRenderOutput>;
