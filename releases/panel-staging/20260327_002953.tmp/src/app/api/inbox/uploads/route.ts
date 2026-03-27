import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";
import type { InboxAttachment } from "@/lib/inbox/types";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const conversationId = formData.get("conversationId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }

  if (typeof conversationId !== "string" || !conversationId.trim().length) {
    return NextResponse.json({ error: "conversation_required" }, { status: 400 });
  }

  const payload = new FormData();
  payload.append("file", file, file.name);

  const response = await callCrmApi<{ ok: boolean; attachment?: InboxAttachment }>(
    `/crm/inbox/conversations/${conversationId.trim()}/attachments`,
    {
      method: "POST",
      body: payload,
      withUserToken: true,
    },
  );

  if (!response.ok) {
    const status = response.status ?? 500;
    return NextResponse.json({ error: response.error || "upload_failed" }, { status });
  }

  return NextResponse.json(response.data ?? { ok: true });
}
