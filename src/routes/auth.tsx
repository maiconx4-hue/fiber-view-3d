import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth, authError, isAllowedEmail } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "Acesso restrito — FTTH Vision" },
    { name: "description", content: "Área restrita do FTTH Vision. Acesso somente para a conta autorizada." },
    { property: "og:title", content: "Acesso restrito — FTTH Vision" },
    { property: "og:description", content: "Entre com a conta autorizada do FTTH Vision." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: AuthPage,
});

const DENIED = "Esta conta não tem acesso ao sistema.";

function AuthPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!user) return;
    if (isAllowedEmail(user.email)) void navigate({ to: "/", replace: true });
    else { setError(DENIED); void supabase.auth.signOut(); }
  }, [user, navigate]);
  function changeMode(next: typeof mode) { setMode(next); setError(""); setNotice(""); setPassword(""); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    const addr = email.trim();
    if (mode === "forgot") {
      setBusy(true);
      try {
        // Só envia para a conta autorizada; a mensagem é neutra para não revelar contas.
        if (isAllowedEmail(addr)) {
          const r = await supabase.auth.resetPasswordForEmail(addr, { redirectTo: `${window.location.origin}/reset-password` });
          if (r.error) { setError(authError(r.error.message)); return; }
        }
        setNotice("Se este e-mail tiver acesso, você receberá um link para redefinir a senha.");
      } catch { setError("Não foi possível conectar. Tente novamente."); }
      finally { setBusy(false); }
      return;
    }
    if (!isAllowedEmail(addr)) { setError(DENIED); return; }
    setBusy(true);
    try {
      const r = await supabase.auth.signInWithPassword({ email: addr, password });
      if (r.error) setError(authError(r.error.message));
      else if (!isAllowedEmail(r.data.user?.email)) { await supabase.auth.signOut(); setError(DENIED); }
      else await navigate({ to: "/", replace: true });
    } catch { setError("Não foi possível conectar. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-content">
    <div className="brand auth-brand"><span className="brand-mark">{[1,2,3,4,5,6].map(i => <i key={i} />)}</span><h1>FTTH Vision</h1></div>
    <h2 className="flex items-center gap-2 text-2xl font-semibold"><Lock className="size-5" />{mode === "forgot" ? "Redefinir senha" : "Acesso restrito"}</h2>
    <p className="mt-1 text-sm text-muted-foreground">Somente a conta autorizada pode entrar. Não há cadastro público.</p>
    <form onSubmit={submit} className="mt-6 grid gap-4">
      <label className="grid gap-2 text-sm">E-mail<Input autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} /></label>
      {mode === "signin" && <label className="grid gap-2 text-sm">Senha<Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={busy} /></label>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
      <Button disabled={busy} type="submit">{busy && <LoaderCircle className="animate-spin" />}{mode === "forgot" ? "Enviar link" : "Entrar"}</Button>
    </form>
    <Button variant="link" className="mt-2 px-0" disabled={busy} onClick={() => changeMode(mode === "signin" ? "forgot" : "signin")}>{mode === "signin" ? "Esqueci minha senha" : "Voltar para entrar"}</Button>
  </section></main>;
}
