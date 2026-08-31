"use client";

import { useLinkStatus } from "next/link";

// Punto que aparece junto a un <Link> mientras la navegación está en
// curso — para que quede claro que el clic ya se ha registrado y no haga
// falta pulsar varias veces (la carga de cada pestaña tarda un poco, al
// traer datos frescos de Supabase/Biwenger en el servidor).
export default function NavLoadingHint() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`link-hint ${pending ? "is-pending" : ""}`} />;
}
