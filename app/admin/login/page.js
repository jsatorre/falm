"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se ha podido entrar");
        return;
      }
      router.push(searchParams.get("from") || "/admin");
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-xs flex-1 flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-neon-purple">FALM</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight">Admin</h1>
      </div>
      <form onSubmit={entrar} className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-background-elevated p-5">
        <input
          autoFocus
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-center outline-none focus:border-neon-purple"
        />
        {error && <p className="text-center text-xs text-neon-pink">{error}</p>}
        <button
          type="submit"
          disabled={enviando || !password}
          className="w-full rounded-xl bg-neon-purple px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-40"
        >
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}
