import { ToolActivity } from "./ToolActivity";
import {
  streamRequest,
  workspaceSignal,
  abortWorkspaceRequests,
} from "./stream-request";
import {
  isCustomerDocument,
  documentLabel,
} from "../shared/customer-documents";
import type { Trace } from "../server/tracing.ts";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  FolderKanban,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  Bell,
  Settings2,
  MoreHorizontal,
  Check,
  CheckCheck,
  AlertCircle,
  Clock,
  FileText,
  Paperclip,
  Send,
  Sparkles,
  RefreshCw,
  Upload,
  Download,
  ExternalLink,
  X,
  PanelRightClose,
  PanelRightOpen,
  Menu,
  Building2,
  Mail,
  ShieldCheck,
  LoaderCircle,
  Receipt,
  CheckCircle2,
  Activity,
  SlidersHorizontal,
  ArrowLeft,
} from "lucide-react";
import "./style.css";
const PdfPreview = React.lazy(() =>
  import("./PdfPreview").then((module) => ({ default: module.PdfPreview })),
);
type Milestone = {
  id: string;
  name: string;
  cents: number;
  complete: boolean;
  acceptanceRequired: boolean;
  accepted: boolean;
  issued: boolean;
  paidCents: number;
  acceptanceFileId?: string;
};
type B = {
  value: number;
  invoiced: number;
  ready: number;
  blocked: number;
  outstanding: number;
  future: number;
  thisMonth: number;
};
type Project = {
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
  billing: B;
};
type Doc = {
  id: string;
  name: string;
  projectId?: string;
  category: string;
  boxId?: string;
  generated?: boolean;
  valid?: boolean;
  analysis?: string;
};
type Proposal = {
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
  resolved?: boolean;
  reference: string;
};
type Message = {
  id: string;
  role: string;
  text: string;
  sources: string[];
  proposalId?: string;
  tools?: Trace[];
};
type State = {
  mode: string;
  discovery?: { status: string; warnings: string[] };
  demoDate: string;
  projects: Project[];
  totals: B;
  documents: Doc[];
  proposals: Proposal[];
  activity: { id: string; text: string; projectId?: string; date: string }[];
  folders: Record<string, string>;
  connection: { box: boolean; root: boolean; model: boolean; provider: string };
  trace: { tool: string; detail: string; mode: string }[];
};
const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n / 100);
const date = (s: string) =>
  new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
