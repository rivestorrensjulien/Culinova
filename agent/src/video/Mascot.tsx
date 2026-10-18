/**
 * Mascotte de Culinova : Julien en version chibi (validée par Julien le 18 octobre 2026).
 * Crâne rasé, barbe courte avec la touche grise au menton, yeux bleu-gris, veste de chef
 * (blanche ou noire) avec le drapeau au col et « Julien » brodé, bras croisés, montre.
 * Six expressions : content, waouh, croque, idee, fier, clin.
 */
import type { CSSProperties, ReactNode } from "react";

export type Expression = "content" | "waouh" | "croque" | "idee" | "fier" | "clin";
export type Jacket = "blanche" | "noire";

const INK = "#1f1a16";
const SKIN = "#f3cdb2";
const BEARD = "#5a4638";
const MOUTH = "#6b2a20";
const stroke = { stroke: INK, strokeWidth: 3 } as const;

function Flag({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width={3.4} height={7} fill="#2d4f9e" />
      <rect x={x + 3.4} y={y} width={3.4} height={7} fill="#ffffff" />
      <rect x={x + 6.8} y={y} width={3.4} height={7} fill="#d33a2c" />
    </g>
  );
}

function Brows({ kind = "normal" }: { kind?: "normal" | "up" | "frown" }) {
  const d =
    kind === "up"
      ? ["M72 80 Q81 74 90 79", "M110 79 Q119 74 128 80"]
      : kind === "frown"
        ? ["M72 84 Q81 86 90 90", "M110 90 Q119 86 128 84"]
        : ["M72 86 Q81 81 90 85", "M110 85 Q119 81 128 86"];
  return (
    <g fill="none" stroke={BEARD} strokeWidth={5} strokeLinecap="round">
      <path d={d[0]} />
      <path d={d[1]} />
    </g>
  );
}

function Eye({
  cx,
  cy = 101,
  big = false,
  look = 0,
}: {
  cx: number;
  cy?: number;
  big?: boolean;
  look?: number;
}) {
  const [rx, ry] = big ? [7.5, 9.5] : [6.5, 8.5];
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#2b3a45" />
      <ellipse cx={cx} cy={cy + 2 + look} rx={rx - 2.5} ry={ry - 3.5} fill="#6f93ab" />
      <circle cx={cx + 2} cy={cy - 3 + look} r={2.4} fill="#ffffff" />
    </g>
  );
}

function Closed({ cx, cy = 102 }: { cx: number; cy?: number }) {
  return (
    <path
      d={`M${cx - 7} ${cy + 2} Q${cx} ${cy - 6} ${cx + 7} ${cy + 2}`}
      fill="none"
      stroke={INK}
      strokeWidth={3.2}
      strokeLinecap="round"
    />
  );
}

/** Paupières fermées pendant un clignement (trait plat). */
function Blink({ cx, cy = 101 }: { cx: number; cy?: number }) {
  return (
    <path d={`M${cx - 7} ${cy} L${cx + 7} ${cy}`} stroke={INK} strokeWidth={3.2} strokeLinecap="round" />
  );
}

function Cheeks() {
  return (
    <g fill="#ee9a82" opacity={0.8}>
      <ellipse cx={68} cy={114} rx={8} ry={4.5} />
      <ellipse cx={132} cy={114} rx={8} ry={4.5} />
    </g>
  );
}

function Smile() {
  return (
    <g>
      <path
        d="M85 126 Q100 144 115 126 Z"
        fill={MOUTH}
        stroke={INK}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <path d="M88 127.5 L112 127.5 Q110 132 100 132 Q90 132 88 127.5 Z" fill="#ffffff" />
    </g>
  );
}

function Face({ expression, blinking }: { expression: Expression; blinking: boolean }) {
  const eyes = (left: ReactNode, right: ReactNode) =>
    blinking ? (
      <>
        <Blink cx={82} />
        <Blink cx={118} />
      </>
    ) : (
      <>
        {left}
        {right}
      </>
    );
  switch (expression) {
    case "waouh":
      return (
        <g>
          <Brows kind="up" />
          {eyes(<Eye cx={82} cy={100} big />, <Eye cx={118} cy={100} big />)}
          <Cheeks />
          <ellipse cx={100} cy={136} rx={11} ry={13} fill={MOUTH} stroke={INK} strokeWidth={2.5} />
          <ellipse cx={100} cy={143} rx={6} ry={4} fill="#e07a6a" />
          <path
            d="M92 127 Q100 124 108 127"
            stroke="#fff"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
          />
        </g>
      );
    case "croque":
      return (
        <g>
          <Brows kind="frown" />
          <Closed cx={82} cy={103} />
          {blinking ? <Blink cx={118} /> : <Eye cx={118} />}
          <Cheeks />
          <circle cx={104} cy={136} r={15} fill="#d8392b" {...stroke} />
          <path
            d="M104 121 Q108 114 114 113"
            stroke="#55634a"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
          />
          <path d="M90 128 h7 M90 133 h6" stroke="#fff" strokeWidth={3} strokeLinecap="round" />
          <ellipse cx={108} cy={153} rx={12} ry={8} fill={SKIN} {...stroke} />
        </g>
      );
    case "idee":
      return (
        <g>
          <Brows kind="up" />
          {eyes(<Eye cx={82} cy={100} look={-4} />, <Eye cx={118} cy={100} look={-4} />)}
          <Cheeks />
          <path
            d="M90 128 Q100 138 110 128 Q100 132 90 128 Z"
            fill={MOUTH}
            stroke={INK}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          <rect x={152} y={88} width={9} height={26} rx={4.5} fill={SKIN} {...stroke} />
          <ellipse cx={156} cy={122} rx={11} ry={10} fill={SKIN} {...stroke} />
          <path
            d="M152 70 l-4 -6 M160 68 l0 -8 M168 70 l4 -6"
            stroke="#b08a3e"
            strokeWidth={3}
            strokeLinecap="round"
          />
        </g>
      );
    case "fier":
      return (
        <g>
          <Brows />
          <Closed cx={82} />
          <Closed cx={118} />
          <Cheeks />
          <Smile />
        </g>
      );
    case "clin":
      return (
        <g>
          <Brows />
          <Closed cx={82} cy={103} />
          {blinking ? <Blink cx={118} /> : <Eye cx={118} />}
          <Cheeks />
          <path
            d="M88 128 Q102 140 114 126"
            fill="none"
            stroke={INK}
            strokeWidth={3.2}
            strokeLinecap="round"
          />
        </g>
      );
    default:
      return (
        <g>
          <Brows />
          {eyes(<Eye cx={82} />, <Eye cx={118} />)}
          <Cheeks />
          <Smile />
        </g>
      );
  }
}

