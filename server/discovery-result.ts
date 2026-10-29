import { billing, money, type Project } from "./domain.ts";
import type { Doc } from "./store.ts";

// Discovery is a verified workflow result, not a claim for a model to infer.
export function discoveryReply(project: Project, docs: Doc[]) {
  const milestones = project.milestones.filter(
    (m) => m.complete && !m.issued && m.acceptanceRequired,
  );
  const verified = milestones.flatMap((m) => {
    const doc = docs.find(
      (d) =>
        d.id === m.acceptanceFileId &&
        d.projectId === project.id &&
        d.valid === true,
    );
    return m.accepted && doc ? [{ milestone: m, doc }] : [];
  });
  const missing = milestones.filter(
    (m) => !verified.some((v) => v.milestone.id === m.id),
  );
  const parts: string[] = [];
  if (verified.length) {
    parts.push(
      `I found and verified signed acceptance for ${project.client}: ${verified.map(({ milestone, doc }) => `${milestone.name} (${doc.name})`).join("; ")}.`,
    );
  }
  if (missing.length) {
    const review = docs.some(
      (d) =>
        d.projectId === project.id &&
        /accept|handover/i.test(d.name) &&
        d.valid === false,
    );
    parts.push(
      `I searched the configured Box project content and did not find verified signed acceptance for ${missing.map((m) => m.name).join(", ")}. ${review ? "A candidate could not be verified and needs review. " : ""}${money(missing.reduce((sum, m) => sum + m.cents, 0))} remains blocked. Upload the matching signed customer acceptance, then validate it.`,
    );
  } else if (verified.length) {
    parts.push(
      `${money(billing(project).ready)} is ready to bill. No invoice has been issued and no email has been sent.`,
    );
  } else {
    parts.push(
      "This project has no completed, unissued milestone awaiting customer acceptance.",
    );
  }
  return { text: parts.join(" "), sources: verified.map(({ doc }) => doc.id) };
}
