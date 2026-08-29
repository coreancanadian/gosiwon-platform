/**
 * Illustrated tile artwork.
 *
 * Photography would be better, but licensed photos of 28 districts, stations
 * and campuses are not something we have — and a set of mismatched stock images
 * looks worse than one coherent illustrated system. So each tile gets a scene
 * chosen for what the place is actually known for: 관악 gets 관악산, 종로 gets a
 * palace roof, 송파 gets a tapered tower, subway tiles get their real line
 * colours.
 *
 * Everything here is deterministic — no counters, no randomness — because a
 * gradient id that differs between server and client is a hydration mismatch,
 * which we have already been bitten by once.
 */

export type Scene =
  | "skyline"
  | "tower"
  | "palace"
  | "mountain"
  | "river"
  | "campus"
  | "subway";

interface Palette {
  skyTop: string;
  skyBottom: string;
  far: string;
  mid: string;
  near: string;
  accent: string;
}

/** Warm dusk through cool night, picked per tile so the grid varies. */
const PALETTES: Palette[] = [
  { skyTop: "#1e3a8a", skyBottom: "#7c3aed", far: "#4c1d95", mid: "#312e81", near: "#1e1b4b", accent: "#fbbf24" },
  { skyTop: "#0c4a6e", skyBottom: "#0891b2", far: "#155e75", mid: "#164e63", near: "#083344", accent: "#fde68a" },
  { skyTop: "#7c2d12", skyBottom: "#ea580c", far: "#9a3412", mid: "#7c2d12", near: "#431407", accent: "#fed7aa" },
  { skyTop: "#134e4a", skyBottom: "#0d9488", far: "#115e59", mid: "#134e4a", near: "#042f2e", accent: "#99f6e4" },
  { skyTop: "#4c0519", skyBottom: "#be123c", far: "#881337", mid: "#4c0519", near: "#2c0410", accent: "#fecdd3" },
  { skyTop: "#1e293b", skyBottom: "#475569", far: "#334155", mid: "#1e293b", near: "#0f172a", accent: "#e2e8f0" },
];

