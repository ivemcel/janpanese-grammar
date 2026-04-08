import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { signIn, signUp } from "@/app/auth/actions";

type AuthPageProps = {
  searchParams?: Promise<{
    mode?: string;
    message?: string;
  }>;
};

export default async function AuthPage({ searchParams }: AuthPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const mode = params?.mode === "signup" ? "signup" : "signin";
  const message = params?.message;
  const configured = isSupabaseConfigured();

  return (
    <main className="auth-shell">
        <div className="auth-card">
          <div className="auth-header">
            <h1>{mode === "signup" ? "注册" : "登录"}</h1>
          </div>

        {!configured ? (
          <div className="auth-message warning">
            当前还没配置 Supabase。请先在项目根目录创建 <code>.env.local</code>，填入
            <code>NEXT_PUBLIC_SUPABASE_URL</code> 和 <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>。
          </div>
        ) : null}

        {message ? <div className="auth-message">{message}</div> : null}

        <div className="auth-tabs">
          <Link className={mode === "signin" ? "active" : ""} href="/auth?mode=signin">
            登录
          </Link>
          <Link className={mode === "signup" ? "active" : ""} href="/auth?mode=signup">
            注册
          </Link>
        </div>

        {mode === "signup" ? (
          <>
            <form action={signUp} className="auth-form">
              <label className="auth-field">
                <span>邮箱</span>
                <input autoComplete="email" name="email" placeholder="name@example.com" type="email" />
              </label>
              <label className="auth-field">
                <span>密码</span>
                <input
                  autoComplete="new-password"
                  minLength={6}
                  name="password"
                  placeholder="至少 6 位密码"
                  type="password"
                />
              </label>
              <button className="auth-submit" disabled={!configured} type="submit">
                创建账户
              </button>
            </form>
          </>
        ) : (
          <form action={signIn} className="auth-form">
            <label className="auth-field">
              <span>邮箱</span>
              <input autoComplete="email" name="email" placeholder="name@example.com" type="email" />
            </label>
            <label className="auth-field">
              <span>密码</span>
              <input
                autoComplete="current-password"
                name="password"
                placeholder="输入登录密码"
                type="password"
              />
            </label>
            <button className="auth-submit" disabled={!configured} type="submit">
              登录
            </button>
            <p className="auth-hint">登录后会保留 Supabase 会话，后面可以直接接学习进度云同步。</p>
          </form>
        )}

        <Link className="auth-back" href="/">
          ← 返回语法备考首页
        </Link>
      </div>
    </main>
  );
}
