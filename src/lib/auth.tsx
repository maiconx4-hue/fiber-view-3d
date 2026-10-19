import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export const AuthContext = createContext<{ user: User | null; loading: boolean }>({ user: null, loading: true });
export const useAuth = () => useContext(AuthContext);

/** Única conta autorizada. Pode ser sobrescrita por VITE_ALLOWED_EMAIL em outra hospedagem. */
export const ALLOWED_EMAIL = ((import.meta.env.VITE_ALLOWED_EMAIL as string | undefined) || "maicon.x4@gmail.com").trim().toLowerCase();
export const isAllowedEmail = (email?: string | null) => !!email && email.trim().toLowerCase() === ALLOWED_EMAIL;

export function authError(message: string) {
  if (/email address is not allowed/i.test(message)) return "Use um e-mail válido que possa receber o link de confirmação.";
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(message)) return "Confirme seu e-mail antes de entrar.";
  if (/already registered/i.test(message)) return "Este e-mail já está cadastrado.";
  if (/rate limit|too many/i.test(message)) return "Muitas tentativas. Aguarde um pouco e tente novamente.";
  return "Não foi possível concluir. Confira seus dados e tente novamente.";
}
