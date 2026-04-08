"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

function buildAuthRedirect(mode: "signin" | "signup", message: string) {
  return `/auth?mode=${mode}&message=${encodeURIComponent(message)}`;
}

function getValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

export async function signIn(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect(buildAuthRedirect("signin", "请先配置 Supabase 环境变量。"));
  }

  const email = getValue(formData, "email");
  const password = getValue(formData, "password");

  if (!email || !password) {
    redirect(buildAuthRedirect("signin", "请输入邮箱和密码。"));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(buildAuthRedirect("signin", error.message));
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signUp(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect(buildAuthRedirect("signup", "请先配置 Supabase 环境变量。"));
  }

  const email = getValue(formData, "email");
  const password = getValue(formData, "password");

  if (!email || !password) {
    redirect(buildAuthRedirect("signup", "请输入邮箱和密码。"));
  }

  const headerStore = await headers();
  const origin = headerStore.get("origin") ?? "";
  const emailRedirectTo = origin ? `${origin}/auth/confirm?next=/` : undefined;
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: emailRedirectTo
      ? {
          emailRedirectTo,
        }
      : undefined,
  });

  if (error) {
    redirect(buildAuthRedirect("signup", error.message));
  }

  revalidatePath("/", "layout");
  redirect(buildAuthRedirect("signup", "注册成功，请检查邮箱并点击确认链接。"));
}
