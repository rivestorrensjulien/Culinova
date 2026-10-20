/**
 * Julien au travail derrière son plan de travail : le geste suit le plan du script
 * (couper, mélanger, poêler, verser…), animé image par image. Le visage, la barbe et la
 * veste sont ceux de la mascotte validée (Mascot.tsx) ; seuls les bras bougent ici.
 */
import type { ReactNode } from "react";
import type { Action } from "./actions.ts";
import { Face, Head, INK, isBlinking, SKIN, type Expression, type Jacket } from "./Mascot.tsx";

type Point = { x: number; y: number };

const WOOD = "#b98256";
const WOOD_TOP = "#d4a173";
const STEEL = "#cfd6dc";
const BATTER = "#ecd39b";
const HONEY = "#e8a93a";
const line = { stroke: INK, strokeWidth: 2.5, strokeLinejoin: "round", strokeLinecap: "round" } as const;

const SHOULDER_LEFT: Point = { x: 168, y: 186 };
const SHOULDER_RIGHT: Point = { x: 232, y: 186 };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const wave = (frame: number, speed: number, phase = 0) => Math.sin(frame * speed + phase);

function Arm({ from, to, side, fill }: { from: Point; to: Point; side: -1 | 1; fill: string }) {
  // Coude légèrement vers l'extérieur, pour un bras naturel.
  const elbow = { x: (from.x + to.x) / 2 + side * 14, y: (from.y + to.y) / 2 + 6 };
  const d = `M${from.x} ${from.y} Q${elbow.x} ${elbow.y} ${to.x} ${to.y}`;
  return (
    <g>
      <path d={d} stroke={INK} strokeWidth={21} fill="none" strokeLinecap="round" />
      <path d={d} stroke={fill} strokeWidth={15.5} fill="none" strokeLinecap="round" />
      <circle cx={to.x} cy={to.y} r={9} fill={SKIN} {...line} />
    </g>
  );
}

function Torso({ jacket }: { jacket: Jacket }) {
  const fill = jacket === "blanche" ? "#ffffff" : "#24201d";
  const text = jacket === "blanche" ? "#2d4f9e" : "#d8d2ca";
  const button = jacket === "blanche" ? "#cfc6bb" : "#6c645d";
  return (
    <g>
      <rect x={158} y={160} width={84} height={110} rx={26} fill={fill} {...line} strokeWidth={3} />
      <text
        x={214}
        y={184}
        fontFamily="'Dancing Script', cursive"
        fontSize={9}
        fill={text}
        textAnchor="middle"
      >
        Julien
      </text>
      {[200, 220, 240].map((y) => (
        <g key={y}>
          <circle cx={186} cy={y} r={2.6} fill={button} />
          <circle cx={214} cy={y} r={2.6} fill={button} />
        </g>
      ))}
    </g>
  );
}

function Counter() {
  return (
    <g>
      <rect x={-10} y={256} width={420} height={140} fill={WOOD} {...line} strokeWidth={3} />
      <rect x={-10} y={256} width={420} height={12} fill={WOOD_TOP} {...line} strokeWidth={3} />
      <path d="M-10 300 H410 M-10 340 H410" stroke="#00000018" strokeWidth={3} />
    </g>
  );
}

function Bowl({ x, fill = BATTER, children }: { x: number; fill?: string; children?: ReactNode }) {
  return (
    <g>
      <path
        d={`M${x - 50} 230 Q${x - 48} 262 ${x} 262 Q${x + 48} 262 ${x + 50} 230 Z`}
        fill="#efe6da"
        {...line}
      />
      <ellipse cx={x} cy={230} rx={50} ry={8} fill="#f8f1e7" {...line} />
      <ellipse cx={x} cy={231} rx={43} ry={5.5} fill={fill} />
      {children}
    </g>
  );
}

function Steam({ x, y, frame, count = 3 }: { x: number; y: number; frame: number; count?: number }) {
  return (
    <g>
      {Array.from({ length: count }, (_, i) => {
        const t = ((frame * 1.2 + i * 22) % 60) / 60;
        const sx = x + (i - (count - 1) / 2) * 18 + wave(frame, 0.15, i) * 4;
        const sy = y - t * 46;
        return (
          <path
            key={i}
            d={`M${sx} ${sy} q-6 -8 0 -16 q6 -8 0 -16`}
            stroke="#ffffff"
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            opacity={(1 - t) * 0.9}
          />
        );
      })}
    </g>
  );
}

