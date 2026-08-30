import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #a855f7 0%, #ff2fb0 55%, #22ff9a 100%)",
          borderRadius: 108,
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
            borderRadius: 80,
          }}
        >
          <span style={{ color: "#ffffff", fontSize: 268, fontWeight: 900 }}>F</span>
        </div>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