/** Stable hash so a slug always gets the same palette. */
function hash(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Official Seoul-metro line colours, so a station tile reads as its own line. */
export const LINE_COLOURS: Record<string, string> = {
  "1호선": "#0052A4",
  "2호선": "#00A84D",
  "3호선": "#EF7C1C",
  "4호선": "#00A5DE",
  "5호선": "#996CAC",
  "6호선": "#CD7C2F",
  "7호선": "#747F00",
  "8호선": "#E6186C",
  "9호선": "#BDB092",
  신분당선: "#D4003B",
  공항철도: "#0090D2",
  경의중앙선: "#77C4A3",
  수인분당선: "#F5A200",
  신림선: "#6789CA",
  "GTX-A": "#9A6292",
  경춘선: "#0C8E72",
  대경선: "#0052A4",
  "대구1호선": "#D93F5C",
  "대구2호선": "#00A84D",
  "부산1호선": "#F06A00",
  "부산2호선": "#81BF48",
  "광주1호선": "#009088",
  "대전1호선": "#007448",
};

function Sky({ id, p }: { id: string; p: Palette }) {
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.skyTop} />
          <stop offset="100%" stopColor={p.skyBottom} />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${id})`} />
    </>
  );
}

/** Windows on a building — deterministic pattern, no randomness. */
function windows(x: number, y: number, w: number, h: number, seed: number) {
  const cells = [];
  const cols = Math.max(1, Math.floor(w / 12));
  const rows = Math.max(1, Math.floor(h / 16));
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      // Deterministic "lit window" pattern from the seed.
      if ((c * 7 + r * 13 + seed) % 5 < 2) continue;
      cells.push(
        <rect
          key={`${c}-${r}`}
          x={x + 5 + c * 12}
          y={y + 6 + r * 16}
          width="5"
          height="7"
          fill="#fef3c7"
          opacity="0.75"
        />,
      );
    }
  }
  return cells;
}

function Skyline({ p, seed }: { p: Palette; seed: number }) {
  const towers = [
    { x: 20, w: 46, h: 130 },
    { x: 72, w: 34, h: 96 },
    { x: 112, w: 54, h: 168 },
    { x: 172, w: 38, h: 112 },
    { x: 216, w: 48, h: 148 },
    { x: 270, w: 36, h: 92 },
    { x: 312, w: 52, h: 134 },
  ];
  return (
    <>
      <circle cx="330" cy="62" r="26" fill={p.accent} opacity="0.35" />
      {towers.map((t, i) => (
        <g key={t.x}>
          <rect
            x={t.x}
            y={300 - t.h}
            width={t.w}
            height={t.h}
            fill={i % 2 ? p.mid : p.near}
            rx="2"
          />
          {windows(t.x, 300 - t.h, t.w, t.h - 20, seed + i)}
        </g>
      ))}
      <rect y="288" width="400" height="12" fill={p.near} />
    </>
  );
}

function Tower({ p, seed }: { p: Palette; seed: number }) {
  return (
    <>
      <circle cx="86" cy="64" r="24" fill={p.accent} opacity="0.35" />
      {/* Low-rise backdrop */}
      {[
        { x: 12, w: 46, h: 74 },
        { x: 62, w: 38, h: 58 },
        { x: 286, w: 44, h: 66 },
        { x: 336, w: 52, h: 86 },
      ].map((b) => (
        <g key={b.x}>
          <rect x={b.x} y={300 - b.h} width={b.w} height={b.h} fill={p.far} rx="2" />
          {windows(b.x, 300 - b.h, b.w, b.h - 16, seed)}
        </g>
      ))}
      {/* Tapered landmark */}
      <path d="M175 300 L186 96 L214 96 L225 300 Z" fill={p.near} />
      <path d="M186 96 L200 40 L214 96 Z" fill={p.mid} />
      <rect x="196" y="14" width="8" height="30" fill={p.accent} opacity="0.8" />
      <circle cx="200" cy="12" r="6" fill={p.accent} />
      {windows(178, 120, 44, 150, seed + 3)}
      <rect y="288" width="400" height="12" fill={p.near} />
    </>
  );
}

/** Upturned eaves of a 한옥 / palace hall — 경복궁, 종로. */
function Palace({ p }: { p: Palette }) {
  return (
    <>
      <circle cx="326" cy="54" r="26" fill={p.accent} opacity="0.38" />
      {/* Upper roof: strong sweep, tips lifted well clear of the body */}
      <path
        d="M14 150 C60 112 120 96 200 96 C280 96 340 112 386 150
           C330 128 268 118 200 118 C132 118 70 128 14 150 Z"
        fill={p.mid}
      />
      {/* Ridge */}
      <rect x="150" y="90" width="100" height="9" rx="4" fill={p.accent} opacity="0.7" />
      {/* Lower roof */}
      <path
        d="M34 200 C84 168 138 156 200 156 C262 156 316 168 366 200
           C316 182 262 174 200 174 C138 174 84 182 34 200 Z"
        fill={p.far}
      />
      {/* Body + columns */}
      <rect x="70" y="204" width="260" height="58" fill={p.near} opacity="0.9" />
      {[86, 128, 170, 212, 254, 296].map((x) => (
        <rect key={x} x={x} y="204" width="13" height="58" fill={p.mid} rx="2" />
      ))}
      <rect x="62" y="262" width="276" height="9" fill={p.mid} />
      <rect y="286" width="400" height="14" fill={p.near} />
    </>
  );
}

function Mountain({ p }: { p: Palette }) {
  return (
    <>
      <circle cx="308" cy="70" r="30" fill={p.accent} opacity="0.35" />
      <path d="M-10 300 L110 132 L206 300 Z" fill={p.far} />
      <path d="M130 300 L246 108 L360 300 Z" fill={p.mid} />
      <path d="M246 108 L268 145 L224 145 Z" fill="#f8fafc" opacity="0.75" />
      <path d="M270 300 L370 178 L420 300 Z" fill={p.near} />
      <rect y="288" width="400" height="12" fill={p.near} />
    </>
  );
}

function River({ p, seed }: { p: Palette; seed: number }) {
  const far = [
    { x: 4, w: 30, h: 78 },
    { x: 40, w: 24, h: 54 },
    { x: 70, w: 38, h: 96 },
    { x: 114, w: 26, h: 64 },
    { x: 146, w: 34, h: 84 },
    { x: 220, w: 30, h: 70 },
    { x: 256, w: 40, h: 104 },
    { x: 302, w: 28, h: 60 },
    { x: 336, w: 36, h: 88 },
    { x: 378, w: 22, h: 52 },
  ];
  return (
    <>
      <circle cx="70" cy="52" r="22" fill={p.accent} opacity="0.4" />
      {/* Skyline sits high so it survives the title overlay */}
      {far.map((b, i) => (
        <g key={b.x}>
          <rect
            x={b.x}
            y={168 - b.h}
            width={b.w}
            height={b.h}
            fill={i % 2 ? p.mid : p.far}
            rx="2"
          />
          {windows(b.x, 168 - b.h, b.w, b.h - 12, seed + i)}
        </g>
      ))}
      {/* Water */}
      <rect y="168" width="400" height="132" fill={p.far} opacity="0.55" />
      <rect y="168" width="400" height="4" fill={p.accent} opacity="0.35" />
      {/* Bridge deck + arches, above the label band */}
      <rect x="0" y="196" width="400" height="11" fill={p.near} />
      {[10, 108, 206, 304].map((x) => (
        <path
          key={x}
          d={`M${x} 207 q45 -40 90 0`}
          fill="none"
          stroke={p.near}
          strokeWidth="9"
        />
      ))}
      {/* Reflections */}
      {[224, 244, 264].map((y, i) => (
        <rect
          key={y}
          x={30 + i * 84}
          y={y}
          width={140 - i * 26}
          height="4"
          fill={p.accent}
          opacity="0.3"
          rx="2"
        />
      ))}
    </>
  );
}

/** Campus gate: columns, pediment, a tree. Used for universities. */
function Campus({ p, seed }: { p: Palette; seed: number }) {
  return (
    <>
      <circle cx="330" cy="58" r="24" fill={p.accent} opacity="0.32" />
      <rect x="96" y="150" width="208" height="106" fill={p.mid} rx="3" />
      <path d="M84 150 L200 92 L316 150 Z" fill={p.far} />
      {/* Clock / crest */}
      <circle cx="200" cy="128" r="13" fill={p.accent} opacity="0.85" />
      {[112, 152, 192, 232, 272].map((x) => (
        <rect key={x} x={x} y="176" width="18" height="80" fill={p.near} rx="2" />
      ))}
      {windows(104, 156, 190, 20, seed)}
      <rect x="88" y="256" width="224" height="10" fill={p.near} />
      {/* Trees */}
      {[46, 356].map((x) => (
        <g key={x}>
          <rect x={x - 3} y="238" width="6" height="30" fill={p.near} />
          <circle cx={x} cy="226" r="24" fill={p.far} opacity="0.9" />
          <circle cx={x - 12} cy="236" r="16" fill={p.mid} opacity="0.9" />
        </g>
      ))}
      <rect y="266" width="400" height="34" fill={p.near} />
    </>
  );
}

/**
 * Station tile: a route diagram in the line's real colours.
 *
 * The first version drew a train head-on with the line colours striped across
 * its nose — which sat in the bottom third of the tile, exactly where the title
 * gradient and label cover it. The colours are the whole point of a station
 * tile, so they now run across the upper half where nothing overlaps them, in
 * the form every Korean commuter already reads: coloured lines meeting at an
 * interchange node.
 */
function Subway({ p, lines }: { p: Palette; lines: string[] }) {
  const colours = lines
    .map((l) => LINE_COLOURS[l.trim()])
    .filter(Boolean)
    .slice(0, 4);
  const bars = colours.length > 0 ? colours : [p.accent];

  // Lines fan out around the interchange so several are legible at once.
  const spread = 30;
  const baseY = 120 - ((bars.length - 1) * spread) / 2;

  return (
    <>
      <rect width="400" height="300" fill={p.near} opacity="0.2" />

      {bars.map((c, i) => {
        const y = baseY + i * spread;
        return (
          <g key={c + i}>
            <path
              d={`M-10 ${y} L150 ${y} Q200 ${y} 200 120 Q200 ${y} 250 ${y} L410 ${y}`}
              fill="none"
              stroke={c}
              strokeWidth="13"
              strokeLinecap="round"
            />
          </g>
        );
      })}

      {/* Interchange node */}
      <circle cx="200" cy="120" r="27" fill="#ffffff" opacity="0.95" />
      <circle cx="200" cy="120" r="27" fill="none" stroke={bars[0]} strokeWidth="7" />
      <circle cx="200" cy="120" r="9" fill={bars[bars.length - 1]} />

      {/* Platform hint along the bottom, below the label area */}
      <rect y="286" width="400" height="14" fill={p.near} opacity="0.85" />
    </>
  );
}

const SEOUL_SCENES: Record<string, Scene> = {
  "gangnam-gu": "skyline",
  "seocho-gu": "skyline",
  "songpa-gu": "tower",
  "mapo-gu": "river",
  "seodaemun-gu": "campus",
  "gwanak-gu": "mountain",
  "jongno-gu": "palace",
  "jung-gu-seoul": "tower",
  "yeongdeungpo-gu": "river",
  "dongjak-gu": "river",
};

export function sceneFor(kind: "region" | "station" | "university", slug: string): Scene {
  if (kind === "station") return "subway";
  if (kind === "university") return "campus";
  return SEOUL_SCENES[slug] ?? "skyline";
}

export function TileArt({
  kind,
  slug,
  lines = [],
}: {
  kind: "region" | "station" | "university";
  slug: string;
  lines?: string[];
}) {
  const seed = hash(slug);
  const palette = PALETTES[seed % PALETTES.length];
  const scene = sceneFor(kind, slug);
  const gradientId = `sky-${slug}`;

  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
      aria-hidden
      focusable="false"
    >
      <Sky id={gradientId} p={palette} />
      {scene === "skyline" && <Skyline p={palette} seed={seed} />}
      {scene === "tower" && <Tower p={palette} seed={seed} />}
      {scene === "palace" && <Palace p={palette} />}
      {scene === "mountain" && <Mountain p={palette} />}
      {scene === "river" && <River p={palette} seed={seed} />}
      {scene === "campus" && <Campus p={palette} seed={seed} />}
      {scene === "subway" && <Subway p={palette} lines={lines} />}
    </svg>
  );
}
