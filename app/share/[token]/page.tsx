import { supabaseServer } from "../../../lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: any;
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const p = await resolveParams(props?.params);
  const token = p?.token;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const logoUrl = appUrl ? `${appUrl}/buildproof-logo.png` : "/buildproof-logo.png";

  let title = "BuildProof Project Journal";

  if (token) {
    const { data: share } = await supabaseServer
      .from("project_shares")
      .select("project_id, revoked_at")
      .eq("token", token)
      .maybeSingle();

    if (share && !share.revoked_at) {
      const { data: project } = await supabaseServer
        .from("projects")
        .select("title")
        .eq("id", share.project_id)
        .maybeSingle();

      if (project?.title) {
        title = `${project.title} | BuildProof`;
      }
    }
  }

  return {
    title,
    openGraph: {
      title,
      images: [logoUrl],
    },
    twitter: {
      card: "summary_large_image",
      title,
      images: [logoUrl],
    },
  };
}

type Proof = {
  id: number;
  content: string;
  created_at: string;
  locked_at: string | null;
  created_timezone_id?: string | null;
  created_timezone_offset_minutes?: number | null;
};

type ApprovalAttachment = {
  id: string;
  approval_id: string;
  filename: string | null;
  mime_type: string | null;
  path: string;
  created_at: string;
  signed_url?: string | null;
};

type Approval = {
  id: string;
  project_id: string;
  title: string | null;
  approval_type: string | null;
  description: string | null;
  cost_delta: number | null;
  schedule_delta: string | null;
  status: string | null;
  created_at: string;
  sent_at: string | null;
  responded_at: string | null;
  expired_at: string | null;
  archived_at: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  created_timezone_id?: string | null;
  created_timezone_offset_minutes?: number | null;
  attachments?: ApprovalAttachment[] | null;
};

type AttachmentRow = {
  id: string;
  proof_id: number;
  filename: string | null;
  mime_type: string | null;
  path: string;
  created_at?: string | null;
};

type AttachmentView = AttachmentRow & {
  signedUrl?: string | null;
  kind: "image" | "pdf" | "other";
};

