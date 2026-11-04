import { projectOwner } from "./domain.ts";
import { z } from "zod";
export const projectRecordSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),
    client: z.string().min(1),
    name: z.string().min(1),
    shortName: z.string().min(1),
    contact: z.string().min(1),
    email: z.email(),
    owner: z.string().min(1),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    progress: z.number().min(0).max(100),
    milestones: z
      .array(
        z.object({
          id: z.string().regex(/^[A-Za-z0-9_-]+$/),
          name: z.string().min(1),
          cents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
          complete: z.boolean(),
          acceptanceRequired: z.boolean(),
          accepted: z.boolean(),
          issued: z.boolean(),
          paidCents: z.number().int().nonnegative(),
          issuedDate: z.string().optional(),
        }),
      )
      .min(1),
  })
  .superRefine((p, ctx) => {
    if (
      new Set(p.milestones.map((m) => m.id)).size !== p.milestones.length ||
      p.milestones.some((m) => m.paidCents > m.cents) ||
      !Number.isSafeInteger(p.milestones.reduce((s, m) => s + m.cents, 0))
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid milestone amounts or duplicate IDs.",
      });
  });
export function projectRecord(raw: any): z.infer<typeof projectRecordSchema> {
  if (typeof raw === "string") {
    try {
      return projectRecord(JSON.parse(raw));
    } catch {
      throw Error("Unsupported project record.");
    }
  }
  const parsed = projectRecordSchema.safeParse(raw);
  if (parsed.success)
    return {
      ...parsed.data,
      owner: projectOwner(parsed.data.id, parsed.data.owner),
    };
  if (raw && typeof raw === "object")
    for (const value of Object.values(raw)) {
      try {
        return projectRecord(value);
      } catch {}
    }
  throw Error("Unsupported project record.");
}
