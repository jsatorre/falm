"use client";

import { useEffect, useState } from "react";

const COLORES = ["var(--neon-purple)", "var(--neon-green)", "var(--neon-orange)", "var(--neon-pink)"];

// Se generan las piezas en el cliente tras montar (no en el render inicial)
// para no arrastrar valores aleatorios distintos entre servidor y cliente
// y provocar un mismatch de hidratación.
export default function Confetti({ pieces = 26 }) {
  const [piezas, setPiezas] = useState([]);

  useEffect(() => {
    setPiezas(
      Array.from({ length: pieces }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        duration: 2.6 + Math.random() * 1.8,
        color: COLORES[i % COLORES.length],
        rotate: Math.random() * 360,
      }))
    );
  }, [pieces]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {piezas.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}