type Pose = { left: Point; right: Point; back?: ReactNode; front?: ReactNode; crossed?: boolean };

function couper(frame: number): Pose {
  const chop = Math.abs(wave(frame, 0.42));
  const hand = { x: 228, y: 232 - chop * 22 };
  const push = clamp(frame * 0.35, 0, 26);
  const slices = clamp(Math.floor(frame / 7), 0, 9);
  return {
    left: { x: 158 + push, y: 240 },
    right: hand,
    back: (
      <g>
        <rect x={130} y={244} width={150} height={13} rx={4} fill="#dcb47e" {...line} />
        <path
          d={`M${146 + push} 245 Q${140 + push} 238 ${132 + push} 236`}
          stroke="#5d8a3a"
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
        />
        <rect x={146 + push} y={236} width={70 - push} height={10} rx={5} fill="#e8862e" {...line} />
        {Array.from({ length: slices }, (_, i) => (
          <ellipse
            key={i}
            cx={238 + (i % 4) * 9}
            cy={242 - Math.floor(i / 4) * 4}
            rx={4.5}
            ry={3.2}
            fill="#f09a40"
            {...line}
            strokeWidth={1.5}
          />
        ))}
      </g>
    ),
    front: (
      <g>
        <path
          d={`M${hand.x - 4} ${hand.y - 7} L${hand.x - 46} ${hand.y - 2} Q${hand.x - 52} ${hand.y + 8} ${hand.x - 40} ${hand.y + 10} L${hand.x - 4} ${hand.y + 7} Z`}
          fill={STEEL}
          {...line}
        />
        <rect x={hand.x - 6} y={hand.y - 5} width={26} height={10} rx={4} fill="#3a2a20" />
      </g>
    ),
  };
}

function melanger(frame: number): Pose {
  const a = frame * 0.55;
  const hand = { x: 202 + Math.cos(a) * 16, y: 200 + Math.sin(a) * 5 };
  return {
    left: { x: 152, y: 232 },
    right: hand,
    back: (
      <Bowl x={200}>
        <path
          d={`M${200 + Math.cos(a) * 26} ${231 + Math.sin(a) * 3} A26 3.5 0 0 1 ${200 - Math.cos(a) * 26} ${231 - Math.sin(a) * 3}`}
          stroke="#c9a764"
          strokeWidth={2}
          fill="none"
        />
      </Bowl>
    ),
    front: (
      <g>
        <line
          x1={hand.x}
          y1={hand.y}
          x2={hand.x - 2}
          y2={hand.y + 14}
          stroke="#3a2a20"
          strokeWidth={5}
          strokeLinecap="round"
        />
        <ellipse
          cx={hand.x - 2}
          cy={hand.y + 26}
          rx={8}
          ry={13}
          fill="none"
          stroke="#8d969e"
          strokeWidth={2.5}
        />
        <ellipse
          cx={hand.x - 2}
          cy={hand.y + 26}
          rx={3.5}
          ry={13}
          fill="none"
          stroke="#8d969e"
          strokeWidth={2.5}
        />
      </g>
    ),
  };
}

function poeler(frame: number): Pose {
  const toss = Math.max(0, wave(frame, 0.3));
  const lift = -toss * 16;
  const jump = Math.max(0, wave(frame, 0.3, -0.6)) * 30;
  const handle = { x: 270, y: 228 + lift };
  return {
    left: { x: 160, y: 222 },
    right: handle,
    back: (
      <g>
        <ellipse cx={196} cy={256} rx={46} ry={5} fill="#3b3633" />
        {[178, 196, 214].map((x, i) => (
          <path
            key={x}
            d={`M${x} 256 q-5 -10 0 -${14 + wave(frame, 0.7, i) * 4} q5 10 0 ${14}`}
            fill="#f28a2e"
            opacity={0.6 + toss * 0.4}
          />
        ))}
      </g>
    ),
    front: (
      <g transform={`rotate(${-toss * 7} 196 ${242 + lift})`}>
        <line
          x1={234}
          y1={240 + lift}
          x2={handle.x}
          y2={handle.y}
          stroke="#2e2a27"
          strokeWidth={7}
          strokeLinecap="round"
        />
        <path
          d={`M150 ${236 + lift} Q152 ${252 + lift} 196 ${252 + lift} Q240 ${252 + lift} 242 ${236 + lift} Z`}
          fill="#3a3532"
          {...line}
        />
        <ellipse cx={196} cy={236 + lift} rx={46} ry={7} fill="#2e2a27" {...line} />
        {[176, 194, 212].map((x, i) => (
          <rect
            key={x}
            x={x}
            y={228 + lift - jump * (0.7 + i * 0.2)}
            width={14}
            height={8}
            rx={4}
            fill="#d99a3f"
            {...line}
            strokeWidth={1.5}
          />
        ))}
        <line
          x1={160}
          y1={222}
          x2={184}
          y2={234 + lift}
          stroke="#7a5233"
          strokeWidth={5}
          strokeLinecap="round"
        />
        <Steam x={196} y={214} frame={frame} />
      </g>
    ),
  };
}

