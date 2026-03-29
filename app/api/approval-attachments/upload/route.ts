import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";

function sanitizeFileName(fileName: string) {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(req: Request) {
    try {
        const { user, errorResponse } = await requireUser(req);

        if (errorResponse || !user) {
            return errorResponse;
        }

        const body = await req.json().catch(() => null);
        const approvalId = body?.approvalId;
        const fileName = body?.fileName;

        if (!approvalId || !fileName) {
            return NextResponse.json(
                { error: "approvalId and fileName are required" },
                { status: 400 }
            );
        }

        const { data: approval, error: approvalError } = await supabaseServer
            .from("approval_requests")
            .select("id, project_id, created_by, status")
            .eq("id", approvalId)
            .eq("created_by", user.id)
            .single();

        if (approvalError || !approval) {
            return NextResponse.json(
                { error: "Approval not found" },
                { status: 404 }
            );
        }

        if (approval.status && approval.status !== "draft") {
            return NextResponse.json(
                { error: "Attachments can only be added to draft approvals" },
                { status: 400 }
            );
        }

        const attachmentId = randomUUID();
        const safeFileName = sanitizeFileName(fileName);
        const path = `${user.id}/${approval.project_id}/${approval.id}/${attachmentId}-${safeFileName}`;

        const { data, error } = await supabaseServer.storage
            .from("attachments")
            .createSignedUploadUrl(path);

        if (error || !data?.signedUrl) {
            return NextResponse.json(
                { error: error?.message || "Failed to create signed upload URL" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            uploadUrl: data.signedUrl,
            path,
            attachmentId,
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Upload preparation failed" },
            { status: 500 }
        );
    }
}