const ATTACHMENTS_BUCKET = "attachments";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function formatDate(
  iso: string,
  timezoneOffsetMinutes?: number | null
) {
  try {
    const utc = new Date(iso);

    if (
      typeof timezoneOffsetMinutes === "number" &&
      !Number.isNaN(timezoneOffsetMinutes)
    ) {
      const wallClock = new Date(
        utc.getTime() - timezoneOffsetMinutes * 60000
      );

      return wallClock.toLocaleString("en-US", {
        timeZone: "UTC",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }

    return utc.toLocaleString();
  } catch {
    return iso;
  }
}

function formatShortDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function guessKind(
  mime: string | null | undefined,
  name: string | null | undefined
): "image" | "pdf" | "other" {
  const m = (mime || "").toLowerCase();
  const n = (name || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  return "other";
}

async function resolveParams(raw: any): Promise<any> {
  if (!raw) return null;
  if (typeof raw?.then === "function") return await raw;
  return raw;
}

export default async function SharePage(props: {
  params: any;
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const p = await resolveParams(props?.params);
  const sp = await resolveParams(props?.searchParams);
  const token = p?.token;

  const archivedRaw = sp?.archived;
  const includeArchived =
    archivedRaw === "1" ||
    archivedRaw === "true" ||
    (Array.isArray(archivedRaw) && (archivedRaw.includes("1") || archivedRaw.includes("true")));

  if (!token) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Link not found</h1>
        <p>This share link is missing a token.</p>
      </div>
    );
  }

  const { data: share, error: shareErr } = await supabaseServer
    .from("project_shares")
    .select("project_id, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (shareErr) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Something went wrong</h1>
        <pre>{shareErr.message}</pre>
      </div>
    );
  }

  if (!share) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Link not found</h1>
        <p>This share link doesn’t exist.</p>
      </div>
    );
  }

  if (share.revoked_at) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Link revoked</h1>
        <p>This share link was revoked and no longer works.</p>
      </div>
    );
  }

  const projectId = share.project_id;

  try {
    await supabaseServer.from("share_views").insert({
      project_id: projectId,
      share_token: token,
    });
  } catch {
    // never let share-view logging break the share page
  }

  const { data: project, error: projectErr } = await supabaseServer
    .from("projects")
    .select("id,title,created_at")
    .eq("id", projectId)
    .single();

  if (projectErr || !project) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Project not found</h1>
      </div>
    );
  }

  const { data: sendJob } = await supabaseServer
    .from("send_jobs")
    .select("locked_entry_ids")
    .eq("share_id", token ? undefined : null) // placeholder, will override below
    .limit(1)
    .maybeSingle();

  // correct lookup by joining via project_shares
  let lockedEntryIds: number[] = [];

  const { data: shareRow } = await supabaseServer
    .from("project_shares")
    .select("id")
    .eq("token", token)
    .maybeSingle();

  if (shareRow?.id) {
    const { data: job } = await supabaseServer
      .from("send_jobs")
      .select("locked_entry_ids")
      .eq("share_id", shareRow.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (Array.isArray(job?.locked_entry_ids)) {
      lockedEntryIds = job.locked_entry_ids
        .map((id: any) => Number(id))
        .filter((id: number) => Number.isFinite(id));
    }
  }

  let proofsQuery = supabaseServer
    .from(includeArchived ? "proofs" : "proofs_active")
    .select("id,content,created_at,locked_at,created_timezone_id,created_timezone_offset_minutes")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (lockedEntryIds.length > 0) {
    proofsQuery = proofsQuery.in("id", lockedEntryIds);
  }

  const { data: proofs, error: proofsErr } = await proofsQuery;

  if (proofsErr) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Failed to load entries</h1>
        <pre>{proofsErr.message}</pre>
      </div>
    );
  }

  let approvalsQuery = supabaseServer
    .from("approval_requests")
    .select(`
      id,
      title,
      approval_type,
      description,
      cost_delta,
      schedule_delta,
      status,
      created_at,
      sent_at,
      responded_at,
      archived_at,
      created_timezone_id,
      created_timezone_offset_minutes
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (!includeArchived) {
    approvalsQuery = approvalsQuery
      .is("archived_at", null)
      .in("status", ["pending", "approved", "declined"]);
  } else {
    approvalsQuery = approvalsQuery
      .in("status", ["pending", "approved", "declined"]);
  }

  if (shareRow?.id) {
    const { data: job } = await supabaseServer
      .from("send_jobs")
      .select("processed_at")
      .eq("share_id", shareRow.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (job?.processed_at) {
      approvalsQuery = approvalsQuery.lte("created_at", job.processed_at);
    }
  }

  const { data: approvalRows, error: approvalsErr } = await approvalsQuery;

  if (approvalsErr) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Failed to load approvals</h1>
        <pre>{approvalsErr.message}</pre>
      </div>
    );
  }

  const approvalIds = (approvalRows ?? []).map((approval) => approval.id);

  let approvalAttachmentsRows: ApprovalAttachment[] = [];

  if (approvalIds.length > 0) {
    const { data: attachmentRows, error: approvalAttachmentsErr } = await supabaseServer
      .from("approval_attachments")
      .select("id,approval_id,filename,mime_type,path,created_at")
      .in("approval_id", approvalIds)
      .order("created_at", { ascending: true });

    if (approvalAttachmentsErr) {
      return (
        <div style={{ padding: 24, fontFamily: "system-ui" }}>
          <h1>Failed to load approval attachments</h1>
          <pre>{approvalAttachmentsErr.message}</pre>
        </div>
      );
    }

    approvalAttachmentsRows = (attachmentRows ?? []) as ApprovalAttachment[];
  }

  const approvals = (approvalRows ?? []).map((approval) => ({
    ...(approval as Approval),
    attachments: approvalAttachmentsRows.filter(
      (attachment) => attachment.approval_id === approval.id
    ),
  })) as Approval[];

  const list = (proofs ?? []) as Proof[];
  const timelineItems = [
    ...list.map((entry) => ({
      kind: "proof" as const,
      sortAt: entry.created_at,
      entry,
    })),
    ...approvals.map((approval) => ({
      kind: "approval" as const,
      sortAt: approval.sent_at || approval.created_at,
      approval,
    })),
  ].sort((a, b) => {
    return new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime();
  });
  const proofIds = list.map((x) => x.id);

  let attachmentsByProof: Record<number, AttachmentView[]> = {};
  let totalAttachments = 0;
  const finalizedCount = list.filter((x) => !!x.locked_at).length;
  const approvalCount = approvals.length;

  if (proofIds.length > 0) {
    const { data: rows, error: attErr } = await supabaseServer
      .from("attachments")
      .select("id,proof_id,filename,mime_type,path,created_at")
      .in("proof_id", proofIds)
      .order("created_at", { ascending: true });

    if (!attErr && rows && rows.length > 0) {
      const typed = rows as AttachmentRow[];

      const signed = await Promise.all(
        typed.map(async (r) => {
          const kind = guessKind(r.mime_type, r.filename);
          let signedUrl: string | null = null;

          const { data: signedData, error: signedErr } = await supabaseServer.storage
            .from(ATTACHMENTS_BUCKET)
            .createSignedUrl(r.path, SIGNED_URL_TTL_SECONDS);

          if (!signedErr) signedUrl = signedData?.signedUrl ?? null;

          return { ...r, signedUrl, kind } as AttachmentView;
        })
      );

      attachmentsByProof = signed.reduce((acc, a) => {
        (acc[a.proof_id] ||= []).push(a);
        return acc;
      }, {} as Record<number, AttachmentView[]>);

      totalAttachments = signed.length;
    }
  }

  // ✅ include approval attachments in summary counts
  for (const approval of approvals) {
    for (const _att of approval.attachments ?? []) {
      totalAttachments += 1;
    }
  }

  const createdAt = project.created_at ? formatShortDate(project.created_at) : "";
  const lastUpdatedIso = list.length ? list[list.length - 1].created_at : project.created_at;
  const lastUpdated = lastUpdatedIso ? formatShortDate(lastUpdatedIso) : "";

  return (
    <div
      className="bp"
      style={{
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"',
        color: "#0f172a",
        background: "#f8fafc",
        minHeight: "100vh",
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
          :root{
            --bg: #f8fafc;
            --card: #ffffff;
            --ink: #0f172a;
            --muted: rgba(15,23,42,0.72);
            --muted2: rgba(15,23,42,0.58);
            --border: rgba(15,23,42,0.10);
            --border2: rgba(15,23,42,0.07);
            --shadow: 0 16px 40px rgba(15,23,42,0.08);
            --shadow-soft: 0 10px 24px rgba(15,23,42,0.05);
            --blue: #1d4ed8;
            --hero1: #0f172a;
            --hero2: #1e293b;
            --hero3: #334155;
            --green-bg: rgba(22,163,74,0.10);
            --green-text: #166534;
          }

          * { box-sizing: border-box; }

          .wrap{
            max-width: 1040px;
            margin: 0 auto;
            padding: 14px;
          }

          .topbar{
            position: sticky;
            top: 0;
            z-index: 50;
            backdrop-filter: blur(10px);
            background: rgba(248,250,252,0.84);
            border-bottom: 1px solid var(--border);
          }

          .topbarInner{
            display:flex;
            justify-content:space-between;
            gap:12px;
            align-items:center;
          }

          .brand{
            display:flex;
            align-items:center;
            gap:10px;
            min-width: 0;
          }

          .logo{
            width: 36px;
            height: 36px;
            border-radius: 12px;
            background: linear-gradient(135deg, rgba(15,23,42,0.14), rgba(15,23,42,0.05));
            border: 1px solid var(--border);
            display:flex;
            align-items:center;
            justify-content:center;
            font-weight: 900;
            flex-shrink: 0;
          }

          .brandText{
            min-width: 0;
          }

          .h1{
            font-size: 18px;
            font-weight: 900;
            margin: 0;
            line-height: 1.08;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .sub{
            font-size: 12px;
            color: var(--muted2);
            margin-top: 2px;
          }

          .pill{
            display:inline-flex;
            align-items:center;
            gap:8px;
            font-size: 12px;
            font-weight: 800;
            padding: 7px 10px;
            border-radius: 999px;
            border: 1px solid var(--border);
            background: rgba(255,255,255,0.75);
            color: rgba(15,23,42,0.92);
          }

          .btn{
            display:inline-flex;
            align-items:center;
            justify-content:center;
            padding: 10px 14px;
            border-radius: 12px;
            border: 1px solid var(--border);
            background: #fff;
            text-decoration:none;
            color: inherit;
            font-weight: 850;
            white-space: nowrap;
            box-shadow: 0 8px 18px rgba(15,23,42,0.06);
          }

          .btnPrimary{
            background: #0f172a;
            color: #fff;
            border-color: rgba(15,23,42,0.18);
          }

          .btn:active{
            transform: translateY(1px);
          }

          .card{
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 20px;
            box-shadow: var(--shadow);
          }

          .hero{
            margin-top: 6px;
            overflow: hidden;
            background: linear-gradient(135deg, var(--hero1), var(--hero2) 58%, var(--hero3));
            color: #fff;
            padding: 18px;
          }

          .heroTop{
            display:flex;
            justify-content:space-between;
            gap:12px;
            align-items:flex-start;
            flex-wrap: wrap;
          }

          .eyebrow{
            font-size: 11px;
            letter-spacing: 0.11em;
            text-transform: uppercase;
            font-weight: 900;
            color: rgba(255,255,255,0.72);
          }

          .heroTitle{
            margin-top: 8px;
            font-size: 28px;
            line-height: 1.04;
            font-weight: 900;
            letter-spacing: -0.02em;
          }

          .heroText{
            margin-top: 10px;
            max-width: 720px;
            font-size: 14px;
            line-height: 1.45;
            color: rgba(255,255,255,0.84);
          }

          .heroPills{
            display:flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 16px;
          }

          .heroPill{
            display:inline-flex;
            align-items:center;
            gap:8px;
            border-radius: 999px;
            padding: 8px 11px;
            font-size: 12px;
            font-weight: 800;
            border: 1px solid rgba(255,255,255,0.14);
            background: rgba(255,255,255,0.08);
            color: rgba(255,255,255,0.96);
          }

          .summary{
            margin-top: 14px;
            display:grid;
            gap:12px;
            padding: 14px;
          }

          .summaryTop{
            display:flex;
            justify-content:space-between;
            gap:12px;
            flex-wrap:wrap;
            align-items:flex-start;
          }

          .summaryKicker{
            font-size: 12px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: rgba(15,23,42,0.55);
            font-weight: 900;
          }

          .summaryText{
            margin-top: 6px;
            font-size: 13px;
            color: rgba(15,23,42,0.72);
            line-height: 1.45;
          }

          .stats{
            display:grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap:10px;
          }

          .stat{
            padding: 12px;
            border-radius: 16px;
            border: 1px solid var(--border2);
            background: rgba(15,23,42,0.02);
          }

          .stat .k{
            font-size: 12px;
            color: var(--muted2);
          }

          .stat .v{
            font-size: 19px;
            font-weight: 900;
            margin-top: 3px;
            line-height: 1.1;
          }

          .timeline{
            display:grid;
            gap: 14px;
            margin-top: 14px;
            padding-bottom: 14px;
          }

          .entry{
            padding: 0;
            overflow: hidden;
          }

          .entryAccent{
            height: 6px;
            background: linear-gradient(90deg, #0f172a, #334155);
          }

          .entryBody{
            padding: 14px;
          }

          .entryTop{
            display:flex;
            gap:10px;
            justify-content: space-between;
            flex-wrap: wrap;
            align-items: center;
          }

          .entryDate{
            font-size: 13px;
            color: var(--muted);
            font-weight: 800;
          }

          .badgeFinal{
            font-size: 12px;
            font-weight: 900;
            padding: 6px 10px;
            border-radius: 999px;
            border: 1px solid rgba(22,163,74,0.16);
            background: var(--green-bg);
            color: var(--green-text);
          }

          .content{
            margin-top: 12px;
            font-size: 15px;
            line-height: 1.55;
            white-space: pre-wrap;
            color: var(--ink);
          }

          .metaRow{
            margin-top: 12px;
            display:flex;
            gap:10px;
            flex-wrap: wrap;
            color: var(--muted2);
            font-size: 12px;
          }

          .sectionLabel{
            margin-top: 14px;
            margin-bottom: 10px;
            font-size: 12px;
            font-weight: 900;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: rgba(15,23,42,0.52);
          }

          .imgGrid{
            display:grid;
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .imgCard{
            display:block;
            text-decoration:none;
            color: inherit;
            border: 1px solid var(--border2);
            border-radius: 16px;
            overflow:hidden;
            background: rgba(15,23,42,0.02);
            box-shadow: var(--shadow-soft);
          }

          .img{
            width: 100%;
            height: 220px;
            object-fit: cover;
            display:block;
            background: rgba(15,23,42,0.03);
          }

          .imgCaption{
            padding: 10px 12px;
            font-size: 12px;
            color: var(--muted);
            font-weight: 700;
            border-top: 1px solid var(--border2);
            background: #fff;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .fileList{
            display:grid;
            gap: 8px;
          }

          .fileChip{
            display:flex;
            align-items:center;
            justify-content: space-between;
            gap:10px;
            border: 1px solid var(--border2);
            border-radius: 15px;
            padding: 12px;
            text-decoration: none;
            color: inherit;
            background: rgba(15,23,42,0.01);
          }

          .fileLeft{
            min-width: 0;
          }

          .fileChip .name{
            font-weight: 850;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .fileChip .meta{
            font-size: 12px;
            color: var(--muted2);
            margin-top: 3px;
          }

          .fileChip .cta{
            font-size: 12px;
            color: var(--muted2);
            font-weight: 800;
            flex-shrink: 0;
          }

          .emptyNote{
            margin-top: 10px;
            font-size: 13px;
            color: rgba(15,23,42,0.62);
          }

          .foot{
            padding: 18px 14px 28px 14px;
            color: var(--muted2);
            font-size: 12px;
            text-align: center;
          }

          @media (min-width: 740px){
            .wrap{ padding: 18px; }
            .h1{ font-size: 20px; }
            .hero{ padding: 22px; }
            .heroTitle{ font-size: 38px; }
            .summary{ padding: 16px; }
            .stats{ grid-template-columns: repeat(4, minmax(0, 1fr)); }
            .imgGrid{ grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .img{ height: 260px; }
          }

          @media (min-width: 980px){
            .imgGrid{ grid-template-columns: repeat(3, minmax(0, 1fr)); }
          }

          @media print {
            .topbar { position: static; }
            .btn { display:none; }
            body, .bp { background: #fff !important; }
            .card { box-shadow: none; }
            .imgCard { box-shadow: none; }
          }
        `,
        }}
      />

      <div
        style={{
          padding: "14px 0 6px",
        }}
      >
        <div
          className="wrap"
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <img
            src="/buildproof-logo.png"
            alt="BuildProof"
            style={{
              height: 68,
              width: "auto",
              display: "block",
            }}
          />

          <div style={{ display: "flex", gap: 10 }}>
            <span className="pill">🔒 Read-only</span>
            {includeArchived ? <span className="pill">📦 Archived included</span> : null}
          </div>
        </div>
      </div>

      <div className="wrap">
        <div className="card hero">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 18,
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "grid",
                gap: 14,
                minWidth: 0,
                flex: "1 1 520px",
              }}
            >

              <div>
                <div className="heroTitle">{project.title || "Shared Project"}</div>
                <div className="heroText">
                  A clean, read-only timeline of project updates, notes, photos, and attached files.
                </div>
              </div>
            </div>


          </div>

          <div className="heroPills">
            <div className="heroPill">Created {createdAt || "—"}</div>
            <div className="heroPill">
              Last updated {formatDate(
                [
                  {
                    iso: proofs[0]?.created_at,
                    offset: proofs[0]?.created_timezone_offset_minutes,
                  },
                  {
                    iso: approvals[0]?.created_at,
                    offset: approvals[0]?.created_timezone_offset_minutes,
                  },
                  {
                    iso: approvals[0]?.responded_at,
                    offset: approvals[0]?.created_timezone_offset_minutes,
                  },
                ]
                  .filter((item) => !!item.iso)
                  .sort(
                    (a, b) =>
                      new Date(String(b.iso)).getTime() -
                      new Date(String(a.iso)).getTime()
                  )[0]?.iso || project.created_at,
                [
                  {
                    iso: proofs[0]?.created_at,
                    offset: proofs[0]?.created_timezone_offset_minutes,
                  },
                  {
                    iso: approvals[0]?.created_at,
                    offset: approvals[0]?.created_timezone_offset_minutes,
                  },
                  {
                    iso: approvals[0]?.responded_at,
                    offset: approvals[0]?.created_timezone_offset_minutes,
                  },
                ]
                  .filter((item) => !!item.iso)
                  .sort(
                    (a, b) =>
                      new Date(String(b.iso)).getTime() -
                      new Date(String(a.iso)).getTime()
                  )[0]?.offset
              )}
            </div>
            <div className="heroPill">{list.length} entries</div>
            <div className="heroPill">{approvalCount} approvals</div>
            <div className="heroPill">{finalizedCount} finalized</div>
          </div>
        </div>

        <div className="card summary">
          <div className="summaryTop">
            <div>
              <div className="summaryKicker">Verified project journal</div>
              <div className="summaryText">
                Shared by contractor • Updates, photos, invoices, PDFs, and receipts in chronological order.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span className="pill">Attachments {totalAttachments}</span>
            </div>
          </div>

          <div className="stats">
            <div className="stat">
              <div className="k">Entries</div>
              <div className="v">{list.length}</div>
            </div>
            <div className="stat">
              <div className="k">Approvals</div>
              <div className="v">{approvalCount}</div>
            </div>
            <div className="stat">
              <div className="k">Attachments</div>
              <div className="v">{totalAttachments}</div>
            </div>
            <div className="stat">
              <div className="k">Finalized</div>
              <div className="v">{finalizedCount}</div>
            </div>
          </div>
        </div>

        {timelineItems.length === 0 ? (
          <div className="card" style={{ marginTop: 14, padding: 16 }}>
            <div style={{ fontWeight: 900 }}>No updates yet</div>
            <div style={{ marginTop: 6, color: "rgba(15,23,42,0.65)", fontSize: 13 }}>
              This journal link is active but the project has no entries yet.
            </div>
          </div>
        ) : (
          <div className="timeline">
            {timelineItems.map((item) => {
              if (item.kind === "approval") {
                const approval = item.approval;

                return (
                  <div key={`approval-${approval.id}`} className="card entry">
                    <div className="entryAccent" />
                    <div className="entryBody">
                      <div className="entryTop">
                        <div className="entryDate">
                          {approval.sent_at || approval.created_at
                            ? formatDate(
                              approval.sent_at || approval.created_at,
                              approval.created_timezone_offset_minutes
                            )
                            : ""}
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 900,
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid rgba(37,99,235,0.18)",
                            background: "rgba(37,99,235,0.10)",
                            color: "#1d4ed8",
                            textTransform: "lowercase",
                          }}
                        >
                          {approval.archived_at
                            ? `${approval.status || "approval"} • archived`
                            : approval.status || "approval"}
                        </div>
                      </div>

                      <div className="content">
                        <div style={{ fontWeight: 900, marginBottom: 6 }}>
                          Approval Request{approval.title ? ` — ${approval.title}` : ""}
                        </div>

                        <div
                          style={{
                            color: "rgba(15,23,42,0.72)",
                            fontSize: 14,
                            marginBottom: 8,
                          }}
                        >
                          Type: {approval.approval_type || "Approval"}
                        </div>

                        {approval.description ? (
                          <div style={{ marginBottom: 8 }}>{approval.description}</div>
                        ) : null}

                        <div style={{ color: "rgba(15,23,42,0.72)", fontSize: 14 }}>
                          Cost impact: {approval.cost_delta != null ? `$${approval.cost_delta}` : "None"}
                        </div>

                        <div style={{ color: "rgba(15,23,42,0.72)", fontSize: 14 }}>
                          Schedule impact: {approval.schedule_delta || "None"}
                        </div>
                        {approval.attachments?.length ? (
                          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                            <div
                              style={{
                                color: "rgba(15,23,42,0.72)",
                                fontSize: 13,
                                fontWeight: 700,
                              }}
                            >
                              Attachments
                            </div>

                            {approval.attachments.map((attachment: any) => (
                              <a
                                key={attachment.id}
                                href={`/api/attachments/open?id=${attachment.id}&kind=approval`}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: "block",
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  background: "rgba(37,99,235,0.06)",
                                  color: "#1d4ed8",
                                  textDecoration: "none",
                                  fontWeight: 600,
                                  fontSize: 14,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {attachment.filename || "Attachment"}
                              </a>
                            ))}
                          </div>
                        ) : null}
                        {approval.responded_at ? (
                          <div
                            style={{
                              color: "rgba(15,23,42,0.72)",
                              fontSize: 14,
                              marginTop: 6,
                            }}
                          >
                            Responded: {formatDate(
                              approval.responded_at,
                              approval.created_timezone_offset_minutes
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              }

              const entry = item.entry;
              const atts = attachmentsByProof[entry.id] || [];
              const images = atts.filter((a) => a.kind === "image" && a.signedUrl);
              const pdfs = atts.filter((a) => a.kind === "pdf" && a.signedUrl);
              const others = atts.filter((a) => a.kind === "other" && a.signedUrl);

              return (
                <div key={entry.id} className="card entry">
                  <div className="entryAccent" />
                  <div className="entryBody">
                    <div className="entryTop">
                      <div className="entryDate">
                        {entry.created_at
                          ? formatDate(
                            entry.created_at,
                            entry.created_timezone_offset_minutes
                          )
                          : ""}
                      </div>

                      {entry.locked_at ? (
                        <div
                          className="badgeFinal"
                          title={`Finalized ${formatDate(
                            entry.locked_at,
                            entry.created_timezone_offset_minutes
                          )}`}
                        >
                          ✅ Finalized
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 900,
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid rgba(245,158,11,0.22)",
                            background: "rgba(245,158,11,0.12)",
                            color: "#b45309",
                            textTransform: "lowercase",
                          }}
                        >
                          draft
                        </div>
                      )}
                    </div>

                    {entry.content ? <div className="content">{entry.content}</div> : null}

                    <div className="metaRow">
                      <div>Entry #{entry.id}</div>
                      <div>•</div>
                      <div>{atts.length} file{atts.length === 1 ? "" : "s"}</div>
                      {images.length ? (
                        <>
                          <div>•</div>
                          <div>{images.length} photo{images.length === 1 ? "" : "s"}</div>
                        </>
                      ) : null}
                      {pdfs.length ? (
                        <>
                          <div>•</div>
                          <div>{pdfs.length} pdf{pdfs.length === 1 ? "" : "s"}</div>
                        </>
                      ) : null}
                    </div>

                    {images.length > 0 ? (
                      <>
                        <div className="sectionLabel">Photos</div>
                        <div className="imgGrid">
                          {images.map((img) => (
                            <a
                              key={img.id}
                              className="imgCard"
                              href={img.signedUrl || "#"}
                              target="_blank"
                              rel="noreferrer"
                              title={img.filename || "Open photo"}
                            >
                              <img
                                className="img"
                                src={img.signedUrl || ""}
                                alt={img.filename || "Photo"}
                                loading="lazy"
                              />
                              <div className="imgCaption">{img.filename || "Photo"}</div>
                            </a>
                          ))}
                        </div>
                      </>
                    ) : null}

                    {pdfs.length > 0 ? (
                      <>
                        <div className="sectionLabel">PDFs</div>
                        <div className="fileList">
                          {pdfs.map((pdf) => (
                            <a
                              key={pdf.id}
                              className="fileChip"
                              href={pdf.signedUrl || "#"}
                              target="_blank"
                              rel="noreferrer"
                              title="Open PDF"
                            >
                              <div className="fileLeft">
                                <div className="name">📄 {pdf.filename || "Document.pdf"}</div>
                                <div className="meta">Open attached PDF</div>
                              </div>
                              <div className="cta">Open</div>
                            </a>
                          ))}
                        </div>
                      </>
                    ) : null}

                    {others.length > 0 ? (
                      <>
                        <div className="sectionLabel">Files</div>
                        <div className="fileList">
                          {others.map((f) => (
                            <a
                              key={f.id}
                              className="fileChip"
                              href={f.signedUrl || "#"}
                              target="_blank"
                              rel="noreferrer"
                              title="Open file"
                            >
                              <div className="fileLeft">
                                <div className="name">📎 {f.filename || "File"}</div>
                                <div className="meta">Open attached file</div>
                              </div>
                              <div className="cta">Open</div>
                            </a>
                          ))}
                        </div>
                      </>
                    ) : null}

                    {atts.length > 0 && atts.every((a) => !a.signedUrl) ? (
                      <div className="emptyNote">
                        Files exist but can’t be displayed yet. Check storage bucket name and file paths.
                      </div>
                    ) : null}

                    {atts.length === 0 ? (
                      <div className="emptyNote">No files attached to this entry.</div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="foot">
          Powered by <b>BuildProof</b> • This journal is shared read-only • Link access can be revoked by the contractor.
        </div>
      </div>
    </div>
  );
}