function chauffer(frame: number): Pose {
  const a = frame * 0.4;
  const hand = { x: 204 + Math.cos(a) * 12, y: 194 + Math.sin(a) * 4 };
  return {
    left: { x: 130, y: 222 },
    right: hand,
    back: (
      <g>
        <line x1={160} y1={224} x2={130} y2={222} stroke="#6f777e" strokeWidth={8} strokeLinecap="round" />
        <rect x={158} y={212} width={86} height={46} rx={7} fill="#a7b0b8" {...line} />
        <ellipse cx={201} cy={213} rx={43} ry={7} fill="#7d868d" {...line} />
        <ellipse cx={201} cy={214} rx={38} ry={5} fill={HONEY} />
        {Array.from({ length: 5 }, (_, i) => {
          const t = ((frame + i * 9) % 24) / 24;
          return <circle key={i} cx={176 + i * 12} cy={214} r={1 + t * 3.5} fill="#f7d58a" opacity={1 - t} />;
        })}
      </g>
    ),
    front: (
      <g>
        <line
          x1={hand.x}
          y1={hand.y}
          x2={hand.x - 8}
          y2={hand.y + 24}
          stroke="#9a6a3e"
          strokeWidth={5}
          strokeLinecap="round"
        />
        <Steam x={201} y={200} frame={frame} />
      </g>
    ),
  };
}

function four(frame: number): Pose {
  const p = clamp(frame / 36, 0, 1);
  const inside = frame > 40;
  const tray = { x: 200 - p * 90, y: 238 - p * 14 };
  const glow = 0.55 + wave(frame, 0.25) * 0.2 + (inside ? 0.25 : 0);
  const rest = { left: { x: 166, y: 246 }, right: { x: 236, y: 246 } };
  return {
    left: inside ? rest.left : { x: tray.x - 36, y: tray.y },
    right: inside ? rest.right : { x: tray.x + 36, y: tray.y },
    back: null,
    front: (
      <g>
        {inside ? null : (
          <g>
            <rect x={tray.x - 42} y={tray.y - 4} width={84} height={8} rx={2} fill="#8d969e" {...line} />
            <path
              d={`M${tray.x - 30} ${tray.y - 4} Q${tray.x} ${tray.y - 22} ${tray.x + 30} ${tray.y - 4} Z`}
              fill="#d99a3f"
              {...line}
            />
          </g>
        )}
        <rect x={64} y={156} width={90} height={102} rx={10} fill="#3b3633" {...line} strokeWidth={3} />
        <rect x={74} y={178} width={70} height={60} rx={8} fill="#f08a2e" opacity={glow} {...line} />
        {[84, 109, 134].map((x) => (
          <circle key={x} cx={x} cy={167} r={4} fill="#cfc6bb" />
        ))}
      </g>
    ),
  };
}