async function api(path: string, options?: RequestInit) {
  const r = await fetch("/api" + path, {
    ...options,
    signal: workspaceSignal(),
  });
  if (!r.ok) {
    const x = await r.json().catch(() => ({ error: r.statusText }));
    throw Error(x.error);
  }
  return r.json();
}
const json = (data: unknown) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});
type Identity = { id: string; name: string; email: string };
type Workspace = { id: string; name: string };
function App({
  employee,
  workspace,
  changeWorkspace,
}: {
  employee?: Identity;
  workspace?: Workspace;
  changeWorkspace: () => void;
}) {
  const [state, setState] = useState<State>();
  const [view, setView] = useState(location.hash.slice(1) || "overview");
  const [conversation, setConversation] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const [error, setError] = useState("");
  const [agentOpen, setAgentOpen] = useState(window.innerWidth > 1050);
  const [navOpen, setNavOpen] = useState(false);
  const [presenter, setPresenter] = useState(false);
  const [preview, setPreview] = useState<{ title: string; url: string }>();
  const [reviewId, setReviewId] = useState<string>();
  const [uploadState, setUploadState] = useState("");
  const [proofRun, setProofRun] = useState<{
    projectId: string;
    tools: Trace[];
    message?: string;
    valid?: boolean;
    failed?: boolean;
    reused?: boolean;
    beforeReady?: number;
    beforeBlocked?: number;
  }>();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("milestones");
  const [liveTools, setLiveTools] = useState<Trace[]>([]);
  const activeContext = useRef("");
  const fileRef = useRef<HTMLInputElement>(null);
  const proofPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (uploadState)
      proofPanel.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  }, [Boolean(uploadState)]);
  const chatEnd = useRef<HTMLDivElement>(null);
  const followActivity = useRef(true);
  const liveToolsRef = useRef<Trace[]>([]);
  const context = view === "projects" ? "overview" : view;
  const project = state?.projects.find((p) => p.id === view);
  activeContext.current = context;
  async function load() {
    try {
      const next = await api(
        project
          ? `/state?projectId=${encodeURIComponent(project.id)}`
          : "/state",
      );
      setState(next);
      const selected = location.hash.slice(1);
      if (
        selected &&
        selected !== "overview" &&
        selected !== "projects" &&
        !next.projects.some((p: Project) => p.id === selected)
      )
        navigate("overview");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const listener = () => setView(location.hash.slice(1) || "overview");
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    let active = true;
    setConversation([]);
    setLiveTools([]);
    api("/chat/" + context)
      .then((messages) => {
        if (active) setConversation(messages);
      })
      .catch((e) => {
        if (active) setNotice({ text: e.message, error: true });
      });
    setTab("milestones");
    return () => {
      active = false;
    };
  }, [context]);
  useEffect(() => {
    if (conversation.length || busy)
      chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [conversation, busy]);
  useEffect(() => {
    if (busy && followActivity.current)
      chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [liveTools.length, busy]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(undefined), 6500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  function navigate(v: string) {
    location.hash = v;
    setView(v);
    setNavOpen(false);
  }
  function openDoc(id: string) {
    const d = state?.documents.find((x) => x.id === id);
    if (d)
      setPreview({ title: d.name, url: "/api/documents/" + id + "/content" });
  }
  async function ask(text: string) {
    if (busy || !text.trim()) return;
    setAgentOpen(true);
    setBusy(true);
    setLiveTools([]);
    liveToolsRef.current = [];
    followActivity.current = true;
    setQuestion("");
    setConversation((c) => [
      ...c,
      { id: crypto.randomUUID(), role: "user", text, sources: [] },
    ]);
    try {
      const reply = await streamRequest<Message>(
        "/api/chat/" + context + "/stream",
        { method: "POST", ...json({ text }) },
        (payload) => {
          if (activeContext.current !== context) return;
          liveToolsRef.current = [
            ...liveToolsRef.current.filter((t) => t.seq !== payload.seq),
            payload,
          ].sort((a, b) => a.seq - b.seq);
          setLiveTools(liveToolsRef.current);
        },
      );
      if (activeContext.current === context)
        setConversation((c) => [...c, reply]);
      await load();
    } catch (e) {
      setNotice({ text: (e as Error).message, error: true });
      if (activeContext.current === context) {
        setConversation((c) => [
          ...c,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: "The request did not finish. " + (e as Error).message,
            sources: [],
            tools: liveToolsRef.current,
          },
        ]);
        setQuestion(text);
      }
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setRefreshing(true);
    try {
      await api("/refresh", {
        method: "POST",
        ...json({ projectId: project?.id }),
      });
      await load();
      setNotice({
        text: "Project evidence refreshed and acceptance reassessed.",
      });
    } catch (e) {
      setNotice({ text: (e as Error).message, error: true });
    } finally {
      setRefreshing(false);
    }
  }
  async function upload(file: File) {
    if (!project) return;
    const pid = project.id;
    setUploadState("Connecting to Box…");
    setProofRun({
      projectId: pid,
      tools: [],
      beforeReady: project.billing.ready,
      beforeBlocked: project.billing.blocked,
    });
    const form = new FormData();
    form.append("file", file);
    try {
      const result = await streamRequest<{ valid: boolean; message: string }>(
        "/api/projects/" + pid + "/acceptance/stream",
        { method: "POST", body: form },
        (entry) => {
          setProofRun((run) =>
            run?.projectId === pid
              ? {
                  ...run,
                  tools: [
                    ...run.tools.filter((t) => t.seq !== entry.seq),
                    entry,
                  ].sort((a, b) => a.seq - b.seq),
                }
              : run,
          );
          if (entry.status === "running")
            setUploadState(
              entry.tool === "binary_upload"
                ? "Transferring PDF to Box…"
                : entry.tool === "ai_extract_freeform"
                  ? "Box AI is reading the acceptance…"
                  : entry.tool === "list_folder_content_by_folder_id"
                    ? "Checking the file in Box…"
                    : "Requesting Box evidence…",
            );
        },
      );
      setUploadState("Validating evidence and updating billing…");
      const updated = await api(`/state?projectId=${encodeURIComponent(pid)}`);
      setState(updated);
      setProofRun((run) =>
        run
          ? {
              ...run,
              message: result.message,
              valid: result.valid,
              reused: run.tools.length === 0 && result.valid,
            }
          : run,
      );
      setNotice({ text: result.message, error: !result.valid });
    } catch (e) {
      setProofRun((run) =>
        run ? { ...run, message: (e as Error).message, failed: true } : run,
      );
      setNotice({ text: (e as Error).message, error: true });
    } finally {
      setUploadState("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  useEffect(() => {
    if (!preview && !reviewId && !presenter) return;
    const selector = preview
      ? ".preview-modal"
      : reviewId
        ? ".review-modal"
        : ".presenter-modal";
    const dialog = document.querySelector(selector);
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),iframe",
        ) || [],
      ).filter((el) => el.offsetParent !== null);
    focusable()[0]?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (preview) setPreview(undefined);
        else if (reviewId) setReviewId(undefined);
        else setPresenter(false);
      }
      if (e.key === "Tab") {
        const els = focusable();
        if (!els.length) return;
        const first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [preview, reviewId, presenter]);
  if (!state)
    return (
      <div className="loading">
        <Building2 size={32} />
        <h2>Loading your billing workspace.</h2>
        {!error && (
          <p>Reading your Box workspace and checking project evidence…</p>
        )}
        {error ? (
          <>
            <p>{error}</p>
            <button className="button secondary" onClick={load}>
              Try again
            </button>
            {employee && (
              <button className="button secondary" onClick={changeWorkspace}>
                Change workspace folder
              </button>
            )}
            {employee && (
              <button
                className="button secondary"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            )}
          </>
        ) : (
          <LoaderCircle className="spin" />
        )}
      </div>
    );
  const t = project?.billing || state.totals;
  const savedBilling = state.proposals.find(
    (p) =>
      p.projectId === project?.id &&
      p.type === "billing" &&
      p.status === "prepared",
  );
  const prompts = project
    ? project.billing.blocked
      ? [
          "What is preventing us from billing?",
          "Find the missing acceptance document.",
          "Draft a customer follow-up.",
          "Show the evidence for this milestone.",
        ]
      : [
          "Prepare the draft invoice.",
          "Assemble the billing packet.",
          "Draft the billing email with attachments.",
          "What still needs my review?",
        ]
    : [
        "What should I focus on today?",
        "Which completed work has not been invoiced?",
        "What could unblock the most billing?",
        "Show projects needing follow-up.",
      ];
  const attentionReady = state.projects.filter(
    (p) =>
      p.billing.ready > 0 &&
      !state.proposals.some(
        (d) =>
          d.projectId === p.id &&
          d.type === "billing" &&
          d.status === "prepared",
      ),
  );
  const pending = state.proposals.filter(
    (p) => p.status === "review" && (!project || p.projectId === project.id),
  );
  return (
    <div className={"app " + (!agentOpen ? "agent-hidden" : "")}>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <aside className={"sidebar " + (navOpen ? "mobile-open" : "")}>
        <a
          className="brand"
          href="#overview"
          onClick={() => navigate("overview")}
        >
          <strong>Clearwave AV</strong>
        </a>
        <div className="workspace">
          <div className="company-icon">
            <Activity size={18} />
          </div>
          <div>
            <b>BillReady</b>
            <span>Internal billing workspace</span>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <button
          className={"nav-item " + (view === "overview" ? "active" : "")}
          onClick={() => navigate("overview")}
        >
          <LayoutDashboard size={18} />
          Overview
        </button>
        <button
          className={"nav-item " + (view === "projects" ? "active" : "")}
          onClick={() => navigate("projects")}
        >
          <FolderKanban size={18} />
          Workspace projects
          <span className="nav-count">{state.projects.length}</span>
        </button>
        <div className="nav-label project-label">
          WORKSPACE PROJECTS <span>{state.projects.length}</span>
        </div>
        {state.projects.map((p) => (
          <button
            key={p.id}
            className={
              "nav-item project-nav " + (view === p.id ? "active" : "")
            }
            onClick={() => navigate(p.id)}
          >
            <i style={{ background: p.color }} />
            {p.shortName}
            {p.billing.blocked > 0 && <span className="amber-dot" />}
          </button>
        ))}
        <div className="sidebar-bottom">
          <div className="quiet-card">
            <ShieldCheck size={20} />
            <b>{employee ? "Connected to Box" : "Local development"}</b>
            <span>{workspace?.name || "Sample project workspace"}</span>
            {employee && (
              <button onClick={changeWorkspace}>Change workspace folder</button>
            )}
          </div>
          <button
            className="presenter-toggle"
            onClick={() => setPresenter(!presenter)}
          >
            <Settings2 size={15} />
            Connection & diagnostics
            <ChevronRight size={14} />
          </button>
          <div className="profile">
            <div className="avatar">
              {(employee?.name || "Avery Quinn")
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div>
              <b>{employee?.name || "Avery Quinn"}</b>
              <span title={employee?.email}>
                {employee?.email || "Operations · Development"}
              </span>
            </div>
            <span className="online-dot" />
          </div>
          {employee && (
            <div className="account-actions">
              <button onClick={() => void signOut()}>Sign out</button>
              <a
                href="/auth/box/start"
                onClick={() => abortWorkspaceRequests()}
              >
                Switch account
              </a>
            </div>
          )}
        </div>
      </aside>
      <main>
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={14} />
            <b>
              {project
                ? project.shortName
                : view === "projects"
                  ? "Workspace projects"
                  : "Overview"}
            </b>
          </div>
          <div className="top-actions">
            <span
              className={"mode-pill " + (state.mode === "live" ? "live" : "")}
            >
              <i />
              {state.mode === "live" ? "Connected to Box" : "Local development"}
            </span>
            <span className="date-label">
              {new Date(state.demoDate + "T12:00:00").toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", year: "numeric" },
              )}
            </span>
            <button
              className="icon-btn"
              aria-label="Show recent activity"
              onClick={() =>
                document
                  .getElementById("recent-activity")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              <Bell size={18} />
            </button>
            <button
              className="icon-btn agent-toggle"
              aria-label="Toggle agent panel"
              onClick={() => setAgentOpen(!agentOpen)}
            >
              {agentOpen ? (
                <PanelRightClose size={19} />
              ) : (
                <PanelRightOpen size={19} />
              )}
            </button>
          </div>
        </header>
        <div className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {project
                  ? `${project.businessId || project.id} / PROJECT DASHBOARD`
                  : "CLEARWAVE AV / OPERATIONS"}
              </div>
              <h1>
                {project
                  ? project.shortName
                  : view === "projects"
                    ? "Workspace projects"
                    : "Billing workspace"}
                {!project && view !== "projects" && (
                  <span className="greeting-dot">.</span>
                )}
              </h1>
              <p>
                {project
                  ? (project.name.split(" · ")[1] || project.name) +
                    " · " +
                    project.owner
                  : "Track completed work, resolve missing evidence, and prepare billing packages from Clearwave AV’s Box documents."}
              </p>
            </div>
            <button
              className="button secondary refresh"
              onClick={refresh}
              disabled={refreshing}
            >
              <RefreshCw size={15} className={refreshing ? "spin" : ""} />
              {refreshing ? "Checking evidence…" : "Refresh evidence"}
            </button>
          </div>
          {state.discovery?.warnings?.length ? (
            <div className="workspace-warning" role="status">
              {state.discovery.warnings.map((warning, i) => (
                <p key={i}>{warning}</p>
              ))}
            </div>
          ) : null}
          {!state.projects.length && (
            <section className="empty-workspace">
              <FolderKanban size={28} />
              <h2>No supported projects in this folder</h2>
              <p>
                Choose a folder containing project.json records and the standard
                project subfolders.
              </p>
              {employee && (
                <button className="button primary" onClick={changeWorkspace}>
                  Choose another folder
                </button>
              )}
            </section>
          )}
          {project?.folderId && (
            <a
              className="box-project-link"
              href={"https://app.box.com/folder/" + project.folderId}
              target="_blank"
              rel="noreferrer"
            >
              Open project in Box <ExternalLink size={14} />
            </a>
          )}
          {project && (
            <div
              className={
                "project-banner " + (t.blocked ? "warning" : "success")
              }
            >
              <div className="banner-symbol">
                {t.blocked ? (
                  <AlertCircle size={22} />
                ) : (
                  <CheckCircle2 size={22} />
                )}
              </div>
              <div>
                <b>
                  {t.blocked
                    ? `${money(t.blocked)} is waiting on customer acceptance`
                    : t.ready
                      ? savedBilling
                        ? "Your billing package is saved"
                        : `${money(t.ready)} is ready for your review`
                      : "Delivery and billing are on track"}
                </b>
                <p>
                  {t.blocked
                    ? "The work is complete. Add signed acceptance to unlock the final milestone."
                    : t.ready
                      ? savedBilling
                        ? "Open the saved package below to download your documents and prepare the client email."
                        : "The evidence is in place. Prepare the draft invoice and billing packet."
                      : t.outstanding
                        ? `${money(t.outstanding)} remains unpaid on issued invoices.`
                        : "Follow delivery progress below."}
                </p>
              </div>
              {t.blocked ? (
                <button
                  className="button dark"
                  disabled={!!uploadState}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={15} />
                  {uploadState || "Upload acceptance"}
                </button>
              ) : t.ready && !savedBilling ? (
                <button
                  className="button dark"
                  disabled={busy}
                  onClick={() => ask("Prepare the draft invoice.")}
                >
                  Prepare billing
                  <ArrowRight size={15} />
                </button>
              ) : null}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            aria-label="Upload signed acceptance PDF"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          <div className="metrics">
            {(project
              ? [
                  {
                    label: "Project value",
                    amount: t.value,
                    note: "Contracted scope",
                    icon: Building2,
                    tone: "neutral",
                  },
                  {
                    label: "Ready to bill",
                    amount: t.ready,
                    note: "Complete · evidence verified",
                    icon: CheckCheck,
                    tone: "green",
                  },
                  {
                    label: "Blocked billing",
                    amount: t.blocked,
                    note: "Complete · needs acceptance",
                    icon: Clock,
                    tone: "amber",
                  },
                  {
                    label: "Invoiced",
                    amount: t.invoiced,
                    note: money(t.outstanding) + " outstanding",
                    icon: Receipt,
                    tone: "neutral",
                  },
                ]
              : [
                  {
                    label: "Ready to bill",
                    amount: t.ready,
                    note: "Evidence is in place",
                    icon: CheckCheck,
                    tone: "green",
                  },
                  {
                    label: "Blocked billing",
                    amount: t.blocked,
                    note: "Completed work, awaiting evidence",
                    icon: Clock,
                    tone: "amber",
                  },
                  {
                    label: "Invoiced this month",
                    amount: t.thisMonth,
                    note:
                      "Issued invoices · " +
                      new Date(state.demoDate + "T12:00:00").toLocaleDateString(
                        "en-US",
                        { month: "long" },
                      ),
                    icon: Receipt,
                    tone: "neutral",
                  },
                  {
                    label: "Outstanding balances",
                    amount: t.outstanding,
                    note: "Issued, not yet paid",
                    icon: ArrowUpRight,
                    tone: "neutral",
                  },
                ]
            ).map((m) => (
              <div className={"metric " + m.tone} key={m.label}>
                <div className="metric-top">
                  <span>{m.label}</span>
                  <m.icon size={17} />
                </div>
                <strong>{money(m.amount)}</strong>
                <div className="metric-note">
                  <i />
                  {m.note}
                </div>
              </div>
            ))}
          </div>
          {!project && view === "overview" && (
            <div className="overview-grid">
              <section className="card attention">
                <div className="section-head">
                  <h2>
                    <span className="attention-dot" />
                    Needs your attention{" "}
                    <span className="count">
                      {state.projects.filter((p) => p.billing.blocked > 0)
                        .length + Math.min(1, attentionReady.length)}
                    </span>
                  </h2>
                  <span className="subtle">Prioritized by impact</span>
                </div>
                {state.projects
                  .filter((p) => p.billing.blocked > 0)
                  .sort((a, b) => b.billing.blocked - a.billing.blocked)
                  .map((p, i) => (
                    <button
                      className="attention-row"
                      key={p.id}
                      onClick={() => navigate(p.id)}
                    >
                      <div
                        className={
                          "finding-icon " + (i === 0 ? "amber" : "purple")
                        }
                      >
                        {i === 0 ? (
                          <FileText size={18} />
                        ) : (
                          <Search size={18} />
                        )}
                      </div>
                      <div className="finding-text">
                        <b>
                          {i === 0
                            ? "One signature away from billing"
                            : "Acceptance evidence needs a closer look"}
                        </b>
                        <span>
                          {p.client} ·{" "}
                          {i === 0
                            ? "Final acceptance missing"
                            : "Completed work awaiting evidence review"}
                        </span>
                      </div>
                      <div className="finding-amount">
                        <b>{money(p.billing.blocked)}</b>
                        <span>
                          Review project <ArrowRight size={12} />
                        </span>
                      </div>
                    </button>
                  ))}
                {attentionReady.slice(0, 1).map((p) => (
                  <button
                    className="attention-row"
                    key={p.id}
                    onClick={() => navigate(p.id)}
                  >
                    <div className="finding-icon green">
                      <CheckCheck size={18} />
                    </div>
                    <div className="finding-text">
                      <b>A billing package is ready to prepare</b>
                      <span>{p.client} · Delivery and acceptance verified</span>
                    </div>
                    <div className="finding-amount">
                      <b>{money(p.billing.ready)}</b>
                      <span>
                        Prepare draft <ArrowRight size={12} />
                      </span>
                    </div>
                  </button>
                ))}
                <div className="attention-footer">
                  <Sparkles size={14} />
                  BillReady checks the evidence. You make the call.
                </div>
              </section>
              <section className="card breakdown">
                <div className="section-head">
                  <h2>Billing at a glance</h2>
                  <span className="subtle">Unissued work</span>
                </div>
                <div
                  className="donut"
                  style={{
                    background: `conic-gradient(#0061d5 0 ${(t.ready / Math.max(1, t.ready + t.blocked + t.future)) * 100}%, #d3a45f ${(t.ready / Math.max(1, t.ready + t.blocked + t.future)) * 100}% ${((t.ready + t.blocked) / Math.max(1, t.ready + t.blocked + t.future)) * 100}%, #e2e8f0 0)`,
                  }}
                >
                  <div>
                    <span>Unissued scope</span>
                    <b>{money(t.ready + t.blocked + t.future)}</b>
                    <small>
                      across {state.projects.length}{" "}
                      {state.projects.length === 1 ? "project" : "projects"}
                    </small>
                  </div>
                </div>
                <div className="legend">
                  {[
                    ["Ready to bill", t.ready, "#0061d5"],
                    ["Blocked", t.blocked, "#d3a45f"],
                    ["Future work", t.future, "#e2e8f0"],
                  ].map(([l, v, c]) => (
                    <div key={l}>
                      <span>
                        <i style={{ background: String(c) }} />
                        {l}
                      </span>
                      <b>{money(Number(v))}</b>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
          {!project ? (
            <section className="card portfolio">
              <div className="section-head">
                <h2>
                  Project portfolio{" "}
                  <span className="count">{state.projects.length}</span>
                </h2>
                <div className="table-actions">
                  {view === "projects" ? (
                    <label className="table-search">
                      <Search size={14} />
                      <input
                        placeholder="Find a project…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                  ) : (
                    <button
                      className="text-button"
                      onClick={() => navigate("projects")}
                    >
                      View all projects <ArrowRight size={13} />
                    </button>
                  )}
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>PROJECT / CLIENT</th>
                      <th>PROJECT VALUE</th>
                      <th>PROGRESS</th>
                      <th>NEXT MILESTONE</th>
                      <th>BILLING STATUS</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {state.projects
                      .filter(
                        (p) =>
                          view !== "projects" ||
                          (p.client + " " + p.name)
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                      )
                      .map((p) => (
                        <tr
                          key={p.id}
                          onClick={() => navigate(p.id)}
                          tabIndex={0}
                          onKeyDown={(e) => e.key === "Enter" && navigate(p.id)}
                        >
                          <td>
                            <div className="project-cell">
                              <div
                                className="project-monogram"
                                style={{
                                  background: p.color + "19",
                                  color: p.color,
                                }}
                              >
                                {p.client
                                  .split(" ")
                                  .filter((s) => s !== "&")
                                  .slice(0, 2)
                                  .map((x) => x[0])
                                  .join("")}
                              </div>
                              <div>
                                <b>{p.shortName}</b>
                                <span>{p.name.split(" · ")[1]}</span>
                              </div>
                            </div>
                          </td>
                          <td className="numeric">{money(p.billing.value)}</td>
                          <td>
                            <div className="progress-label">
                              <span>{p.progress}%</span>
                              <div className="progress">
                                <i
                                  style={{
                                    width: p.progress + "%",
                                    background:
                                      p.progress === 100 ? "#62937b" : p.color,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="milestone-next">
                              {p.milestones.find((m) => !m.issued)?.name ||
                                "All milestones invoiced"}
                            </span>
                          </td>
                          <td>
                            <Status p={p} />
                          </td>
                          <td>
                            <ChevronRight size={15} />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {search &&
                !state.projects.some((p) =>
                  (p.client + " " + p.name)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                ) && <div className="empty">No projects match “{search}”.</div>}
              <div className="table-footer">
                <span>
                  {state.projects.length} active{" "}
                  {state.projects.length === 1 ? "project" : "projects"}
                </span>
                <span>
                  Total contracted <b>{money(state.totals.value)}</b>
                </span>
              </div>
            </section>
          ) : (
            <>
              {proofRun?.projectId === project.id && (
                <section
                  className="card proof-progress"
                  aria-label="Proof verification activity"
                  ref={proofPanel}
                >
                  <div className="proof-heading">
                    <div>
                      <span className="eyebrow">
                        EVIDENCE → BILLING READINESS
                      </span>
                      <h2>
                        {uploadState
                          ? "Verifying customer proof"
                          : proofRun.valid
                            ? "Acceptance verified · billing updated"
                            : proofRun.failed
                              ? "Verification interrupted"
                              : "Evidence needs review"}
                      </h2>
                    </div>
                    {!uploadState && (
                      <button
                        className="icon-btn"
                        aria-label="Dismiss proof activity"
                        onClick={() => setProofRun(undefined)}
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>
                  <p>
                    {state.mode === "live"
                      ? "Box MCP retrieves the evidence. BillReady validates the match and calculates billing readiness."
                      : "Development rehearsal: evidence is checked locally; no Box MCP calls are made."}
                  </p>
                  {proofRun.reused ? (
                    <p>
                      Existing verified acceptance reused. No duplicate upload
                      or new MCP calls were needed.
                    </p>
                  ) : state.mode === "development" ? (
                    <p>
                      Local rehearsal: BillReady checks the acceptance and
                      recalculates billing without calling Box.
                    </p>
                  ) : (
                    <ol className="proof-steps">
                      {[
                        {
                          label:
                            proofRun.valid &&
                            !proofRun.tools.some(
                              (t) => t.tool === "binary_upload",
                            )
                              ? "Use existing Box proof"
                              : "Save proof in Box",
                          done:
                            proofRun.valid === true ||
                            proofRun.tools.some(
                              (t) =>
                                t.tool === "binary_upload" &&
                                t.status === "completed",
                            ),
                        },
                        {
                          label: "Confirm Box file",
                          done: proofRun.tools.some(
                            (t) =>
                              t.tool === "list_folder_content_by_folder_id" &&
                              t.status === "completed" &&
                              t.seq >
                                (proofRun.tools.find(
                                  (t) => t.tool === "binary_upload",
                                )?.seq ?? (proofRun.valid ? -1 : Infinity)),
                          ),
                        },
                        {
                          label: "Box AI reads acceptance",
                          done: proofRun.tools.some(
                            (t) =>
                              t.tool === "ai_extract_freeform" &&
                              t.status === "completed",
                          ),
                        },
                        {
                          label: "BillReady validates & updates UI",
                          done: proofRun.valid === true,
                        },
                      ].map((step, i) => (
                        <li
                          key={step.label}
                          className={step.done ? "complete" : ""}
                        >
                          <span>{step.done ? <Check size={14} /> : i + 1}</span>
                          {step.label}
                        </li>
                      ))}
                    </ol>
                  )}
                  <div className="proof-outcome" role="status">
                    {uploadState || proofRun.message}
                    {proofRun.valid === false &&
                      !proofRun.failed &&
                      " Billing stays blocked until matching evidence is verified."}
                  </div>
                  {proofRun.valid && !proofRun.reused && (
                    <div className="proof-delta">
                      <span>
                        Ready to bill
                        <b>
                          {money(proofRun.beforeReady ?? 0)} →{" "}
                          {money(project.billing.ready)}
                        </b>
                      </span>
                      <span>
                        Blocked billing
                        <b>
                          {money(proofRun.beforeBlocked ?? 0)} →{" "}
                          {money(project.billing.blocked)}
                        </b>
                      </span>
                      <small>
                        Updated after BillReady validated the acceptance
                        evidence.
                      </small>
                    </div>
                  )}
                  <ToolActivity tools={proofRun.tools} live={!!uploadState} />
                </section>
              )}
              {state.proposals
                .filter(
                  (p) =>
                    p.projectId === project.id &&
                    p.type === "billing" &&
                    p.status === "prepared",
                )
                .slice(-1)
                .map((p) => (
                  <div key={p.id} className="saved-package-banner">
                    <CheckCircle2 size={22} />
                    <div>
                      <b>Billing package saved</b>
                      <span>
                        Download your documents and prepare the email for your
                        client.
                      </span>
                    </div>
                    <button
                      className="button dark small"
                      onClick={() => setReviewId(p.id)}
                    >
                      Use saved package
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                ))}
              <section className="card project-work">
                <div className="tabs">
                  {[
                    ["milestones", "Billing milestones"],
                    ["documents", "Project documents"],
                    ["approvals", "Review & approvals"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      className={tab === id ? "selected" : ""}
                      onClick={() => setTab(id)}
                    >
                      {label}
                      {id === "approvals" && pending.length > 0 && (
                        <span className="count">{pending.length}</span>
                      )}
                      {id === "documents" && (
                        <span className="count">
                          {
                            state.documents.filter(
                              (d) =>
                                d.projectId === project.id &&
                                isCustomerDocument(d),
                            ).length
                          }
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {tab === "milestones" ? (
                  <div className="milestone-list">
                    {project.milestones.map((m, i) => (
                      <div className="milestone-row" key={m.id}>
                        <div
                          className={
                            "step " +
                            (m.issued
                              ? "done"
                              : m.acceptanceRequired &&
                                  !m.accepted &&
                                  m.complete
                                ? "blocked"
                                : m.complete
                                  ? "ready"
                                  : "")
                          }
                        >
                          {m.issued ? (
                            <Check size={16} />
                          ) : (
                            String(i + 1).padStart(2, "0")
                          )}
                        </div>
                        <div className="milestone-main">
                          <b>{m.name}</b>
                          <span>
                            {m.complete
                              ? "Delivery complete"
                              : "Delivery in progress"}
                            {m.acceptanceRequired
                              ? " · Signed customer acceptance required"
                              : ""}
                          </span>
                          {m.complete &&
                            !m.issued &&
                            m.acceptanceRequired &&
                            !m.accepted && (
                              <div className="blocker">
                                <AlertCircle size={12} />
                                Missing matching signed acceptance
                              </div>
                            )}
                          {m.acceptanceFileId && (
                            <button
                              className="source-inline"
                              onClick={() => openDoc(m.acceptanceFileId!)}
                            >
                              <Paperclip size={12} />
                              View verified acceptance
                            </button>
                          )}
                        </div>
                        <div className="milestone-right">
                          <b>{money(m.cents)}</b>
                          <span
                            className={
                              "badge " +
                              (m.issued
                                ? "muted"
                                : !m.complete
                                  ? "blue"
                                  : m.acceptanceRequired && !m.accepted
                                    ? "amber"
                                    : "green")
                            }
                          >
                            {m.issued
                              ? "Invoiced"
                              : !m.complete
                                ? "Upcoming"
                                : m.acceptanceRequired && !m.accepted
                                  ? "Blocked"
                                  : "Ready to bill"}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div className="milestone-foot">
                      <ShieldCheck size={15} />
                      Drafts stay separate from issued invoices. You approve
                      every billing package.
                    </div>
                  </div>
                ) : tab === "documents" ? (
                  <div className="documents">
                    <div className="document-toolbar">
                      <span>Evidence and saved project outputs</span>
                      <button
                        className="button secondary small"
                        onClick={() => fileRef.current?.click()}
                        disabled={!!uploadState}
                      >
                        <Upload size={14} />
                        Upload acceptance
                      </button>
                    </div>
                    {state.documents
                      .filter(
                        (d) =>
                          d.projectId === project.id && isCustomerDocument(d),
                      )
                      .map((d) => (
                        <div className="document-row" key={d.id}>
                          <div
                            className={"doc-icon " + (d.valid ? "green" : "")}
                          >
                            <FileText size={19} />
                          </div>
                          <button
                            className="document-name"
                            onClick={() => openDoc(d.id)}
                          >
                            <b>{documentLabel(d)}</b>
                            <span>
                              {d.category}
                              {d.valid
                                ? " · Verified acceptance"
                                : d.valid === false
                                  ? " · Review required"
                                  : ""}
                            </span>
                          </button>
                          <button
                            className="icon-btn"
                            aria-label={"Preview " + d.name}
                            onClick={() => openDoc(d.id)}
                          >
                            <ExternalLink size={15} />
                          </button>
                          <a
                            className="icon-btn"
                            aria-label={"Download " + d.name}
                            href={
                              "/api/documents/" + d.id + "/content?download=1"
                            }
                            download
                          >
                            <Download size={15} />
                          </a>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="approvals">
                    {state.proposals.filter((p) => p.projectId === project.id)
                      .length ? (
                      state.proposals
                        .filter((p) => p.projectId === project.id)
                        .map((p) => (
                          <button
                            className="approval-row"
                            key={p.id}
                            onClick={() => setReviewId(p.id)}
                          >
                            <div className="doc-icon green">
                              {p.type === "billing" ? (
                                <Receipt size={20} />
                              ) : (
                                <Mail size={20} />
                              )}
                            </div>
                            <div>
                              <b>
                                {p.type === "billing"
                                  ? "Draft invoice & billing packet"
                                  : "Customer request & internal follow-up"}
                              </b>
                              <span>
                                {p.reference} ·{" "}
                                {p.status === "prepared"
                                  ? p.type === "billing"
                                    ? "Ready for handoff · open saved package"
                                    : p.resolved
                                      ? "Follow-up resolved · acceptance verified"
                                      : "Internal follow-up saved"
                                  : "Awaiting your review"}
                              </span>
                            </div>
                            <span
                              className={
                                "badge " +
                                (p.status === "prepared" ? "green" : "amber")
                              }
                            >
                              {p.status === "prepared" ? "Saved" : "Review"}
                            </span>
                            <ChevronRight size={16} />
                          </button>
                        ))
                    ) : (
                      <div className="empty">
                        <ShieldCheck size={28} />
                        <b>No drafts awaiting review</b>
                        <p>
                          Ask the billing assistant to prepare an invoice or a
                          customer follow-up.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </section>
              <div className="project-bottom">
                <section className="card">
                  <div className="section-head">
                    <h2>Follow-ups</h2>
                    <span className="subtle">Internal · owner reviewed</span>
                  </div>
                  {state.proposals
                    .filter(
                      (p) =>
                        p.projectId === project.id &&
                        p.type === "followup" &&
                        p.status === "prepared" &&
                        !p.resolved,
                    )
                    .map((p) => (
                      <div className="followup" key={p.id}>
                        <Clock size={17} />
                        <div>
                          <b>Request signed customer acceptance</b>
                          <span>
                            {p.owner} · Due {date(p.due)}
                          </span>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => setReviewId(p.id)}
                        >
                          View
                        </button>
                      </div>
                    ))}
                  {!state.proposals.some(
                    (p) =>
                      p.projectId === project.id &&
                      p.type === "followup" &&
                      p.status === "prepared" &&
                      !p.resolved,
                  ) && (
                    <div className="followup">
                      <Clock size={18} />
                      <div>
                        <b>
                          {project.billing.blocked
                            ? "Customer acceptance needed"
                            : project.billing.future
                              ? "Confirm equipment delivery"
                              : "No open follow-ups"}
                        </b>
                        <span>
                          {project.owner} ·{" "}
                          {project.billing.blocked
                            ? "Ask the agent to draft a request"
                            : project.billing.future
                              ? "Delivery remains in progress"
                              : "Everything is up to date"}
                        </span>
                      </div>
                    </div>
                  )}
                </section>
                <section className="card">
                  <div className="section-head">
                    <h2>Project details</h2>
                  </div>
                  <dl className="project-details">
                    <div>
                      <dt>Client contact</dt>
                      <dd>{project.contact}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{project.email}</dd>
                    </div>
                    <div>
                      <dt>Project owner</dt>
                      <dd>{project.owner}</dd>
                    </div>
                    <div>
                      <dt>Payment terms</dt>
                      <dd>Net 30 · USD · $0 tax assumption</dd>
                    </div>
                  </dl>
                </section>
              </div>
            </>
          )}
          <section className="card activity-card" id="recent-activity">
            <div className="section-head">
              <h2>Recent activity</h2>
              <span className="subtle">
                {project ? "This project" : "Across your workspace"}
              </span>
            </div>
            {state.activity
              .filter((a) => !project || a.projectId === project.id)
              .slice(0, 4)
              .map((a) => (
                <div className="activity-row" key={a.id}>
                  <div className="activity-symbol">
                    <Check size={13} />
                  </div>
                  <span>{a.text}</span>
                  <small>{date(a.date)}</small>
                </div>
              ))}
            {!state.activity.some(
              (a) => !project || a.projectId === project.id,
            ) && (
              <div className="activity-row">
                <div className="activity-symbol">
                  <Check size={13} />
                </div>
                <span>
                  Project records and delivery evidence available for review.
                </span>
                <small>{date(state.demoDate)}</small>
              </div>
            )}
          </section>
          <footer className="page-footer">
            <span>Clearwave AV · BillReady</span>
            <span>Evidence before invoices. Always.</span>
          </footer>
        </div>
      </main>
      {agentOpen && (
        <aside className="agent-panel">
          <div className="agent-header">
            <div className="agent-logo">
              <Sparkles size={19} />
            </div>
            <div>
              <h2>Billing assistant</h2>
              <span>
                <i />
                Clearwave AV · Operations
              </span>
            </div>
            <button
              className="icon-btn close-agent"
              aria-label="Close agent"
              onClick={() => setAgentOpen(false)}
            >
              <PanelRightClose size={17} />
            </button>
          </div>
          <div className="agent-context">
            <span>WORKING IN</span>
            <b>
              {project ? project.shortName : "Workspace projects"}
              <ChevronDown size={13} />
            </b>
          </div>
          <div
            className="agent-scroll"
            onScroll={(event) => {
              const el = event.currentTarget;
              followActivity.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            }}
          >
            <div className="agent-welcome">
              <div className="sparkle-square">
                <Sparkles size={23} />
              </div>
              <h3>
                {project
                  ? "Let’s move this project forward."
                  : "Project evidence, at a glance."}
              </h3>
              <p>
                {project
                  ? "I’ll look at the project evidence, explain what’s missing, and prepare the next step for your review."
                  : "I’ll help you turn completed work into billing-ready packages. You stay in control."}
              </p>
            </div>
            {!conversation.length && (
              <>
                <div className="agent-label">A GOOD PLACE TO START</div>
                <div className="suggestions">
                  {prompts.map((p, i) => (
                    <button key={p} disabled={busy} onClick={() => ask(p)}>
                      {i === 0 ? (
                        <Sparkles size={15} />
                      ) : i === 1 ? (
                        <Search size={15} />
                      ) : i === 2 ? (
                        <FileText size={15} />
                      ) : (
                        <ArrowUpRight size={15} />
                      )}
                      <span>{p}</span>
                      <ArrowRight size={13} />
                    </button>
                  ))}
                </div>
                <div className="agent-insight">
                  <div>
                    <span className="green-dot" />
                    QUICK INSIGHT
                  </div>
                  <p>
                    {project ? (
                      project.billing.blocked ? (
                        <>
                          The work is done.{" "}
                          <b>{money(project.billing.blocked)}</b> is waiting on
                          acceptance.
                        </>
                      ) : project.billing.ready ? (
                        <>
                          <b>{money(project.billing.ready)}</b> has the evidence
                          it needs to bill.
                        </>
                      ) : (
                        <>
                          This project has{" "}
                          <b>{money(project.billing.outstanding)}</b> in
                          outstanding issued balances.
                        </>
                      )
                    ) : (
                      <>
                        <b>
                          {money(state.totals.ready + state.totals.blocked)}
                        </b>{" "}
                        in completed work has not been invoiced yet.
                      </>
                    )}
                  </p>
                  <span>Based on project and billing records</span>
                </div>
              </>
            )}
            {conversation.map((m) => (
              <div className={"message " + m.role} key={m.id}>
                {m.role === "assistant" && (
                  <div className="message-author">
                    <Sparkles size={13} />
                    BillReady
                  </div>
                )}
                <div className="message-text">{m.text}</div>
                {m.tools && <ToolActivity tools={m.tools} />}
                {m.sources?.some((id) =>
                  state.documents.some(
                    (d) => d.id === id && isCustomerDocument(d),
                  ),
                ) && (
                  <div className="sources">
                    <span>SUPPORTING EVIDENCE</span>
                    {m.sources.map((id) => {
                      const d = state.documents.find((d) => d.id === id);
                      return d && isCustomerDocument(d) ? (
                        <button key={id} onClick={() => openDoc(id)}>
                          <FileText size={12} />
                          {documentLabel(d)}
                          <ArrowUpRight size={12} />
                        </button>
                      ) : null;
                    })}
                  </div>
                )}
                {m.proposalId && (
                  <button
                    className="review-prompt"
                    onClick={() => setReviewId(m.proposalId)}
                  >
                    <FileText size={18} />
                    <div>
                      <b>
                        {state.proposals.find((p) => p.id === m.proposalId)
                          ?.status === "prepared"
                          ? "Use saved package"
                          : state.proposals.find((p) => p.id === m.proposalId)
                                ?.type === "billing"
                            ? "Review billing package"
                            : "Review customer follow-up"}
                      </b>
                      <span>
                        {state.proposals.find((p) => p.id === m.proposalId)
                          ?.status === "prepared"
                          ? "Download documents · prepare client email"
                          : "Preview, edit & approve saving"}
                      </span>
                    </div>
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
            ))}
            {busy && liveTools.length > 0 && (
              <ToolActivity tools={liveTools} live />
            )}
            {busy && (
              <div className="agent-thinking">
                <LoaderCircle size={14} className="spin" />
                Checking records and evidence…
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          <div className="agent-composer">
            {conversation.length > 0 && (
              <div className="compact-prompts">
                {prompts.slice(0, 2).map((p) => (
                  <button key={p} disabled={busy} onClick={() => ask(p)}>
                    {p}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(question);
              }}
            >
              <textarea
                rows={2}
                aria-label="Ask the billing assistant"
                placeholder={
                  project
                    ? "Ask about this project…"
                    : "Ask the billing assistant anything…"
                }
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(question);
                  }
                }}
              />
              <div className="composer-bottom">
                <span>
                  <Paperclip size={13} />
                  Evidence-aware
                </span>
                <button
                  aria-label="Send message"
                  disabled={busy || !question.trim()}
                >
                  {busy ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : (
                    <ArrowRight size={17} />
                  )}
                </button>
              </div>
            </form>
            <p>
              <ShieldCheck size={12} />
              You review and approve. Nothing sends automatically.
            </p>
          </div>
        </aside>
      )}
      {!agentOpen && (
        <button className="agent-fab" onClick={() => setAgentOpen(true)}>
          <Sparkles size={19} />
          Ask the billing assistant
        </button>
      )}
      {notice && (
        <div className={"toast " + (notice.error ? "error" : "")} role="status">
          {notice.error ? (
            <AlertCircle size={18} />
          ) : (
            <CheckCircle2 size={18} />
          )}
          <span>{notice.text}</span>
          <button
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={() => setNotice(undefined)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {preview && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) =>
            e.target === e.currentTarget && setPreview(undefined)
          }
        >
          <div
            className="preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Document preview"
          >
            <div className="modal-head">
              <div>
                <FileText size={18} />
                <b>{preview.title}</b>
              </div>
              <a
                className="button secondary small"
                href={preview.url + "?download=1"}
                download
              >
                <Download size={14} />
                Download
              </a>
              <button
                className="icon-btn"
                aria-label="Close preview"
                onClick={() => setPreview(undefined)}
              >
                <X size={20} />
              </button>
            </div>
            <iframe title={preview.title} src={preview.url} />
          </div>
        </div>
      )}
      {reviewId && (
        <Review
          proposal={state.proposals.find((p) => p.id === reviewId)!}
          state={state}
          close={() => setReviewId(undefined)}
          openDoc={openDoc}
          reload={load}
          notify={setNotice}
        />
      )}
      {presenter && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) =>
            e.target === e.currentTarget && setPresenter(false)
          }
        >
          <div
            className="presenter-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Connection & diagnostics"
          >
            <div className="modal-head">
              <b>Connection & diagnostics</b>
              <button
                className="icon-btn"
                aria-label="Close connection diagnostics"
                onClick={() => setPresenter(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="presenter-body">
              <div
                className={
                  "connection-notice " +
                  (state.mode === "development" ? "warning" : "")
                }
              >
                <b>
                  {state.mode === "development"
                    ? "Development adapter · simulated integration"
                    : "Connected to Box"}
                </b>
                <p>
                  {state.mode === "development"
                    ? "Files and workflow state are saved locally. No remote Box tools or model calls are simulated as live."
                    : "Content operations go through https://mcp.box.com. Binary transfers use MCP-issued URLs."}
                </p>
              </div>
              {employee && (
                <>
                  <h3>Rehearsal reset</h3>
                  <p>
                    Preview non-baseline acceptance, billing and follow-up files
                    before archiving them and restoring this sample workspace.
                  </p>
                  <a className="button secondary" href="#reset-clean">
                    Quick reset after Box cleanup
                  </a>
                  <a className="button secondary" href="#reset">
                    Archive files & reset
                  </a>
                </>
              )}
              <h3>Connection status</h3>
              <a className="button secondary" href="/auth/box/start">
                Connect Box with OAuth
                <ExternalLink size={13} />
              </a>
              <dl className="project-details">
                {Object.entries(state.connection).map(([k, v]) => (
                  <div key={k}>
                    <dt>
                      {k === "box"
                        ? "Box authorization"
                        : k === "root"
                          ? "Workspace folder"
                          : k === "provider"
                            ? "Agent provider"
                            : "Model authorization"}
                    </dt>
                    <dd>
                      {k === "provider"
                        ? String(v)
                        : v
                          ? "Configured"
                          : "Missing"}
                    </dd>
                  </div>
                ))}
              </dl>
              <h3>Underlying project folders</h3>
              {Object.entries(state.folders).map(([name, id]) => (
                <a
                  key={name}
                  href={"https://app.box.com/folder/" + id}
                  target="_blank"
                  rel="noreferrer"
                >
                  {name}
                  <ExternalLink size={13} />
                </a>
              ))}
              {!Object.keys(state.folders).length && (
                <p className="subtle">
                  No live folder mappings yet. Configure credentials, upload the
                  kit, then refresh evidence.
                </p>
              )}
              <h3>Source and saved files</h3>
              {state.documents
                .filter((d) => !project || d.projectId === project.id)
                .map((d) => (
                  <a
                    key={d.id}
                    href={
                      d.boxId
                        ? "https://app.box.com/file/" + d.boxId
                        : "/api/documents/" + d.id + "/content"
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {documentLabel(d)}
                    <span>
                      {d.boxId ? "Box " + d.boxId : "Local rehearsal"}
                      <ExternalLink size={12} />
                    </span>
                  </a>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function Status({ p }: { p: Project }) {
  const b = p.billing;
  return (
    <span
      className={
        "badge " +
        (b.blocked
          ? "amber"
          : b.ready
            ? "green"
            : b.outstanding
              ? "purple"
              : "blue")
      }
    >
      <i />
      {b.blocked
        ? "Acceptance needed"
        : b.ready
          ? "Ready to bill"
          : b.outstanding
            ? "Invoice outstanding"
            : "In progress"}
    </span>
  );
}
function PackageHandoff({
  proposal,
  state,
  notify,
}: {
  proposal: Proposal;
  state: State;
  notify: (v: { text: string; error?: boolean }) => void;
}) {
  const outputDocs = proposal.savedIds
    .map((id) => state.documents.find((d) => d.id === id))
    .filter((d): d is Doc => !!d && /\.pdf$/i.test(d.name));
  const attachments =
    proposal.type === "billing"
      ? outputDocs
      : proposal.attachments
          .map((id) => state.documents.find((d) => d.id === id))
          .filter((d): d is Doc => !!d && isCustomerDocument(d));
  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(
        `To: ${proposal.to}\nSubject: ${proposal.subject}\n\n${proposal.body}`,
      );
      notify({
        text: "Email copied. Paste it into your email app and attach the downloaded documents.",
      });
    } catch {
      notify({
        text: "Clipboard unavailable. Select and copy the email text below.",
        error: true,
      });
    }
  }
  const emailUrl = `mailto:${encodeURIComponent(proposal.to)}?subject=${encodeURIComponent(proposal.subject)}&body=${encodeURIComponent(proposal.body)}`;
  const folder =
    state.folders[
      proposal.projectId +
        "/" +
        (proposal.type === "billing" ? "04 Billing" : "05 Follow-ups")
    ];
  return (
    <div className="package-handoff">
      <div className="handoff-hero">
        <CheckCircle2 size={30} />
        <div>
          <h2>Package saved. Prepare your client email.</h2>
          <p>
            {state.mode === "live"
              ? "Your documents are saved in Box."
              : "Your documents are saved locally."}{" "}
            Choose your next step below.
          </p>
        </div>
      </div>
      <ol className="handoff-steps">
        <li>
          <b>1 · Check the invoice</b>
          <span>
            {proposal.type === "billing"
              ? "These PDFs are drafts. Finalize and issue the invoice in your billing system when ready."
              : "Review your acceptance request and supporting evidence."}
          </span>
        </li>
        <li>
          <b>2 · Download your documents</b>
          <span>
            The billing packet includes the invoice and supporting evidence.
            Choose the files you want to attach.
          </span>
        </li>
        <li>
          <b>3 · Open your email app</b>
          <span>
            The recipient, subject and message are filled in. Attach your
            downloaded files, review, then send from your email app.
          </span>
        </li>
      </ol>
      <h3>Documents for your client</h3>
      <div className="handoff-files">
        {attachments.map((d) => (
          <div key={d.id}>
            <FileText size={22} />
            <div>
              <b>{documentLabel(d)}</b>
              <span>
                {/packet/i.test(d.name)
                  ? "Combined PDF with invoice and evidence"
                  : "Saved PDF · review before sending"}
              </span>
            </div>
            <a
              className="button secondary small"
              href={"/api/documents/" + d.id + "/content?download=1"}
              download
            >
              <Download size={14} />
              Download
            </a>
            {d.boxId && (
              <a
                href={"https://app.box.com/file/" + d.boxId}
                target="_blank"
                rel="noreferrer"
                aria-label={"Open " + documentLabel(d) + " in Box"}
              >
                <ExternalLink size={15} />
              </a>
            )}
          </div>
        ))}
      </div>
      <div className="handoff-email">
        <div className="handoff-email-head">
          <h3>Your email</h3>
          <button className="button secondary small" onClick={copyEmail}>
            Copy email
          </button>
          <a className="button dark small" href={emailUrl}>
            <Mail size={14} />
            Open email app
          </a>
        </div>
        <dl>
          <div>
            <dt>To</dt>
            <dd>{proposal.to}</dd>
          </div>
          <div>
            <dt>Subject</dt>
            <dd>{proposal.subject}</dd>
          </div>
        </dl>
        <div className="handoff-email-body">{proposal.body}</div>
        <p className="handoff-note">
          Opening your email app adds the text only. Attach the files you
          downloaded above. BillReady does not send the email.
        </p>
      </div>
      {folder && (
        <a
          className="text-button"
          href={"https://app.box.com/folder/" + folder}
          target="_blank"
          rel="noreferrer"
        >
          View saved package in Box ↗
        </a>
      )}
    </div>
  );
}

function Review({
  proposal,
  state,
  close,
  openDoc,
  reload,
  notify,
}: {
  proposal: Proposal;
  state: State;
  close: () => void;
  openDoc: (id: string) => void;
  reload: () => Promise<void>;
  notify: (v: { text: string; error?: boolean }) => void;
}) {
  const [edit, setEdit] = useState({
    ...proposal,
    attachments: proposal.attachments.filter((id) =>
      state.documents.some((d) => d.id === id && isCustomerDocument(d)),
    ),
  });
  const [tab, setTab] = useState(
    proposal.status === "prepared"
      ? "handoff"
      : proposal.type === "billing"
        ? "invoice"
        : "email",
  );
  const [saving, setSaving] = useState(false);
  if (!proposal) return null;
  const p = state.projects.find((p) => p.id === proposal.projectId)!;
  const readonly = proposal.status === "prepared";
  const update = (key: keyof Proposal, value: any) =>
    setEdit({ ...edit, [key]: value });
  async function save(approve = false) {
    setSaving(true);
    try {
      await api("/proposals/" + edit.id, {
        method: "PATCH",
        ...json({
          to: edit.to,
          subject: edit.subject,
          body: edit.body,
          owner: edit.owner,
          due: edit.due,
          attachments: edit.attachments,
        }),
      });
      if (approve)
        await api("/proposals/" + edit.id + "/approve", {
          method: "POST",
          ...json({ confirm: true }),
        });
      await reload();
      notify({
        text: approve
          ? "Saved. " +
            (edit.type === "billing"
              ? "Prepared for billing. Invoice not issued; email not sent."
              : "Internal follow-up approved. Customer email remains a draft.")
          : "Draft edits saved.",
      });
      if (approve) setTab("handoff");
    } catch (e) {
      notify({ text: (e as Error).message, error: true });
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <div
        className={"review-modal review-" + tab}
        role="dialog"
        aria-modal="true"
        aria-label={
          proposal.type === "billing"
            ? "Review billing package"
            : "Review customer follow-up"
        }
      >
        <div className="modal-head">
          <div className="review-title">
            <div className="doc-icon green">
              <Receipt size={20} />
            </div>
            <div>
              <b>
                {proposal.type === "billing"
                  ? "Review billing package"
                  : "Review customer follow-up"}
              </b>
              <span>
                {p.shortName} · {proposal.reference}
              </span>
            </div>
          </div>
          <span className={"badge " + (readonly ? "green" : "amber")}>
            {readonly ? "Saved · ready for handoff" : "Awaiting approval"}
          </span>
          <button
            className="icon-btn"
            aria-label="Close review"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        <div className="tabs">
          {(proposal.type === "billing"
            ? [
                ...(readonly ? ["handoff"] : []),
                "invoice",
                "email",
                "attachments",
              ]
            : [...(readonly ? ["handoff"] : []), "email", "attachments"]
          ).map((t) => (
            <button
              key={t}
              className={tab === t ? "selected" : ""}
              onClick={() => setTab(t)}
            >
              {t === "handoff"
                ? "Use saved package"
                : t === "invoice"
                  ? "Draft invoice"
                  : t === "email"
                    ? "Email & follow-up"
                    : "Evidence & attachments"}
            </button>
          ))}
        </div>
        <div className="review-content">
          {tab === "handoff" && readonly ? (
            <PackageHandoff proposal={proposal} state={state} notify={notify} />
          ) : tab === "invoice" ? (
            <>
              <div className="review-summary">
                <span>
                  Final milestone{" "}
                  <b>
                    {money(
                      proposal.milestoneIds.reduce(
                        (sum, id) =>
                          sum + p.milestones.find((m) => m.id === id)!.cents,
                        0,
                      ),
                    )}
                  </b>
                </span>
                <span>
                  Tax <b>$0</b>
                </span>
                <span>
                  Terms <b>Net 30 from issue</b>
                </span>
                <span>
                  Status <b>DRAFT · not issued</b>
                </span>
              </div>
              <PdfPreview url={"/api/proposals/" + proposal.id + "/invoice"} />
            </>
          ) : tab === "email" ? (
            <div className="email-editor">
              <div className="draft-banner">
                <Mail size={15} />
                Email draft · no email will be sent
              </div>
              <label>
                To
                <input
                  aria-label="Email recipient"
                  value={edit.to}
                  readOnly={readonly}
                  onChange={(e) => update("to", e.target.value)}
                />
              </label>
              <label>
                Subject
                <input
                  aria-label="Email subject"
                  value={edit.subject}
                  readOnly={readonly}
                  onChange={(e) => update("subject", e.target.value)}
                />
              </label>
              <label>
                Message
                <textarea
                  aria-label="Email body"
                  rows={9}
                  value={edit.body}
                  readOnly={readonly}
                  onChange={(e) => update("body", e.target.value)}
                />
              </label>
              {proposal.type === "followup" && (
                <div className="form-row">
                  <label>
                    Internal follow-up owner
                    <select
                      value={edit.owner}
                      disabled={readonly}
                      onChange={(e) => update("owner", e.target.value)}
                    >
                      {[
                        ...new Set([
                          ...state.projects.map((project) => project.owner),
                          edit.owner,
                        ]),
                      ].map((owner) => (
                        <option key={owner}>{owner}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Due date
                    <input
                      type="date"
                      value={edit.due}
                      disabled={readonly}
                      onChange={(e) => update("due", e.target.value)}
                    />
                  </label>
                </div>
              )}
              <div className="email-attachments">
                <Paperclip size={14} />
                Attachments:{" "}
                {edit.type === "billing"
                  ? "draft invoice, billing packet, "
                  : ""}
                {edit.attachments
                  .map((id) => state.documents.find((d) => d.id === id)?.name)
                  .join(", ")}
              </div>
            </div>
          ) : (
            <div className="attachment-list">
              <p>
                Inspect the sources and select the supporting documents to
                include.
              </p>
              {state.documents
                .filter(
                  (d) =>
                    d.projectId === p.id &&
                    !d.generated &&
                    isCustomerDocument(d),
                )
                .map((d) => (
                  <div className="attachment-item" key={d.id}>
                    <input
                      aria-label={"Attach " + d.name}
                      type="checkbox"
                      disabled={readonly || d.valid === false}
                      checked={edit.attachments.includes(d.id)}
                      onChange={(e) =>
                        update(
                          "attachments",
                          e.target.checked
                            ? [...edit.attachments, d.id]
                            : edit.attachments.filter((id) => id !== d.id),
                        )
                      }
                    />
                    <FileText size={18} />
                    <button onClick={() => openDoc(d.id)}>
                      <b>{documentLabel(d)}</b>
                      <span>{d.analysis || d.category}</span>
                    </button>
                    <a
                      href={"/api/documents/" + d.id + "/content?download=1"}
                      aria-label={"Download " + d.name}
                    >
                      <Download size={16} />
                    </a>
                  </div>
                ))}
              {readonly && (
                <>
                  <h3>Saved outputs</h3>
                  {proposal.savedIds.map((id) => {
                    const d = state.documents.find((d) => d.id === id);
                    return d && isCustomerDocument(d) ? (
                      <button
                        className="saved-output"
                        key={id}
                        onClick={() => openDoc(id)}
                      >
                        <CheckCircle2 size={16} />
                        {documentLabel(d)}
                        <ArrowUpRight size={14} />
                      </button>
                    ) : null;
                  })}
                </>
              )}
            </div>
          )}
        </div>
        <div className="review-footer">
          <div>
            <ShieldCheck size={17} />
            <span>
              {readonly
                ? "Package saved. Download the documents and review the email in your email app."
                : proposal.type === "billing"
                  ? "Approval prepares the package. It does not issue an invoice or send email."
                  : "Approval saves an internal follow-up and customer email draft only."}
            </span>
          </div>
          {readonly ? (
            <button className="button dark" onClick={close}>
              Done
              <Check size={15} />
            </button>
          ) : (
            <>
              <button
                className="button secondary"
                disabled={saving}
                onClick={() => save()}
              >
                Save edits
              </button>
              <button
                className="button dark"
                disabled={saving}
                onClick={() => save(true)}
              >
                {saving ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <Check size={15} />
                )}
                Approve & save
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
const browserInstanceId = crypto.randomUUID();
async function signOut() {
  abortWorkspaceRequests();
  const response = await fetch("/auth/signout", { method: "POST" });
  if (!response.ok) throw Error("Could not sign out.");
  const channel = new BroadcastChannel("billready-session");
  channel.postMessage({ kind: "changed", sender: browserInstanceId });
  channel.close();
  location.hash = "overview";
  location.reload();
}
function EmployeeApp() {
  const [route, setRoute] = useState(location.hash);
  useEffect(() => {
    const changed = () => {
      setRoute(location.hash);
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);

  const [session, setSession] = useState<{
    mode: string;
    employee: Identity | null;
    workspace: Workspace | null;
  }>();
  const [choosing, setChoosing] = useState(false),
    [error, setError] = useState("");
  const fingerprint = useRef("");
  async function checkSession() {
    try {
      const r = await fetch("/api/session", { cache: "no-store" });
      if (!r.ok) throw Error("Could not load your Box session.");
      const next = await r.json(),
        key = JSON.stringify(next);
      if (fingerprint.current !== key) {
        abortWorkspaceRequests();
        fingerprint.current = key;
        setSession(next);
      }
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void checkSession();
    const channel = new BroadcastChannel("billready-session");
    channel.onmessage = (event) => {
      if (event.data?.sender === browserInstanceId) return;
      abortWorkspaceRequests();
      setSession(undefined);
      fingerprint.current = "";
      void checkSession();
    };
    const timer = setInterval(() => void checkSession(), 15000);
    return () => {
      clearInterval(timer);
      channel.close();
      abortWorkspaceRequests();
    };
  }, []);
  if (!session)
    return (
      <div className="entry-page">
        <div className="entry-card">
          <h1>Clearwave AV</h1>
          <p>{error || "Loading your workspace…"}</p>
          {error && (
            <button
              className="button secondary"
              onClick={() => void checkSession()}
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  if (session.mode === "development") return <App changeWorkspace={() => {}} />;
  if (!session.employee)
    return (
      <div className="entry-page">
        <div className="entry-card">
          <div className="eyebrow">CLEARWAVE AV / INTERNAL TOOLS</div>
          <h1>
            Your projects.
            <br />
            Your Box workspace.
          </h1>
          <p className="entry-lead">
            BillReady helps our operations team turn completed work into
            billing-ready packages using the documents we already keep in Box.
          </p>
          <a className="button primary" href="/auth/box/start">
            Sign in with Box <ArrowRight size={17} />
          </a>
          <div className="entry-note">
            <ShieldCheck size={17} />
            <span>
              Your Box permissions determine which project folders you can
              access.
            </span>
          </div>
          <footer>Built by Clearwave AV engineering · Box MCP + Box AI</footer>
        </div>
      </div>
    );
  if (choosing || !session.workspace)
    return (
      <FolderChooser
        employee={session.employee}
        current={session.workspace || undefined}
        cancel={session.workspace ? () => setChoosing(false) : undefined}
        selected={async () => {
          abortWorkspaceRequests();
          setChoosing(false);
          setSession(undefined);
          location.hash = "overview";
          const channel = new BroadcastChannel("billready-session");
          channel.postMessage({ kind: "changed", sender: browserInstanceId });
          channel.close();
          await checkSession();
        }}
      />
    );
  if (route === "#reset-clean")
    return (
      <ResetAfterCleanup
        employee={session.employee}
        workspace={session.workspace}
        done={() => {
          location.hash = "overview";
        }}
      />
    );
  if (route === "#reset")
    return (
      <ResetWorkspace
        employee={session.employee}
        workspace={session.workspace}
        done={() => {
          location.hash = "overview";
        }}
      />
    );
  return (
    <App
      key={session.employee.id + "/" + session.workspace.id}
      employee={session.employee}
      workspace={session.workspace}
      changeWorkspace={() => {
        abortWorkspaceRequests();
        setChoosing(true);
      }}
    />
  );
}
function ResetAfterCleanup({
  employee,
  workspace,
  done,
}: {
  employee: Identity;
  workspace: Workspace;
  done: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [complete, setComplete] = useState("");
  useEffect(() => () => abortWorkspaceRequests(), []);
  async function reset() {
    setBusy(true);
    setError("");
    try {
      const result = await api("/reset/after-cleanup", {
        method: "POST",
        ...json({ confirm: true }),
      });
      setComplete(result.message);
      const channel = new BroadcastChannel("billready-session");
      channel.postMessage({ kind: "changed", sender: browserInstanceId });
      channel.close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="entry-page">
      <div className="entry-card folder-chooser">
        <div className="eyebrow">CLEARWAVE AV / QUICK REHEARSAL RESET</div>
        <h1>Already cleaned up Box?</h1>
        <p>
          <strong>{workspace.name}</strong> · {employee.email}
        </p>
        <p>
          In Alder & Finch, remove or move the uploaded customer acceptance from{" "}
          <strong>03 Acceptance</strong>, the generated invoice, packet and
          email files from <strong>04 Billing</strong>, and any generated
          follow-up from <strong>05 Follow-ups</strong>. Keep the original
          agreements, completion report and README files.
        </p>
        <a
          className="box-project-link"
          href={"https://app.box.com/folder/" + workspace.id}
          target="_blank"
          rel="noreferrer"
        >
          Open workspace in Box <ExternalLink size={14} />
        </a>
        <p>
          This checks only the relevant project folders and resets local
          rehearsal state. It does not change files in Box or call Box AI. Other
          project amounts are preserved; workspace chats and drafts are cleared.
        </p>
        {busy && (
          <p role="status">
            Confirming Box cleanup and resetting Alder & Finch…
          </p>
        )}
        {error && (
          <p className="workspace-warning" role="alert">
            {error}
          </p>
        )}
        {complete && <p role="status">{complete}</p>}
        <div className="folder-actions">
          <button className="button secondary" disabled={busy} onClick={done}>
            {complete ? "Return to workspace" : "Cancel"}
          </button>
          {!complete && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void reset()}
            >
              Check Box & reset Alder & Finch
            </button>
          )}
        </div>
        {!complete && (
          <p className="subtle">
            Prefer to let the app move the files?{" "}
            <a href="#reset">Use archive & reset</a>.
          </p>
        )}
      </div>
    </div>
  );
}
type ResetPreview = {
  workspace: Workspace;
  files: Doc[];
  fingerprint: string;
  message: string;
};
function ResetWorkspace({
  employee,
  workspace,
  done,
}: {
  employee: Identity;
  workspace: Workspace;
  done: () => void;
}) {
  const [preview, setPreview] = useState<ResetPreview>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [complete, setComplete] = useState("");
  async function refreshPreview() {
    setBusy(true);
    setError("");
    setPreview(undefined);
    try {
      setPreview(await api("/reset/preview", { method: "POST", ...json({}) }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refreshPreview();
    return () => abortWorkspaceRequests();
  }, []);
  async function apply() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await api("/reset/apply", {
        method: "POST",
        ...json({ fingerprint: preview.fingerprint, confirm: true }),
      });
      setComplete(result.message + " Archived " + result.archived + " files.");
      setPreview(undefined);
      const channel = new BroadcastChannel("billready-session");
      channel.postMessage({ kind: "changed", sender: browserInstanceId });
      channel.close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="entry-page">
      <div className="entry-card folder-chooser">
        <div className="eyebrow">CLEARWAVE AV / REHEARSAL</div>
        <h1>Reset this workspace</h1>
        <p>
          <strong>{workspace.name}</strong> · {employee.email}
        </p>
        <p>
          Original sample documents and your Box sign-in are preserved. Listed
          files move into a rehearsal archive; nothing is deleted from Box.
        </p>
        <div className="workspace-warning">
          This affects the selected shared Box folder for everyone who uses it.
          Other Box workspaces are unchanged.
        </div>
        {busy && (
          <p role="status">
            {preview
              ? "Archiving files and restoring the workflow…"
              : "Reading the selected workspace…"}
          </p>
        )}
        {error && (
          <p className="workspace-warning" role="alert">
            {error} If an archive was interrupted, preview again and retry;
            already archived files stay safe.
          </p>
        )}
        {preview && (
          <>
            <h3>
              {preview.files.length}{" "}
              {preview.files.length === 1 ? "file" : "files"} to archive
            </h3>
            <div className="folder-list">
              {preview.files.map((file) => (
                <div className="reset-file" key={file.id}>
                  <FileText size={17} />
                  <span>{file.name}</span>
                  <a
                    href={"https://app.box.com/file/" + file.boxId}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Box ↗
                  </a>
                </div>
              ))}
              {!preview.files.length && (
                <p>
                  No extra files to archive. Local chats, drafts and checkpoints
                  will still reset.
                </p>
              )}
            </div>
            <p>{preview.message}</p>
          </>
        )}
        {complete && <p role="status">{complete}</p>}
        <div className="folder-actions">
          <button className="button secondary" disabled={busy} onClick={done}>
            {complete ? "Return to workspace" : "Cancel"}
          </button>
          {!complete && (
            <>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void refreshPreview()}
              >
                Refresh preview
              </button>
              <button
                className="button primary"
                disabled={busy || !preview}
                onClick={() => void apply()}
              >
                Archive files & reset workspace
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
function FolderChooser({
  employee,
  current,
  selected,
  cancel,
}: {
  employee: Identity;
  current?: Workspace;
  selected: () => Promise<void>;
  cancel?: () => void;
}) {
  const [trail, setTrail] = useState<Workspace[]>([
    { id: "0", name: "All files" },
  ]);
  const [entries, setEntries] = useState<Workspace[]>([]),
    [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const folder = trail.at(-1)!;
  async function browse(offset = 0) {
    setLoading(true);
    setError("");
    try {
      const data = await api(
        "/folders?folderId=" + folder.id + "&offset=" + offset,
      );
      setEntries((items) =>
        offset ? [...items, ...data.entries] : data.entries,
      );
      setNext(data.nextOffset);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    setEntries([]);
    setNext(null);
    void browse();
    return () => abortWorkspaceRequests();
  }, [folder.id]);
  async function choose() {
    setSaving(true);
    setError("");
    try {
      await api("/workspace", {
        method: "POST",
        ...json({ folderId: folder.id }),
      });
      await selected();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }
  return (
    <div className="entry-page">
      <div className="entry-card folder-chooser">
        <div className="eyebrow">CLEARWAVE AV / BILLREADY</div>
        <h1>Choose your workspace</h1>
        <p>
          Signed in as <strong>{employee.name}</strong> · {employee.email}
        </p>
        <p>
          Select a folder containing your project records. Only supported
          projects you can access within that folder will appear.
        </p>
        {current && <p className="subtle">Current workspace: {current.name}</p>}
        <nav className="folder-breadcrumb" aria-label="Box folders">
          {trail.map((f, i) => (
            <button
              key={f.id}
              onClick={() => setTrail((t) => t.slice(0, i + 1))}
              disabled={saving}
            >
              {f.name}
              {i < trail.length - 1 && <ChevronRight size={13} />}
            </button>
          ))}
        </nav>
        {error && (
          <div className="workspace-warning" role="alert">
            {error}
            <button onClick={() => void browse()}>Retry listing</button>
          </div>
        )}
        <div className="folder-list">
          {entries.map((f) => (
            <button
              key={f.id}
              onClick={() => setTrail((t) => [...t, f])}
              disabled={saving || loading}
            >
              <FolderKanban size={20} />
              <span>{f.name}</span>
              <ChevronRight size={16} />
            </button>
          ))}
          {loading && <p role="status">Loading folders…</p>}
          {!loading && !error && !entries.length && <p>No subfolders here.</p>}
          {next !== null && (
            <button
              disabled={loading || saving}
              onClick={() => void browse(next)}
            >
              Load more folders
            </button>
          )}
        </div>
        <div className="folder-actions">
          {cancel && (
            <button className="button secondary" onClick={cancel}>
              Cancel
            </button>
          )}
          <button
            className="button primary"
            disabled={folder.id === "0" || saving || loading || !!error}
            onClick={() => void choose()}
          >
            {saving ? "Opening workspace…" : "Use this folder"}
          </button>
        </div>
        <div className="account-actions">
          <button onClick={() => void signOut()}>Sign out</button>
          <a href="/auth/box/start" onClick={() => abortWorkspaceRequests()}>
            Switch Box account
          </a>
        </div>
        <footer>Built by Clearwave AV engineering · Box MCP + Box AI</footer>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<EmployeeApp />);
