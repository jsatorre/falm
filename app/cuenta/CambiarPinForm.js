"use client";

import { useState } from "react";

export default function CambiarPinForm() {
  const [pinActual, setPinActual] = useState("");
  const [pinNuevo, setPinNuevo] = useState("");
  const [pinRepetido, setPinRepetido] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [guardado, setGuardado] = useState(false);

  async function guardar(e) {
    e.preventDefault();
    setError(null);
    setGuardado(false);

    if (!/^\d{4}$/.test(pinNuevo)) {
      setError("El PIN nuevo tiene que ser de 4 dígitos");
      return;
    }
    if (pinNuevo !== pinRepetido) {
      setError("El PIN nuevo no coincide en los dos campos");
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch("/api/auth/cambiar-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinActual, pinNuevo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se ha podido cambiar el PIN");
        return;
      }
      setGuardado(true);
      setPinActual("");
      setPinNuevo("");
      setPinRepetido("");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-3">
      <Campo label="PIN actual" value={pinActual} onChange={setPinActual} />
      <Campo label="PIN nuevo (4 dígitos)" value={pinNuevo} onChange={setPinNuevo} />
      <Campo label="Repite el PIN nuevo" value={pinRepetido} onChange={setPinRepetido} />

      <button
        type="submit"
        disabled={enviando}
        className="mt-1 rounded-xl bg-neon-green px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-40"
      >
        {enviando ? "Guardando…" : guardado ? "¡PIN cambiado! ✅" : "Cambiar PIN"}
      </button>

      {error && <p className="text-xs text-neon-pink">{error}</p>}

      <p className="text-xs text-muted">
        Si se te olvida, ya no hay forma de recuperarlo (se guarda cifrado) — pídele al admin que
        te lo resetee desde /admin.
      </p>
    </form>
  );
}

function Campo({ label, value, onChange }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        maxLength={4}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className="rounded-xl border border-border bg-background px-4 py-2.5 tracking-[0.3em] outline-none focus:border-neon-green"
      />
    </label>
  );
}
