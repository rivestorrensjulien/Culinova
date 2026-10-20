/** Planche de contrôle : Julien dans chacun de ses gestes (aperçu, jamais publié). */
import { AbsoluteFill } from "remotion";
import { actionExpression, type Action } from "./actions.ts";
import { WorkingChef } from "./Kitchen.tsx";

export const ACTIONS: Action[] = [
  "disposer",
  "couper",
  "melanger",
  "poeler",
  "chauffer",
  "four",
  "repos",
  "verser",
  "petrir",
  "assaisonner",
  "dresser",
];

export function Gestures() {
  return (
    <AbsoluteFill style={{ backgroundColor: "#f4ece1", flexDirection: "row", flexWrap: "wrap" }}>
      {ACTIONS.map((action) => (
        <div key={action} style={{ width: 360, height: 420, position: "relative" }}>
          <WorkingChef
            action={action}
            expression={actionExpression(action, false)}
            jacket="blanche"
            frame={22}
            width={360}
          />
          <div style={{ position: "absolute", top: 8, left: 12, fontFamily: "sans-serif", fontSize: 26 }}>
            {action}
          </div>
        </div>
      ))}
    </AbsoluteFill>
  );
}
