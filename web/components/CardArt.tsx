"use client";

import { useState } from "react";

// Renders a real card image (from the Renaiss Index `imageUrl`) inside a gradient
// frame, falling back to the striped placeholder when there is no image or it fails
// to load (e.g. the labeled commons tier, which has no art). Plain <img> on purpose:
// the blob hosts aren't in next.config remotePatterns, and this matches the existing
// pattern in web/app/value/page.tsx. Identification use only (IP belongs to owners).
export function CardArt({
  src,
  name,
  hue = "linear-gradient(135deg,#ff5fb4,#7b7bff,#3ff0cf)",
  radius = 12,
  pad = 3,
  label,
}: {
  src?: string;
  name?: string;
  hue?: string;
  radius?: number;
  pad?: number;
  label?: string;
}) {
  const [err, setErr] = useState(false);
  const show = !!src && !err;
  const inner = Math.max(0, radius - pad);
  return (
    <div style={{ width: "100%", height: "100%", borderRadius: radius, background: hue, padding: pad }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: inner,
          overflow: "hidden",
          background: "#0b0810",
          backgroundImage: show
            ? undefined
            : "repeating-linear-gradient(45deg,rgba(255,255,255,.06) 0 4px,transparent 4px 8px)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
        }}
      >
        {show ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={name ?? "graded card"}
            onError={() => setErr(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 20,
              letterSpacing: ".04em",
              color: "#f6f2fb",
              textAlign: "center",
              padding: "0 8px 14px",
            }}
          >
            {label ?? name ?? ""}
          </span>
        )}
      </div>
    </div>
  );
}