function repos(frame: number): Pose {
  const rise = clamp(frame / 60, 0, 1);
  const angle = (frame * 8) % 360;
  return {
    left: { x: 0, y: 0 },
    right: { x: 0, y: 0 },
    crossed: true,
    back: (
      <g>
        <Bowl x={160} fill="#f1dcb0">
          <ellipse
            cx={160}
            cy={231 - rise * 6}
            rx={40}
            ry={6 + rise * 10}
            fill="#f1dcb0"
            {...line}
            strokeWidth={2}
          />
          <path
            d={`M114 ${232 - rise * 4} Q160 ${200 - rise * 16} 206 ${232 - rise * 4}`}
            fill="#d9534f"
            opacity={0.85}
            {...line}
            strokeWidth={2}
          />
        </Bowl>
        <circle cx={262} cy={238} r={18} fill="#e6513d" {...line} />
        <rect x={258} y={216} width={8} height={6} rx={2} fill="#5d8a3a" />
        <line
          x1={262}
          y1={238}
          x2={262 + Math.sin((angle * Math.PI) / 180) * 12}
          y2={238 - Math.cos((angle * Math.PI) / 180) * 12}
          stroke="#ffffff"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <text
          x={300}
          y={150 - (frame % 40) * 0.5}
          fontFamily="sans-serif"
          fontWeight={700}
          fontSize={22}
          fill={INK}
          opacity={0.5}
        >
          z
        </text>
      </g>
    ),
  };
}

function verser(frame: number): Pose {
  const hand = { x: 250, y: 196 + wave(frame, 0.2) * 3 };
  return {
    left: { x: 152, y: 232 },
    right: hand,
    back: <Bowl x={190} fill={HONEY} />,
    front: (
      <g>
        <path
          d={`M224 204 Q206 212 202 230`}
          stroke={HONEY}
          strokeWidth={6}
          fill="none"
          strokeLinecap="round"
          strokeDasharray="10 6"
          strokeDashoffset={-frame * 3}
        />
        <g transform={`rotate(-38 ${hand.x} ${hand.y})`}>
          <path
            d={`M${hand.x - 22} ${hand.y - 26} H${hand.x + 18} L${hand.x + 14} ${hand.y + 14} H${hand.x - 18} Z`}
            fill="#f2ede4"
            {...line}
          />
          <path d={`M${hand.x - 22} ${hand.y - 26} l-8 -4`} {...line} strokeWidth={3} />
          <rect x={hand.x - 18} y={hand.y - 6} width={32} height={20} fill={HONEY} opacity={0.7} />
        </g>
      </g>
    ),
  };
}

function petrir(frame: number): Pose {
  const x = 200 + wave(frame, 0.3) * 22;
  const spread = clamp(frame * 0.45, 0, 30);
  return {
    left: { x: x - 60, y: 242 },
    right: { x: x + 60, y: 242 },
    back: (
      <g>
        <ellipse cx={200} cy={252} rx={34 + spread} ry={6} fill="#f1dcb0" {...line} />
        {[150, 176, 230, 252].map((dx, i) => (
          <circle key={dx} cx={dx} cy={244 - ((frame + i * 7) % 20)} r={1.6} fill="#ffffff" opacity={0.8} />
        ))}
      </g>
    ),
    front: (
      <g>
        <rect x={x - 46} y={236} width={92} height={13} rx={6.5} fill="#d6a76f" {...line} />
        <rect x={x - 66} y={239} width={20} height={7} rx={3.5} fill="#b5824c" {...line} strokeWidth={2} />
        <rect x={x + 46} y={239} width={20} height={7} rx={3.5} fill="#b5824c" {...line} strokeWidth={2} />
      </g>
    ),
  };
}

function assaisonner(frame: number): Pose {
  const hand = { x: 214, y: 200 + wave(frame, 0.6) * 3 };
  return {
    left: { x: 150, y: 236 },
    right: hand,
    back: (
      <Bowl x={200} fill="#7fae5a">
        {[178, 194, 212, 226].map((x) => (
          <ellipse key={x} cx={x} cy={228} rx={7} ry={3.5} fill="#5d8a3a" />
        ))}
      </Bowl>
    ),
    front: (
      <g>
        {Array.from({ length: 9 }, (_, i) => (
          <circle
            key={i}
            cx={210 + (i % 3) * 4}
            cy={208 + ((frame * 2.5 + i * 11) % 22)}
            r={1.6}
            fill="#ffffff"
            stroke={INK}
            strokeWidth={0.6}
          />
        ))}
        <rect x={136} y={216} width={18} height={26} rx={5} fill="#f2ede4" {...line} />
      </g>
    ),
  };
}

