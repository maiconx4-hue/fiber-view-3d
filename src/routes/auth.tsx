import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth, authError } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import "@lovable.dev/cloud-auth-js/styles.css";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "Entrar ou criar conta — FTTH Vision" },
    { name: "description", content: "Acesse sua conta no FTTH Vision ou cadastre-se com e-mail, Google ou Lovable." },
    { property: "og:title", content: "Acesso à conta — FTTH Vision" },
    { property: "og:description", content: "Entre ou crie sua conta no FTTH Vision." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: AuthPage,
});

function AuthPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { if (user) void navigate({ to: "/", replace: true }); }, [user, navigate]);
  function changeMode(next: typeof mode) { setMode(next); setError(""); setNotice(""); setPassword(""); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "forgot") {
        const result = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (result.error) setError(authError(result.error.message));
        else setNotice("Se este e-mail estiver cadastrado, você receberá um link para redefinir a senha.");
      } else if (mode === "signup") {
        const result = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } });
        if (result.error) setError(authError(result.error.message));
        else setNotice("Confira seu e-mail e clique no link de confirmação para concluir o cadastro.");
      } else {
        const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (result.error) setError(authError(result.error.message));
        else await navigate({ to: "/", replace: true });
      }
    } catch { setError("Não foi possível conectar. Tente novamente."); }
    finally { setBusy(false); }
  }
  async function social(provider: "google" | "lovable") {
    setBusy(true); setError("");
    try {
      const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
      if (result.error) setError("Não foi possível entrar. Tente novamente.");
      else if (!result.redirected) await navigate({ to: "/", replace: true });
    } catch { setError("Não foi possível conectar. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-content">
    <Button asChild variant="ghost" size="sm"><Link to="/"><ArrowLeft />Voltar ao mapa</Link></Button>
    <div className="brand auth-brand"><span className="brand-mark">{[1,2,3,4,5,6].map(i => <i key={i} />)}</span><h1>FTTH Vision</h1></div>
    <h2 className="text-2xl font-semibold">{mode === "signup" ? "Criar conta" : mode === "forgot" ? "Redefinir senha" : "Entrar na sua conta"}</h2>
    <form onSubmit={submit} className="mt-6 grid gap-4">
      <label className="grid gap-2 text-sm">E-mail<Input autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} /></label>
      {mode !== "forgot" && <label className="grid gap-2 text-sm">Senha<Input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} minLength={mode === "signup" ? 6 : undefined} required disabled={busy} />{mode === "signup" && <span className="text-xs text-muted-foreground">Pelo menos 6 caracteres.</span>}</label>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
      <Button disabled={busy} type="submit">{busy && <LoaderCircle className="animate-spin" />}{mode === "signup" ? "Criar conta" : mode === "forgot" ? "Enviar link" : "Entrar"}</Button>
    </form>
    {mode === "signin" && <Button variant="link" className="mt-2 px-0" disabled={busy} onClick={() => changeMode("forgot")}>Esqueci minha senha</Button>}
    {mode !== "forgot" && <div className="mt-5 grid gap-3 border-t border-border pt-5">
      <Button variant="outline" disabled={busy} onClick={() => social("google")}><span aria-hidden="true" className="font-bold">G</span>Continuar com Google</Button>
      <Button className="lovable-auth-button" disabled={busy} onClick={() => social("lovable")}>Continue with Lovable</Button>
    </div>}
    <div className="mt-5 text-center"><Button variant="link" disabled={busy} onClick={() => changeMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}</Button></div>
  </section></main>;
}