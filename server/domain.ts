import { z } from "zod";
export const DEMO_DATE = process.env.DEMO_DATE || "2026-10-21";
export const dateOffset = (days: number) => {
  const d = new Date(DEMO_DATE + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export type Milestone = {
  id: string;
  name: string;
  cents: number;
  complete: boolean;
  acceptanceRequired: boolean;
  accepted: boolean;
  issued: boolean;
  paidCents: number;
  issuedDate?: string;
  acceptanceFileId?: string;
};
export type Project = {
  id: string;
  businessId?: string;
  folderId?: string;
  client: string;
  name: string;
  shortName: string;
  contact: string;
  email: string;
  owner: string;
  color: string;
  progress: number;
  milestones: Milestone[];
};
export const SAMPLE_PROJECT_OWNER = "Alex Chan";
// Migrate the previous sample assignments without changing owners of custom projects.
export function projectOwner(id: string, owner: string) {
  return /^CW-10[1-5](?:~\d+)?$/.test(id) &&
    ["Alex Chen", "Sam Rivera"].includes(owner)
    ? SAMPLE_PROJECT_OWNER
    : owner;
}
const m = (
  id: string,
  name: string,
  dollars: number,
  complete: boolean,
  issued = false,
  paid = 0,
  acceptanceRequired = false,
  accepted = false,
): Milestone => ({
  id,
  name,
  cents: dollars * 100,
  complete,
  issued,
  paidCents: paid * 100,
  acceptanceRequired,
  accepted,
  ...(issued ? { issuedDate: dateOffset(-9) } : {}),
});
export function seedProjects(): Project[] {
  return [
    {
      id: "CW-101",
      client: "Alder & Finch",
      name: "Alder & Finch · Office AV",
      shortName: "Alder & Finch",
      contact: "Morgan Ellis",
      email: "morgan.ellis@alderfinch.example",
      owner: SAMPLE_PROJECT_OWNER,
      color: "#bd7955",
      progress: 100,
      milestones: [
        m("M1", "Design & procurement", 18000, true, true, 18000),
        m("M2", "Installation & commissioning", 36000, true, true, 36000),
        m("M3", "Final acceptance & handover", 18000, true, false, 0, true),
      ],
    },
    {
      id: "CW-102",
      client: "The Marlow Hotel",
      name: "Marlow · Conference Rooms",
      shortName: "Marlow Hotel",
      contact: "Jamie Park",
      email: "jamie.park@marlow.example",
      owner: SAMPLE_PROJECT_OWNER,
      color: "#638887",
      progress: 100,
      milestones: [
        m("M1", "Design & equipment", 20000, true, true, 20000),
        m("M2", "Room installation", 20000, true, true, 20000),
        m("M3", "Training & handover", 24000, true, false, 0, true, true),
      ],
    },
    {
      id: "CW-103",
      client: "Westbridge University",
      name: "Westbridge · Lecture Hall",
      shortName: "Westbridge University",
      contact: "Taylor Reed",
      email: "taylor.reed@westbridge.example",
      owner: SAMPLE_PROJECT_OWNER,
      color: "#7c82a1",
      progress: 100,
      milestones: [
        m("M1", "System design", 24000, true, true, 24000),
        m("M2", "Equipment & installation", 48000, true, true, 48000),
        m("M3", "Testing & handover", 24000, true, true, 12000, true, true),
      ],
    },
    {
      id: "CW-104",
      client: "Fieldstone Studio",
      name: "Fieldstone · Collaboration Suite",
      shortName: "Fieldstone Studio",
      contact: "Jordan Lane",
      email: "jordan.lane@fieldstone.example",
      owner: SAMPLE_PROJECT_OWNER,
      color: "#969368",
      progress: 40,
      milestones: [
        m("M1", "Design approval", 12000, true, true, 12000),
        m("M2", "Equipment & installation", 24000, false),
        m("M3", "Commissioning", 12000, false, false, 0, true),
      ],
    },
    {
      id: "CW-105",
      client: "Northstar Health",
      name: "Northstar · Training Center",
      shortName: "Northstar Health",
      contact: "Casey Brooks",
      email: "casey.brooks@northstar.example",
      owner: SAMPLE_PROJECT_OWNER,
      color: "#87739b",
      progress: 100,
      milestones: [
        m("M1", "Design & procurement", 16000, true, true, 16000),
        m("M2", "Installation", 24000, true, true, 24000),
        m("M3", "Final acceptance & training", 16000, true, false, 0, true),
      ],
    },
  ];
}
export function billing(p: Project) {
  return p.milestones.reduce(
    (t, m) => {
      t.value += m.cents;
      if (m.issued) {
        t.invoiced += m.cents;
        t.outstanding += m.cents - m.paidCents;
        if (m.issuedDate?.slice(0, 7) === DEMO_DATE.slice(0, 7))
          t.thisMonth += m.cents;
      } else if (!m.complete) t.future += m.cents;
      else if (m.acceptanceRequired && !m.accepted) t.blocked += m.cents;
      else t.ready += m.cents;
      return t;
    },
    {
      value: 0,
      invoiced: 0,
      outstanding: 0,
      thisMonth: 0,
      future: 0,
      blocked: 0,
      ready: 0,
    },
  );
}
export const totals = (ps: Project[]) =>
  ps
    .map(billing)
    .reduce(
      (a, b) =>
        Object.fromEntries(
          Object.keys(a).map((k) => [
            k,
            a[k as keyof typeof a] + b[k as keyof typeof b],
          ]),
        ) as ReturnType<typeof billing>,
      {
        value: 0,
        invoiced: 0,
        outstanding: 0,
        thisMonth: 0,
        future: 0,
        blocked: 0,
        ready: 0,
      },
    );
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
export const acceptanceSchema = z
  .object({
    projectId: z.string(),
    client: z.string(),
    milestoneId: z.string(),
    signed: z.boolean(),
    accepted: z.boolean(),
    signer: z.string(),
    date: z.string(),
    quote: z.string(),
  })
  .strict();
export type Acceptance = z.infer<typeof acceptanceSchema>;
/**
 * Treat AI extraction as evidence, not approval: match client/project/milestone,
 * completed delivery, signed affirmative acceptance, and a date no later than DEMO_DATE.
 * Return a readable blocker, or null when the extracted facts pass these checks.
 */
export function validateAcceptance(a: Acceptance, p: Project, m: Milestone) {
  if (!m.complete)
    return "Delivery is not recorded complete for this milestone. Acceptance requires review.";
  const result = acceptanceSchema.safeParse(a);
  if (!result.success)
    return "Document could not be understood. Manual review required.";
  if (
    a.projectId !== (p.businessId || p.id) ||
    a.client.toLowerCase() !== p.client.toLowerCase() ||
    a.milestoneId !== m.id
  )
    return "This acceptance belongs to a different client, project, or milestone.";
  if (!a.signed || !a.accepted || !a.signer || !a.quote)
    return "Signed, affirmative customer acceptance is not supported by this document.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date) || a.date > DEMO_DATE)
    return "Acceptance date is missing or later than the demo date.";
  return null;
}
export function assertBillable(p: Project, ids: string[]) {
  if (!ids.length || new Set(ids).size !== ids.length)
    throw Error("Select unique milestones.");
  return ids.map((id) => {
    const m = p.milestones.find((x) => x.id === id);
    if (!m || m.issued || !m.complete || (m.acceptanceRequired && !m.accepted))
      throw Error("Milestone is not ready to bill.");
    return m;
  });
}
