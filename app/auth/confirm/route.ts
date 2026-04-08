import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

function normalizeNextPath(value: string | null) {
  if (!value || !value.startsWith("/")) {
    return "/";
  }

  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const next = normalizeNextPath(requestUrl.searchParams.get("next"));
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/auth?message=请先配置 Supabase 环境变量。", request.url));
  }

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/auth?message=邮箱确认链接无效或已过期。", request.url));
}