function Head({ jacket }: { jacket: Jacket }) {
  const fill = jacket === "blanche" ? "#ffffff" : "#24201d";
  return (
    <g>
      <rect x={70} y={146} width={60} height={18} rx={7} fill={fill} {...stroke} />
      <Flag x={112} y={151} />
      <ellipse cx={49} cy={104} rx={9} ry={11} fill={SKIN} {...stroke} />
      <ellipse cx={151} cy={104} rx={9} ry={11} fill={SKIN} {...stroke} />
      <ellipse cx={100} cy={100} rx={52} ry={51} fill={SKIN} {...stroke} />
      <path
        d="M52 92 Q54 52 100 50 Q146 52 148 92 Q140 70 100 66 Q60 70 52 92 Z"
        fill="#8a6f5e"
        opacity={0.28}
      />
      <path
        d="M50 104 Q52 150 100 156 Q148 150 150 104 Q146 126 126 128 Q112 120 100 122 Q88 120 74 128 Q54 126 50 104 Z"
        fill={BEARD}
        {...stroke}
        strokeLinejoin="round"
      />
      <ellipse cx={100} cy={150} rx={6} ry={3.5} fill="#a39a92" opacity={0.7} />
    </g>
  );
}

function Body({ jacket }: { jacket: Jacket }) {
  const fill = jacket === "blanche" ? "#ffffff" : "#24201d";
  const text = jacket === "blanche" ? "#2d4f9e" : "#d8d2ca";
  return (
    <g>
      <ellipse cx={100} cy={230} rx={50} ry={7} fill={INK} opacity={0.12} />
      <ellipse cx={86} cy={220} rx={14} ry={7} fill={INK} />
      <ellipse cx={114} cy={220} rx={14} ry={7} fill={INK} />
      <rect x={76} y={196} width={48} height={22} rx={8} fill="#2a2724" {...stroke} />
      <rect x={60} y={150} width={80} height={58} rx={24} fill={fill} {...stroke} />
      <text
        x={112}
        y={172}
        fontFamily="'Dancing Script', cursive"
        fontSize={9}
        fill={text}
        textAnchor="middle"
      >
        Julien
      </text>
      <rect x={52} y={178} width={96} height={22} rx={11} fill={fill} {...stroke} />
      <rect x={72} y={180} width={56} height={17} rx={8.5} fill={SKIN} {...stroke} />
      <rect x={104} y={179} width={9} height={19} rx={2} fill="#3a2a20" />
      <circle cx={108.5} cy={188.5} r={4.5} fill="#efe8dc" stroke="#3a2a20" strokeWidth={1.5} />
    </g>
  );
}

export interface MascotProps {
  expression?: Expression;
  jacket?: Jacket;
  /** Image courante : sert au clignement des yeux (toutes les ~3,5 s à 30 i/s). */
  frame?: number;
  /** Corps entier (par défaut) ou visage seul. */
  bust?: boolean;
  size: number;
  style?: CSSProperties;
}

export function isBlinking(frame: number): boolean {
  return frame % 105 >= 100;
}

export function Mascot({
  expression = "content",
  jacket = "blanche",
  frame = 0,
  bust = false,
  size,
  style,
}: MascotProps) {
  const viewBox = bust ? "34 40 136 136" : "0 30 200 210";
  const ratio = bust ? 1 : 210 / 200;
  return (
    <svg
      width={size}
      height={size * ratio}
      viewBox={viewBox}
      style={style}
      aria-label="Julien, mascotte de Culinova"
    >
      {bust ? null : <Body jacket={jacket} />}
      <Head jacket={jacket} />
      <Face expression={expression} blinking={isBlinking(frame)} />
    </svg>
  );
}
