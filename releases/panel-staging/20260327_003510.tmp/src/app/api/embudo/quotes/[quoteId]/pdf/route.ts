"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type QuoteSignedUrlPayload = {
  url?: string;
  expires_in?: number;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ quoteId: string }> },
) {
  const { quoteId } = await params;
  if (!quoteId) {
    return NextResponse.json({ error: "Falta quoteId." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const expiresIn = searchParams.get("expires_in");

  const response = await callCrmApi<QuoteSignedUrlPayload>(
    `/crm/quotes/${quoteId}/pdf`,
    {
      searchParams: expiresIn ? { expires_in: expiresIn } : undefined,
      withUserToken: true,
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error },
      { status: response.status ?? 502 },
    );
  }

  if (!response.data?.url) {
    return NextResponse.json(
      { error: "quote_pdf_unavailable" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    url: response.data.url,
    expires_in: response.data.expires_in,
  });
}
