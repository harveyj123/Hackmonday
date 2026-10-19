// Sprout, the Nomi pet: a seedling in a pot. Leaves perk up on green days, droop on red ones,
// and a flower blooms when a bot lands something. Plain SVG, animated by sprout.css.
import "./sprout.css";

export type PetMood = "neutral" | "listening" | "happy" | "worried" | "busy" | "celebrating";

export const SPROUT_LINES: Record<PetMood, string> = {
  neutral: "ready for today's check-in?",
  listening: "tell me everything, I'm soaking it up",
  happy: "you grew a little today. I can tell",
  worried: "bit of a dry day. let's find you some sun",
  busy: "putting down roots for you…",
  celebrating: "bloom! it worked",
};

const INK = "#2B2233";
const MOUTH = "#9C3D55";
const CHEEK = "#FF8FA6";

// Leaf angles [left, right] around the stem; negative left / positive right is a droop.
const LEAVES: Record<PetMood, [number, number]> = {
  neutral: [0, 0],
  listening: [6, -16],
  happy: [12, -12],
  worried: [-42, 42],
  busy: [0, 0],
  celebrating: [16, -16],
};

const CHEEKS: Record<PetMood, number> = { neutral: 0.3, listening: 0.4, happy: 0.6, worried: 0, busy: 0.25, celebrating: 0.7 };

