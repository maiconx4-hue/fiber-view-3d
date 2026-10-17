import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { authError } from "@/lib/auth";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "Nova senha — FTTH Vision" }, { name: "description", content: "Defina uma nova senha para sua conta FTTH Vision." },
    { property: "og:title", content: "Redefinir senha — FTTH Vision" }, { property: "og:description", content: "Recupere o acesso à sua conta FTTH Vision." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: ResetPassword,
});

function ResetPassword() {
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    const recovery = new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery" || sessionStorage.getItem("ftth-recovery") === "true";
    if (recovery) void supabase.auth.getUser().then(({ data }) => setValid(Boolean(data.user)));
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (password !== confirm) { setError("As senhas não coincidem."); return; }
    setBusy(true);
    try {
      const { error: failure } = await supabase.auth.updateUser({ password });
      if (failure) setError(authError(failure.message));
      else { setDone(true); sessionStorage.removeItem("ftth-recovery"); }
    } catch { setError("Não foi possível conectar. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-content">
    <h1 className="text-2xl font-semibold">FTTH Vision</h1><h2 className="mt-4 text-xl">Nova senha</h2>
    {done ? <p role="status" className="mt-5">Senha atualizada com sucesso.</p> : valid ? <form onSubmit={submit} className="mt-6 grid gap-4">
      <label className="grid gap-2">Nova senha<Input type="password" autoComplete="new-password" minLength={6} required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></label>
      <label className="grid gap-2">Confirmar senha<Input type="password" autoComplete="new-password" minLength={6} required value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy} /></label>
      {error && <p role="alert" className="text-destructive">{error}</p>}<Button disabled={busy}>{busy ? "Salvando…" : "Salvar nova senha"}</Button>
    </form> : <p className="mt-5 text-muted-foreground">Abra o link de recuperação enviado ao seu e-mail. Se ele expirou, solicite outro.</p>}
    <Button asChild variant="link" className="mt-5"><Link to={done ? "/" : "/auth"}>{done ? "Voltar ao mapa" : "Voltar ao login"}</Link></Button>
  </section></main>;
}