// Sprout, the Nomi pet: a soft seedling in a teal pot, drawn like the demo mockups (no outlines, a drop
// shadow). Mood sets the face for the moment; health (0 to 100, see health.ts) sets the plant: wilted and
// olive, healthy, or grown tall with a flower. A reaction plays once when health changes: "grow" when you
// follow through on a plan, "wilt" when you skip. Plain SVG, animated by sprout.css.
import "./sprout.css";
import { stageOf, type Stage } from "./health";

export type PetMood = "neutral" | "listening" | "happy" | "worried" | "busy" | "celebrating";

export const SPROUT_LINES: Record<PetMood, string> = {
  neutral: "hey, how'd today go?",
  listening: "tell me everything, I'm soaking it up",
  happy: "you grew a little today. I can tell",
  worried: "bit of a dry day. let's find you some sun",
  busy: "putting down roots for you…",
  celebrating: "bloom! it worked",
};

const INK = "#2c2a26";
const CHEEK = "#f4a6a0";
const face = { fill: "none", stroke: INK, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

type Look = "wilt" | "ok" | "grown";
const LOOK: Record<Stage, Look> = { wilting: "wilt", droopy: "wilt", healthy: "ok", thriving: "ok", blooming: "grown" };
const PALETTE: Record<Look, { body: string; belly: string; pot: string; rim: string }> = {
  wilt: { body: "#c9cfa4", belly: "#dde0c4", pot: "#5f8f8b", rim: "#74a3a0" },
  ok: { body: "#c6e3a0", belly: "#d8edbb", pot: "#3f9c97", rim: "#4fb3ad" },
  grown: { body: "#c6e3a0", belly: "#d8edbb", pot: "#3f9c97", rim: "#4fb3ad" },
};

function Leaves({ look, stage, mood }: { look: Look; stage: Stage; mood: PetMood }) {
  if (look === "wilt" || (mood === "worried" && stage !== "thriving"))
    return (
      <g className="sprout-leaves">
        <path d="M60 48 Q 62 40, 68 38" stroke="#8a9a5a" strokeWidth={3} fill="none" strokeLinecap="round" />
        <path d="M58 48 C 46 46, 34 54, 32 64 C 44 62, 54 56, 58 48 Z" fill={stage === "wilting" ? "#a9b86e" : "#9dbf74"} />
        <path d="M68 38 C 80 40, 88 52, 86 60 C 76 56, 70 48, 68 38 Z" fill={stage === "wilting" ? "#98a861" : "#8fb468"} />
      </g>
    );
  if (look === "grown" || mood === "celebrating")
    return (
      <g className="sprout-leaves">
        <path d="M60 46 L 60 16" stroke="#4f9a4a" strokeWidth={3.5} strokeLinecap="round" />
        <path d="M60 40 C 46 22, 22 22, 16 32 C 26 46, 46 46, 60 40 Z" fill="#7cc576" />
        <path d="M60 40 C 74 22, 98 22, 104 32 C 94 46, 74 46, 60 40 Z" fill="#5fb35a" />
        <path d="M60 26 C 50 14, 36 14, 32 20 C 38 30, 50 30, 60 26 Z" fill="#8fd488" />
        <g className="sprout-bloom">
          <circle cx={60} cy={12} r={7} fill="#f7c948" />
          <circle cx={60} cy={12} r={3} fill="#e8893a" />
        </g>
      </g>
    );
  return (
    <g className="sprout-leaves">
      {stage === "thriving" && <path d="M60 44 C 56 30, 60 20, 66 16 C 70 26, 68 36, 60 44 Z" fill="#8fd488" />}
      <path d="M60 46 C 50 26, 30 24, 24 32 C 32 44, 48 48, 60 46 Z" fill="#7cc576" />
      <path d="M60 46 C 70 24, 92 22, 98 30 C 90 44, 72 48, 60 46 Z" fill="#5fb35a" />
      <path d="M60 46 L 60 56" stroke="#4f9a4a" strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

function Eyes({ mood, look }: { mood: PetMood; look: Look }) {
  if (mood === "worried" || (look === "wilt" && mood === "neutral"))
    return (
      <>
        <path {...face} d="M45 75 Q 49 72, 53 75" />
        <path {...face} d="M67 75 Q 71 72, 75 75" />
      </>
    );
  if (mood === "happy" || mood === "celebrating")
    return (
      <>
        <path {...face} d="M44 76 Q 49 69, 54 76" />
        <path {...face} d="M66 76 Q 71 69, 76 76" />
      </>
    );
  const r = mood === "listening" ? 5.4 : 4.5;
  const dy = mood === "busy" ? -1.5 : 0;
  return (
    <g className="sprout-blink">
      {[49, 71].map((x) => (
        <g key={x}>
          <circle cx={x} cy={74 + dy} r={r} fill={INK} />
          <circle cx={x + 1.5} cy={72.5 + dy} r={1.4} fill="#fff" />
        </g>
      ))}
    </g>
  );
}

function Mouth({ mood, look }: { mood: PetMood; look: Look }) {
  if (mood === "worried" || (look === "wilt" && mood === "neutral")) return <path {...face} d="M55 87 Q 60 83, 65 87" />;
  if (mood === "celebrating") return <path d="M53 82 Q 60 94, 67 82 Z" fill="#9c3d55" />;
  if (mood === "listening") return <ellipse cx={60} cy={85} rx={2.6} ry={3.2} fill="#9c3d55" />;
  if (mood === "busy") return <path {...face} d="M56 85 L 64 84" />;
  return <path {...face} d={`M55 83 Q 60 ${mood === "happy" || look === "grown" ? 91 : 88}, 65 83`} />;
}

function Sparkle({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <path
      className="sprout-twinkle"
      fill="#f7c948"
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
const CONFETTI_COLORS = ["#f08a5d", "#f7c948", "#5fb35a", "#7b8cff", "#f4a6a0"];

function Extras({ mood }: { mood: PetMood }) {
  switch (mood) {
    case "happy":
      return (
        <>
          <Sparkle x={104} y={50} r={6} />
          <Sparkle x={14} y={60} r={4.5} />
        </>
      );
    case "worried":
      return <path className="sprout-drop" d="M96 56C100 62 102 65 96 68C90 65 92 62 96 56Z" fill="#8ed1fc" />;
    case "listening":
      return (
        <>
          <path {...face} stroke="#6d6a64" className="sprout-wave" d="M100 66Q105 74 100 82" />
          <path {...face} stroke="#6d6a64" className="sprout-wave sprout-wave-2" d="M106 61Q113 74 106 87" />
        </>
      );
    case "busy":
      return (
        <>
          <circle cx={90} cy={46} r={2.5} fill="#fff" />
          <circle cx={96} cy={39} r={3.5} fill="#fff" />
          <ellipse cx={104} cy={26} rx={15} ry={10} fill="#fff" />
          {[98, 104, 110].map((x, i) => (
            <circle key={x} className="sprout-dot" style={{ animationDelay: `${i * 0.2}s` }} cx={x} cy={27} r={1.9} fill={INK} />
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

export type SproutReaction = "grow" | "wilt" | null;

export function Sprout({
  mood,
  size = 96,
  className = "",
  health = 60,
  reaction = null,
  still = false,
}: {
  mood: PetMood;
  size?: number;
  className?: string;
  health?: number;
  reaction?: SproutReaction;
  still?: boolean; // no idle animation, for small Sprouts in a row
}) {
  const stage = stageOf(health);
  const look = LOOK[stage];
  const c = PALETTE[mood === "worried" && look !== "wilt" ? "wilt" : look];
  const cheek = look === "wilt" || mood === "worried" ? 0.3 : 0.75;

  return (
    <svg
      className={`sprout sprout-${mood} sprout-stage-${stage} ${still ? "sprout-still" : ""} ${reaction ? `sprout-react-${reaction}` : ""} ${className}`}
      width={size}
      height={size * 1.15}
      viewBox="0 0 120 138"
      role="img"
      aria-label={`Sprout looks ${mood}, health ${Math.round(health)} of 100`}
    >
      <ellipse className="sprout-shadow" cx={60} cy={134} rx={28} ry={3.5} fill="#000" opacity={0.12} />
      <g className="sprout-body">
        <Leaves look={look} stage={stage} mood={mood} />
        <ellipse cx={60} cy={78} rx={30} ry={26} fill={c.body} />
        <ellipse cx={60} cy={84} rx={18} ry={12} fill={c.belly} />
        <Eyes mood={mood} look={look} />
        <circle cx={42} cy={84} r={4} fill={CHEEK} opacity={cheek} />
        <circle cx={78} cy={84} r={4} fill={CHEEK} opacity={cheek} />
        <Mouth mood={mood} look={look} />
        <path d="M28 100 H 92 L 86 132 H 34 Z" fill={c.pot} />
        <rect x={24} y={96} width={72} height={10} rx={4} fill={c.rim} />
      </g>
      <Extras mood={mood} />
      {reaction === "grow" && (
        <g>
          <circle className="sprout-ring" cx={60} cy={78} r={36} fill="none" stroke="#5fb35a" strokeWidth={3} />
          <Sparkle x={18} y={40} r={6} />
          <Sparkle x={104} y={36} r={7} />
          <Sparkle x={100} y={86} r={4.5} />
          <path className="sprout-rise" d="M14 90l4 -6 4 6M18 84v12" fill="none" stroke="#4f9a4a" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
          <path className="sprout-rise sprout-rise-2" d="M100 62l4 -6 4 6M104 56v12" fill="none" stroke="#4f9a4a" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {reaction === "wilt" && (
        <g>
          <path className="sprout-leaf-fall" d="M84 40C88 33 96 32 101 36C97 41 90 42 84 40Z" fill="#a9b86e" />
          <path className="sprout-drop" d="M28 60C32 66 34 69 28 72C22 69 24 66 28 60Z" fill="#8ed1fc" />
        </g>
      )}
    </svg>
  );
}
