import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isAllowedEmail } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", replace: true });
    if (!isAllowedEmail(data.user.email)) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth", replace: true });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