function dresser(frame: number): Pose {
  const step = Math.floor(frame / 14);
  const drop = (frame % 14) / 14;
  const hand = { x: 214, y: 210 + drop * 10 };
  return {
    left: { x: 140, y: 248 },
    right: hand,
    back: (
      <g>
        <rect x={130} y={244} width={150} height={13} rx={6} fill="#c99066" {...line} />
        <path d="M160 245 Q170 222 205 220 Q240 222 250 245 Z" fill="#d99a3f" {...line} />
        {Array.from({ length: clamp(step, 0, 5) }, (_, i) => (
          <ellipse
            key={i}
            cx={180 + i * 13}
            cy={226 + (i % 2) * 5}
            rx={5}
            ry={2.6}
            fill="#5d8a3a"
            transform={`rotate(${i * 30 - 30} ${180 + i * 13} 226)`}
          />
        ))}
      </g>
    ),
    front: (
      <g>
        <line
          x1={hand.x}
          y1={hand.y}
          x2={hand.x - 6}
          y2={hand.y + 14}
          stroke="#8d969e"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <ellipse cx={hand.x - 6} cy={hand.y + 16} rx={4.5} ry={2.4} fill="#5d8a3a" />
      </g>
    ),
  };
}

function disposer(frame: number): Pose {
  const items: Array<{ x: number; node: ReactNode }> = [
    { x: 136, node: <circle cx={136} cy={242} r={12} fill="#d8392b" {...line} /> },
    { x: 168, node: <ellipse cx={168} cy={243} rx={9} ry={12} fill="#fbf6ee" {...line} /> },
    { x: 200, node: <ellipse cx={200} cy={245} rx={13} ry={10} fill="#f1cf3b" {...line} /> },
    { x: 234, node: <rect x={222} y={226} width={24} height={30} rx={5} fill="#f2ede4" {...line} /> },
    { x: 266, node: <rect x={252} y={240} width={30} height={10} rx={5} fill="#e8862e" {...line} /> },
  ];
  const shown = clamp(Math.floor(frame / 9) + 1, 1, items.length);
  const current = items[shown - 1]!;
  const reach = 1 - ((frame % 9) / 9) * 0.6;
  const busy = { x: current.x, y: 226 - reach * 10 };
  const leftTurn = (shown - 1) % 2 === 0;
  return {
    left: leftTurn ? busy : { x: 160, y: 250 },
    right: leftTurn ? { x: 240, y: 250 } : busy,
    back: (
      <g>
        {items.slice(0, shown).map((item) => (
          <g key={item.x}>{item.node}</g>
        ))}
      </g>
    ),
  };
}

const POSES: Record<Action, (frame: number) => Pose> = {
  disposer,
  couper,
  melanger,
  poeler,
  chauffer,
  four,
  repos,
  verser,
  petrir,
  assaisonner,
  dresser,
};

export function poseFor(action: Action, frame: number): Pose {
  return POSES[action](frame);
}

export function WorkingChef({
  action,
  expression,
  jacket,
  frame,
  width,
}: {
  action: Action;
  expression: Expression;
  jacket: Jacket;
  frame: number;
  width: number;
}) {
  const pose = poseFor(action, frame);
  const fill = jacket === "blanche" ? "#ffffff" : "#24201d";
  const bob = wave(frame, 0.22) * 1.5;
  const tilt = wave(frame, 0.11) * 3;
  return (
    <svg width={width} height={width * (300 / 280)} viewBox="60 40 280 300" aria-label="Julien en cuisine">
      <g transform={`translate(0 ${bob})`}>
        <Torso jacket={jacket} />
        <g transform={`translate(100 6) rotate(${tilt} 100 150)`}>
          <Head jacket={jacket} />
          <Face expression={expression} blinking={isBlinking(frame)} />
        </g>
      </g>
      <Counter />
      {pose.back}
      {pose.crossed ? (
        <g transform={`translate(0 ${bob})`}>
          <rect x={150} y={204} width={100} height={24} rx={12} fill={fill} {...line} strokeWidth={3} />
          <rect x={172} y={206} width={56} height={19} rx={9.5} fill={SKIN} {...line} />
        </g>
      ) : (
        <>
          <Arm from={SHOULDER_LEFT} to={pose.left} side={-1} fill={fill} />
          <Arm from={SHOULDER_RIGHT} to={pose.right} side={1} fill={fill} />
        </>
      )}
      {pose.front}
    </svg>
  );
}
