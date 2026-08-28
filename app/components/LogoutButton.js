"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function salir() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={salir}
      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:border-neon-pink hover:text-neon-pink"
    >
      Salir
    </button>
  );
}
