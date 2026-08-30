import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      // iOS ya redondea las esquinas él solo, así que aquí sin
      // border-radius — si lo redondeamos nosotros también, sale un doble
      // borde feo.
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #a855f7 0%, #ff2fb0 55%, #22ff9a 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "72%",
            height: "72%",
            background: "#0b0b12",
            borderRadius: 28,
          }}
        >
          <span style={{ color: "#ffffff", fontSize: 94, fontWeight: 900 }}>F</span>
        </div>
      </div>
    ),
    size
  );
}