const ln = { fill: "none", stroke: INK, strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const thin = { ...ln, strokeWidth: 2.4 };

function Eyes({ mood }: { mood: PetMood }) {
  const cy = 61;
  const xs = [48, 72];
  if (mood === "happy")
    return <>{xs.map((x) => <path key={x} {...ln} d={`M${x - 5} ${cy + 2}Q${x} ${cy - 5} ${x + 5} ${cy + 2}`} />)}</>;
  if (mood === "celebrating")
    return (
      <>
        <path {...ln} d={`M44 ${cy - 4}L51 ${cy}L44 ${cy + 4}`} />
        <path {...ln} d={`M76 ${cy - 4}L69 ${cy}L76 ${cy + 4}`} />
      </>
    );
  const r = mood === "listening" ? 5.4 : mood === "worried" ? 3.5 : 4.1;
  const ry = r * 1.2;
  const dx = mood === "busy" ? 2 : 0;
  const dy = mood === "busy" ? -1.5 : 0;
  return (
    <>
      <g className="sprout-blink">
        {xs.map((x) => (
          <g key={x}>
            <ellipse cx={x + dx} cy={cy + dy} rx={r} ry={ry} fill={INK} />
            <circle cx={x + dx + r * 0.35} cy={cy + dy - ry * 0.4} r={r * 0.38} fill="#fff" />
          </g>
        ))}
      </g>
      {mood === "worried" && (
        <>
          <path {...thin} d={`M42 ${cy - 8}L52 ${cy - 11}`} />
          <path {...thin} d={`M78 ${cy - 8}L68 ${cy - 11}`} />
        </>
      )}
    </>
  );
}

function Mouth({ mood }: { mood: PetMood }) {
  const y = 70;
  const filled = { stroke: INK, strokeWidth: 2.4, strokeLinejoin: "round" } as const;
  switch (mood) {
    case "happy":
      return <path {...filled} fill={MOUTH} d={`M53 ${y - 1}Q60 ${y + 10} 67 ${y - 1}Z`} />;
    case "celebrating":
      return (
        <>
          <path {...filled} fill={MOUTH} d={`M51 ${y - 2}Q60 ${y + 14} 69 ${y - 2}Z`} />
          <path fill={CHEEK} d={`M56 ${y + 4}Q60 ${y + 1} 64 ${y + 4}Q60 ${y + 7} 56 ${y + 4}Z`} />
        </>
      );
    case "worried":
      return <path {...thin} d={`M55 ${y + 4}Q60 ${y - 1} 65 ${y + 4}`} />;
    case "listening":
      return <ellipse cx={60} cy={y + 1} rx={2.6} ry={3.2} fill={MOUTH} stroke={INK} strokeWidth={2} />;
    case "busy":
      return <path {...thin} d={`M56 ${y + 1}L64 ${y}`} />;
    default:
      return <path {...thin} d={`M56 ${y}Q60 ${y + 4} 64 ${y}`} />;
  }
}

function Sparkle({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <path
      className="sprout-twinkle"
      fill="#FFC94A"
      d={`M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`}
    />
  );
}

const CONFETTI = [
  [14, 4, 0],
  [30, 0, 0.5],
  [48, 8, 1.1],
  [74, 2, 0.3],
  [92, 6, 0.8],
  [106, 0, 1.4],
  [22, 10, 1.2],
  [84, 12, 0.15],
];
const CONFETTI_COLORS = ["#FF6B8B", "#FFC94A", "#5CC8A8", "#7B8CFF", "#FF9F43"];

function Extras({ mood }: { mood: PetMood }) {
  switch (mood) {
    case "happy":
      return (
        <>
          <Sparkle x={100} y={34} r={6} />
          <Sparkle x={18} y={46} r={4.5} />
        </>
      );
    case "worried":
      return <path className="sprout-drop" d="M96 46C100 52 102 55 96 58C90 55 92 52 96 46Z" fill="#8ED1FC" stroke={INK} strokeWidth={1.8} />;
    case "listening":
      return (
        <>
          <path {...thin} className="sprout-wave" d="M106 58Q111 66 106 74" />
          <path {...thin} className="sprout-wave sprout-wave-2" d="M112 53Q119 66 112 79" />
        </>
      );
    case "busy":
      return (
        <>
          <circle cx={88} cy={36} r={2.5} fill="#fff" stroke={INK} strokeWidth={1.8} />
          <circle cx={94} cy={29} r={3.5} fill="#fff" stroke={INK} strokeWidth={1.8} />
          <ellipse cx={104} cy={15} rx={15} ry={10} fill="#fff" stroke={INK} strokeWidth={2} />
          {[98, 104, 110].map((x, i) => (
            <circle key={x} className="sprout-dot" style={{ animationDelay: `${i * 0.2}s` }} cx={x} cy={16} r={1.9} fill={INK} />
          ))}
        </>
      );
    case "celebrating":
      return (
        <>
          {CONFETTI.map(([x, y, d], i) => (
            <rect
              key={i}
              className="sprout-confetti"
              style={{ animationDelay: `${d}s` }}
              x={x}
              y={y}
              width={5}
              height={8}
              rx={1.2}
              fill={CONFETTI_COLORS[i % CONFETTI_COLORS.length]}
            />
          ))}
        </>
      );
    default:
      return null;
  }
}

function Leaf({ d, angle, wilted }: { d: string; angle: number; wilted: boolean }) {
  return (
    <g transform={`rotate(${angle} 60 31)`}>
      <path d={d} fill={wilted ? "#A9C79A" : "#7BCB6B"} stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
    </g>
  );
}

export function Sprout({ mood, size = 96, className = "" }: { mood: PetMood; size?: number; className?: string }) {
  const [left, right] = LEAVES[mood];
  const wilted = mood === "worried";
  const cheek = CHEEKS[mood];

  return (
    <svg
      className={`sprout sprout-${mood} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Sprout looks ${mood}`}
    >
      <ellipse className="sprout-shadow" cx={60} cy={112} rx={30} ry={4.5} fill="#1d1a24" opacity={0.14} />
      <g className="sprout-body">
        {mood === "celebrating" && (
          <>
            <path {...ln} d="M60 31L60 20" />
            <g transform="translate(60 16)">
              <g className="sprout-bloom">
                {[0, 60, 120, 180, 240, 300].map((a) => (
                  <circle
                    key={a}
                    cx={Math.cos((a * Math.PI) / 180) * 5}
                    cy={Math.sin((a * Math.PI) / 180) * 5}
                    r={4}
                    fill="#FFC94A"
                    stroke={INK}
                    strokeWidth={1.4}
                  />
                ))}
                <circle r={3} fill={CHEEK} stroke={INK} strokeWidth={1.4} />
              </g>
            </g>
          </>
        )}
        <path {...ln} d="M60 40L60 30" />
        <g className="sprout-leaves">
          <Leaf d="M60 31C52 18 38 16 30 22C36 32 50 35 60 31Z" angle={left} wilted={wilted} />
          <Leaf d="M60 31C68 18 82 16 90 22C84 32 70 35 60 31Z" angle={right} wilted={wilted} />
        </g>
        <ellipse cx={60} cy={64} rx={30} ry={26} fill={wilted ? "#D6E3C8" : "#C9EBA9"} stroke={INK} strokeWidth={3} />
        <path d="M38 58Q40 48 50 43" fill="none" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" opacity={0.7} />
        {cheek > 0 && (
          <>
            <ellipse cx={39} cy={67} rx={5.5} ry={3.2} fill={CHEEK} opacity={cheek} />
            <ellipse cx={81} cy={67} rx={5.5} ry={3.2} fill={CHEEK} opacity={cheek} />
          </>
        )}
        <Eyes mood={mood} />
        <Mouth mood={mood} />
        <path d="M35 92L85 92L79 110L41 110Z" fill="#4AA19C" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        <rect x={30} y={83} width={60} height={10} rx={4} fill="#5FB7B2" stroke={INK} strokeWidth={3} />
      </g>
      <Extras mood={mood} />
    </svg>
  );
}
