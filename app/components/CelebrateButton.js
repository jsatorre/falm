"use client";

import { useState } from "react";
import Confetti from "./Confetti";

export default function CelebrateButton({ label = "🎉 Celebrar" }) {
  const [celebrando, setCelebrando] = useState(false);

  function celebrar() {
    setCelebrando(true);
    setTimeout(() => setCelebrando(false), 3200);
  }

  return (
    <>
      {celebrando && <Confetti />}
      <button
        type="button"
        onClick={celebrar}
        className="rounded-full border border-neon-orange/60 px-3 py-1.5 text-xs font-semibold text-neon-orange transition hover:bg-neon-orange/10"
      >
        {label}
      </button>
    </>
  );
}
