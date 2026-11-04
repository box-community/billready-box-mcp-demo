import { createHash } from "node:crypto";
import { remote } from "./box-content.ts";
import { currentEmployee } from "./context.ts";
import { isCustomerDocument } from "../shared/customer-documents.ts";
import { PDFDocument as PDFBinder } from "pdf-lib";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  projects,
  updateProject,
  get,
  put,
  documents,
  addDoc,
  activity,
  storageDir,
  type Doc,
} from "./store.ts";
import {
  billing,
  money,
  assertBillable,
  validateAcceptance,
  DEMO_DATE,
  dateOffset,
  type Project,
} from "./domain.ts";
import {
  analyze,
  persistFile,
  mode,
  refreshDocuments,
  previewBytes,
} from "./adapter.ts";
import { invoicePdf, makePdf } from "./pdf.ts";
export type Proposal = {
  id: string;
  projectId: string;
  type: "billing" | "followup";
  milestoneIds: string[];
  to: string;
  subject: string;
  body: string;
  owner: string;
  due: string;
  attachments: string[];
  status: "review" | "prepared";
  savedIds: string[];
  reference: string;
  created: string;
  resolved?: boolean;
};
export const proposals = () => get<Proposal[]>("proposals", []);
export async function reassess(pid: string, docs: Doc[]) {
  let p = projects().find((x) => x.id === pid);
  if (!p) throw Error("Unknown project");
  const results = [];
  for (const d of docs.filter(
    (x) => x.projectId === pid && x.name.endsWith(".pdf") && !x.generated,
  )) {
    let a;
    try {
      a = await analyze(d);
    } catch (e) {
      addDoc({
        ...d,
        valid: false,
        analysis: `Analysis failed: ${(e as Error).message}`,
      });
      results.push({
        docId: d.id,
        valid: false,
        reason: "Analysis unavailable. Retained for review.",
      });
      continue;
    }
    if (!a.projectId && !a.signed) continue;
    const m =
      p.milestones.find((m) => m.id === a.milestoneId) ||
      p.milestones.find((m) => !m.issued && m.acceptanceRequired);
    if (!m) continue;
    const reason = validateAcceptance(a, p, m);
    addDoc({
      ...d,
      analysis: reason || `${a.quote} Signed by ${a.signer}, ${a.date}.`,
      valid: !reason,
    });
    results.push({ docId: d.id, valid: !reason, reason });
    if (!reason) {
      const newlyAccepted = !m.accepted;
      m.accepted = true;
      m.acceptanceFileId = d.id;
      updateProject(p);
      put(
        "proposals",
        proposals().map((proposal) =>
          proposal.projectId === pid && proposal.type === "followup"
            ? { ...proposal, resolved: true }
            : proposal,
        ),
      );
      if (newlyAccepted)
        activity(
          `Acceptance verified for ${m.name}. ${money(m.cents)} is ready to bill.`,
          pid,
        );
    }
  }
  return results;
}
export async function discover(pid?: string) {
  await refreshDocuments();
  const ids = pid ? [pid] : projects().map((p) => p.id);
  const results = [];
  for (const id of ids) {
    const candidates = documents().filter(
      (d) =>
        d.projectId === id && /accept|handover/i.test(d.name) && !d.generated,
    );
    results.push(...(await reassess(id, candidates)));
    const p = projects().find((p) => p.id === id)!;
    let changed = false;
    for (const m of p.milestones) {
      if (
        !m.issued &&
        m.acceptanceRequired &&
        m.accepted &&
        m.acceptanceFileId &&
        !documents().some((d) => d.id === m.acceptanceFileId && d.valid)
      ) {
        m.accepted = false;
        delete m.acceptanceFileId;
        changed = true;
        activity(
          `Acceptance evidence is no longer verified for ${m.name}. Billing is blocked.`,
          p.id,
        );
      }
    }
    if (changed) updateProject(p);
  }
  return results;
}
export function propose(p: Project, type: "billing" | "followup"): Proposal {
  const ids =
    type === "billing"
      ? p.milestones
          .filter(
            (m) =>
              m.complete && !m.issued && (!m.acceptanceRequired || m.accepted),
          )
          .map((m) => m.id)
      : p.milestones
          .filter(
            (m) =>
              m.complete && !m.issued && m.acceptanceRequired && !m.accepted,
          )
          .map((m) => m.id);
  if (!ids.length)
    throw Error(
      type === "billing"
        ? "No milestones are ready to bill. Review the blockers first."
        : "No acceptance follow-up is needed for this project.",
    );
  if (type === "billing") assertBillable(p, ids);
  const key = `${type}-${p.id}-${ids.join("-")}`;
  const existing = proposals().find((x) => x.id === key);
  if (existing) return existing;
  const amount = ids.reduce(
    (s, id) => s + p.milestones.find((m) => m.id === id)!.cents,
    0,
  );
  const attachments = documents()
    .filter(
      (d) =>
        d.projectId === p.id &&
        (d.category === "Delivery evidence" ||
          /project-agreement/.test(d.name) ||
          (type === "billing" && d.valid)),
    )
    .map((d) => d.id);
  const draft: Proposal = {
    id: key,
    projectId: p.id,
    type,
    milestoneIds: ids,
    to: p.email,
    subject:
      type === "billing"
        ? `Billing package for review - ${p.name}`
        : `Acceptance requested - ${p.name}`,
    body:
      type === "billing"
        ? `Hi ${p.contact.split(" ")[0]},\n\nPlease find the draft invoice for ${money(amount)} and the supporting completion and acceptance evidence for ${p.name}. Payment terms will be Net 30 from issue.\n\nPlease review the attached billing package.\n\nThank you,\n${currentEmployee()?.employee.name || "Avery Quinn"}\nClearwave AV`
        : `Hi ${p.contact.split(" ")[0]},\n\nInstallation and commissioning for ${p.name} are complete. Could you review the attached completion report and return signed acceptance for the final milestone? This will allow us to prepare the ${money(amount)} billing package.\n\nThank you,\n${currentEmployee()?.employee.name || "Avery Quinn"}\nClearwave AV`,
    owner: p.owner,
    due: dateOffset(1),
    attachments,
    status: "review",
    savedIds: [],
    reference: `DRAFT-${p.businessId || p.id}-${ids.join("-")}`,
    created: DEMO_DATE,
  };
  put("proposals", [...proposals(), draft]);
  return draft;
}
export async function prepareBilling(projectId: string): Promise<Proposal> {
  const p = projects().find((p) => p.id === projectId);
  if (!p) throw Error("Unknown project");
  const unlinked = p.milestones.filter(
    (m) =>
      m.complete &&
      !m.issued &&
      m.acceptanceRequired &&
      m.accepted &&
      !m.acceptanceFileId,
  );
  if (unlinked.length) {
    await reassess(
      projectId,
      documents().filter(
        (d) =>
          d.projectId === projectId &&
          !d.generated &&
          /accept|handover/i.test(d.name) &&
          d.name.endsWith(".pdf"),
      ),
    );
    const checked = projects().find((p) => p.id === projectId)!;
    for (const m of checked.milestones)
      if (unlinked.some((x) => x.id === m.id) && !m.acceptanceFileId)
        m.accepted = false;
    updateProject(checked);
  }
  return propose(
    projects().find((p) => p.id === projectId)!,
    "billing",
  );
}
export const editSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(15000),
  owner: z.string().min(1).max(200),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  attachments: z.array(z.string()),
});
export function editProposal(id: string, input: unknown) {
  const edits = editSchema.parse(input);
  const existing = proposals().find((x) => x.id === id);
  if (!existing) throw Error("Proposal not found");
  if (existing.status === "prepared")
    throw Error("Prepared packages are immutable.");
  if (
    edits.attachments.some(
      (id) =>
        !documents().some(
          (d) =>
            d.id === id &&
            d.projectId === existing.projectId &&
            isCustomerDocument(d),
        ),
    )
  )
    throw Error(
      "Attachments must be customer-facing documents from this project",
    );
  if (
    edits.attachments.some(
      (id) => documents().find((d) => d.id === id)?.valid === false,
    )
  )
    throw Error(
      "Rejected evidence cannot be included as a billing attachment.",
    );
  if (mode !== "live" && !edits.to.endsWith(".example"))
    throw Error("Demo recipients must use a reserved .example domain");
  const next = { ...existing, ...edits };
  put(
    "proposals",
    proposals().map((x) => (x.id === id ? next : x)),
  );
  return next;
}
export async function previewInvoice(proposal: Proposal) {
  const p = projects().find((x) => x.id === proposal.projectId)!;
  const ms = assertBillable(p, proposal.milestoneIds);
  const f = path.join(storageDir(), "previews", proposal.id + ".pdf");
  await invoicePdf(f, p, ms, proposal.reference);
  return f;
}
const approvalQueues = new Map<string, Promise<unknown>>();
export async function approve(id: string) {
  const proposal = proposals().find((p) => p.id === id);
  if (!proposal) throw Error("Proposal not found");
  const p = projects().find((p) => p.id === proposal.projectId);
  const key =
    (p?.folderId || proposal.projectId) + "/" + proposal.milestoneIds.join("-");
  const prior = approvalQueues.get(key) || Promise.resolve();
  const run = prior.catch(() => {}).then(() => approveUnlocked(id));
  approvalQueues.set(key, run);
  try {
    return await run;
  } finally {
    if (approvalQueues.get(key) === run) approvalQueues.delete(key);
  }
}
async function approveUnlocked(id: string) {
  let proposal = proposals().find((x) => x.id === id);
  if (!proposal) throw Error("Proposal not found");
  if (proposal.status === "prepared") return proposal;
  const p = projects().find((x) => x.id === proposal!.projectId)!;
  // Shared receipts coordinate employees saving the same Box project/milestones.
  const receiptPath =
    currentEmployee() && p.folderId
      ? path.resolve(
          process.env.EMPLOYEE_DATA_DIR || "data/employees",
          "_receipts",
          createHash("sha256")
            .update(
              p.folderId +
                "/" +
                proposal.type +
                "/" +
                [...proposal.milestoneIds].sort().join("-"),
            )
            .digest("hex") + ".json",
        )
      : undefined;
  if (receiptPath && fs.existsSync(receiptPath)) {
    const receipt: { proposal: Proposal; docs: Doc[] } = JSON.parse(
      fs.readFileSync(receiptPath, "utf8"),
    );
    const destinations = [...new Set(receipt.docs.map((d) => d.folderId!))];
    const visible = new Set<string>();
    for (const folder of destinations)
      for (const item of await remote.list(folder))
        visible.add(String(item.id));
    if (!receipt.docs.every((d) => d.boxId && visible.has(d.boxId)))
      throw Error(
        "Previously saved package is unavailable. Refresh and review it before retrying.",
      );
    for (const d of receipt.docs) addDoc(d);
    put("allowedFiles", [
      ...new Set([
        ...get<string[]>("allowedFiles", []),
        ...receipt.docs.map((d) => d.boxId!),
      ]),
    ]);
    const prepared = { ...receipt.proposal, id: proposal.id, projectId: p.id };
    put(
      "proposals",
      proposals().map((x) => (x.id === id ? prepared : x)),
    );
    return prepared;
  }
  const saved: Doc[] = [];
  // Each remote artifact has a deterministic name and a persisted per-file checkpoint.
  const save = async (name: string, bytes: Buffer, folder = "04 Billing") => {
    const key = "saved:" + id + ":" + name;
    let d = get<Doc | null>(key, null);
    if (!d) {
      d = await persistFile(bytes, name, p.id, folder);
      d = { ...d, generated: true };
      put(key, d);
    }
    addDoc(d);
    saved.push(d);
    return d;
  };
  if (proposal.type === "billing") {
    assertBillable(p, proposal.milestoneIds);
    if (
      !proposal.attachments.some(
        (id) =>
          documents().find((d) => d.id === id)?.category ===
          "Delivery evidence",
      )
    )
      throw Error("Include the completion report in the billing email.");
    for (const mid of proposal.milestoneIds) {
      const m = p.milestones.find((x) => x.id === mid)!;
      if (
        m.acceptanceRequired &&
        (!m.acceptanceFileId ||
          !documents().some((d) => d.id === m.acceptanceFileId && d.valid))
      )
        throw Error(
          "Verified acceptance evidence must be linked before approval.",
        );
      if (
        m.acceptanceRequired &&
        m.acceptanceFileId &&
        !proposal.attachments.includes(m.acceptanceFileId)
      )
        throw Error("Include the verified acceptance in the billing email.");
    }
    const f = await previewInvoice(proposal);
    const invoice = await save(proposal.reference + ".pdf", fs.readFileSync(f));
    const packetPath = path.join(
      storageDir(),
      "previews",
      proposal.id + "-packet.pdf",
    );
    await makePdf(
      packetPath,
      "Billing packet",
      `${p.id}  |  ${proposal.reference}  |  ${DEMO_DATE}`,
      [
        {
          title: "Package status",
          text: "PREPARED FOR BILLING. Draft invoice not issued. Email not sent.",
        },
        {
          title: "Invoice",
          text: `${proposal.reference} - ${money(proposal.milestoneIds.reduce((s, id) => s + p.milestones.find((m) => m.id === id)!.cents, 0))}`,
        },
        {
          title: "Supporting evidence",
          text: proposal.attachments
            .map((id) => {
              const d = documents().find((d) => d.id === id)!;
              return `${d.name}\n${d.boxId ? "https://app.box.com/file/" + d.boxId : "/api/documents/" + d.id + "/content"}`;
            })
            .join("\n\n"),
        },
        {
          title: "Review record",
          text: `Approved by ${currentEmployee()?.employee.name || "workspace owner"} on ${DEMO_DATE}. Zero tax assumed. Net 30 from issue.`,
        },
      ],
    );
    const binder = await PDFBinder.create();
    for (const bytes of [
      fs.readFileSync(packetPath),
      fs.readFileSync(f),
      ...(await Promise.all(
        proposal.attachments.map(async (id) => {
          const d = documents().find((d) => d.id === id)!;
          return d.name.endsWith(".pdf") ? await previewBytes(d) : null;
        }),
      )),
    ]) {
      if (!bytes) continue;
      const source = await PDFBinder.load(bytes);
      for (const page of await binder.copyPages(
        source,
        source.getPageIndices(),
      ))
        binder.addPage(page);
    }
    const packet = await save(
      proposal.reference + "-packet.pdf",
      Buffer.from(await binder.save()),
    );
    const email = {
      to: proposal.to,
      subject: proposal.subject,
      body: proposal.body,
      attachments: [invoice.id, packet.id, ...proposal.attachments].map(
        (id) => {
          const d = documents().find((x) => x.id === id)!;
          return {
            id: d.id,
            name: d.name,
            boxFileId: d.boxId || null,
            url: d.boxId
              ? "https://app.box.com/file/" + d.boxId
              : "/api/documents/" + d.id + "/content",
          };
        },
      ),
      status: "DRAFT_NOT_SENT",
    };
    await save(
      proposal.reference + "-email.json",
      Buffer.from(JSON.stringify(email, null, 2)),
    );
    await save(
      proposal.reference + "-email.txt",
      Buffer.from(
        `DRAFT - NOT SENT\nTo: ${proposal.to}\nSubject: ${proposal.subject}\n\n${proposal.body}\n\nAttachments:\n${email.attachments.map((d) => d.name).join("\n")}`,
      ),
    );
  } else {
    const blocked = p.milestones.some(
      (m) =>
        proposal!.milestoneIds.includes(m.id) &&
        m.complete &&
        !m.issued &&
        m.acceptanceRequired &&
        !m.accepted,
    );
    if (!blocked)
      throw Error(
        "Acceptance already resolved. Follow-up is no longer needed.",
      );
    await save(
      `FOLLOWUP-${p.id}-${proposal.milestoneIds.join("-")}.json`,
      Buffer.from(
        JSON.stringify(
          {
            ...proposal,
            status: "APPROVED_INTERNAL_FOLLOWUP",
            emailStatus: "DRAFT_NOT_SENT",
          },
          null,
          2,
        ),
      ),
      "05 Follow-ups",
    );
  }
  proposal = {
    ...proposal,
    status: "prepared",
    savedIds: saved.map((d) => d.id),
  };
  put(
    "proposals",
    proposals().map((x) => (x.id === id ? proposal! : x)),
  );
  if (receiptPath) {
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      receiptPath + ".tmp",
      JSON.stringify({ proposal, docs: saved }),
      { mode: 0o600 },
    );
    fs.renameSync(receiptPath + ".tmp", receiptPath);
  }
  activity(
    proposal.type === "billing"
      ? "Billing package prepared. Draft saved; invoice not issued."
      : `Internal follow-up saved for ${proposal.owner}; due ${proposal.due}.`,
    p.id,
  );
  return proposal;
}
