import { describe, expect, it } from "vitest";
import { authError } from "@/lib/auth";

describe("Authentication error handling", () => {
  it("identifies accounts that still require email confirmation", () => {
    expect(authError("Email not confirmed")).toBe("Confirme seu e-mail antes de entrar.");
  });
  it("identifies rejected email domains", () => {
    expect(authError("This email address is not allowed.")).toBe("Use um e-mail válido que possa receber o link de confirmação.");
  });
});