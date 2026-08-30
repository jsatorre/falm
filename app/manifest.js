export default function manifest() {
  return {
    name: "FALM",
    short_name: "FALM",
    description: "Clasificación, jornada en directo, fichajes y draft de la liga FALM.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b12",
    theme_color: "#0b0b12",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
    ],
  };
}
