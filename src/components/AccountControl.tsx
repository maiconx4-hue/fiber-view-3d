import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { LogIn, LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export function AccountControl() {
  const { user, loading } = useAuth();
  const { queryClient } = useRouteContext({ from: "__root__" });
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function signOut() {
    setBusy(true);
    setError(false);
    await queryClient.cancelQueries();
    queryClient.clear();
    const result = await supabase.auth.signOut();
    if (result.error) { setError(true); setBusy(false); return; }
    await navigate({ to: "/auth", replace: true });
  }
  return <div className="account-control">
    {user ? <><span className="account-email" title={user.email}>{user.email}</span><Button variant="outline" size="sm" disabled={busy} onClick={signOut}><LogOut />{busy ? "Saindo…" : "Sair"}</Button></> : <Button asChild variant="outline" size="sm" disabled={loading}><Link to="/auth"><LogIn />Entrar</Link></Button>}
    {error && <span role="alert">Não foi possível sair. Tente novamente.</span>}
  </div>;
}