export const THEME = {
  colors: {
    hook: "#000000",
    body: "#0D1B2A",
    cta: "#000000",
    text: "#ffffff",
    accent: "#39FF14",
    muted: "rgba(255,255,255,0.65)",
    accentSoft: "#ADFF2F",
  },

  fonts: {
    main: "Orbitron",
    accent: "AlfenaPixel",
    sizeHero: "72px",
    sizeBody: "36px",
    sizeSub: "24px",
    weightBlack: 900,
  },

  // scene01:  00:00–00:03  curiosity     90f
  // scene02:  00:03–00:08  agitation    150f  (+animazione file che prendono polvere)
  // scene03:  00:08–00:14  desire       180f
  // scene04:  00:14–00:21  trust        210f
  // scene05:  00:21–00:25.1 urgency     123f  (CTA: "commenta con: "video"")
  // Total: 753f = 25.1s @ 30fps
  durations: {
    scene01: 90,
    scene02: 150,
    scene03: 180,
    scene04: 210,
    scene05: 123,
    total: 753,
  },

  springs: {
    aggressive: { damping: 6, stiffness: 300 },
    standard: { damping: 12, stiffness: 150 },
    soft: { damping: 18, stiffness: 120 },
    cta: { damping: 8, stiffness: 220 },
  },

  anchor: {
    height: 3,
    color: "#39FF14",
    glow: "0 0 10px #39FF14, 0 0 20px #39FF14",
  },

  timing: {
    fadeOutFrames: 8,
    pulseInterval: 30,
  },
} as const;
