/**
 * Une image du carrousel Instagram (1080 × 1350) : couverture (photo pleine page), ingrédients
 * pesés, étapes, carte de fin avec Chef Ju en 3D. La photo de la recette revient sur chaque
 * image (recadrée différemment), pour un carrousel visuel et cohérent avec la publication.
 */
import { loadFont as loadSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadSerif } from "@remotion/google-fonts/Fraunces";
import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { carouselPages, type CarouselProps, MASCOT_3D } from "./carousel.ts";

const serif = loadSerif("normal", { weights: ["600"], subsets: ["latin", "latin-ext"] }).fontFamily;
const sans = loadSans("normal", {
  weights: ["400", "500", "700"],
  subsets: ["latin", "latin-ext"],
}).fontFamily;

const INK = "#1f1a16";
const COPPER = "#a84a24";
const MUTED = "#6b5f55";
const IVORY = "#faf6ef";
const CREAM = "#f3eadc";
const SHADOW = "0 18px 50px #3b241433";

/** Cadrages successifs de la photo sur les pages d'étapes (le plat vu sous un autre angle). */
const FOCUS = ["50% 55%", "28% 62%", "72% 48%", "50% 75%", "35% 40%", "65% 70%"];

function src(photoUrl: string) {
  return photoUrl.startsWith("static:") ? staticFile(photoUrl.slice(7)) : photoUrl;
}

function Photo({
  props,
  style,
  focus = "50% 50%",
  zoom = 1,
}: {
  props: CarouselProps;
  style?: CSSProperties;
  focus?: string;
  zoom?: number;
}) {
  return (
    <div style={{ overflow: "hidden", ...style }}>
      <Img
        src={src(props.photoUrl)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: focus,
          transform: `scale(${zoom})`,
          transformOrigin: focus,
        }}
      />
    </div>
  );
}

/** Fond crème légèrement teinté par la photo. */
function Backdrop({ props }: { props: CarouselProps }) {
  return (
    <AbsoluteFill style={{ backgroundColor: IVORY, overflow: "hidden" }}>
      <Img
        src={src(props.photoUrl)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "blur(60px) saturate(1.3)",
          transform: "scale(1.3)",
        }}
      />
      <AbsoluteFill style={{ backgroundColor: IVORY, opacity: 0.86 }} />
    </AbsoluteFill>
  );
}

function Avatar({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        background: "linear-gradient(160deg, #d9895f, #a84a24)",
        flexShrink: 0,
      }}
    >
      <Img
        src={staticFile(MASCOT_3D)}
        style={{ width: "100%", height: "175%", objectFit: "cover", objectPosition: "50% 0%" }}
      />
    </div>
  );
}

/** Pied de page : avatar + compte, et points de progression du carrousel. */
function Footer({
  props,
  page,
  count,
  light = false,
}: {
  props: CarouselProps;
  page: number;
  count: number;
  light?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        bottom: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Avatar size={56} />
        <span style={{ fontFamily: sans, fontSize: 28, fontWeight: 500, color: light ? "#fff" : INK }}>
          {props.handle}
        </span>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            style={{
              width: i === page ? 34 : 12,
              height: 12,
              borderRadius: 6,
              background: i === page ? COPPER : light ? "#ffffff66" : "#1f1a1626",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Colonne de la page (entre la marge du haut et le pied de page) : la photo prend la place libre. */
function Column({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 60,
        left: 60,
        right: 60,
        bottom: 150,
        display: "flex",
        flexDirection: "column",
        gap: 30,
      }}
    >
      {children}
    </div>
  );
}

function Pill({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <div
      style={{
        fontFamily: sans,
        fontSize: 30,
        fontWeight: 500,
        padding: "12px 26px",
        borderRadius: 999,
        color: dark ? "#fff" : INK,
        background: dark ? "#ffffff2b" : "#ffffffcc",
        border: dark ? "1.5px solid #ffffff55" : "none",
      }}
    >
      {children}
    </div>
  );
}

function Overline({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: sans,
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: COPPER,
      }}
    >
      {children}
    </div>
  );
}

function Cover({ props, count }: { props: CarouselProps; count: number }) {
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <Photo props={props} style={{ position: "absolute", inset: 0 }} />
      <AbsoluteFill
        style={{
          background: "linear-gradient(180deg, #0006 0%, #0000 22%, #0000 45%, #000c 82%, #000e 100%)",
        }}
      />
      <div
        style={{ position: "absolute", top: 64, left: 80, display: "flex", alignItems: "center", gap: 16 }}
      >
        <Avatar size={64} />
        <span style={{ fontFamily: serif, fontSize: 42, color: "#fff" }}>Culinova</span>
      </div>
      <div style={{ position: "absolute", left: 80, right: 80, bottom: 170 }}>
        <div
          style={{
            fontFamily: serif,
            fontSize: props.name.length > 60 ? 74 : 88,
            lineHeight: 1.04,
            color: "#fff",
          }}
        >
          {props.name}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 34 }}>
          <Pill dark>{props.servings} personnes</Pill>
          <Pill dark>{props.totalMinutes} min</Pill>
          <Pill dark>Pesée au gramme</Pill>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 80,
          bottom: 62,
          fontFamily: sans,
          fontSize: 30,
          fontWeight: 500,
          color: INK,
          padding: "14px 30px",
          borderRadius: 999,
          background: "#fff",
        }}
      >
        Glisse pour la recette →
      </div>
      <div style={{ position: "absolute", left: 80, bottom: 84, display: "flex", gap: 10 }}>
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            style={{
              width: i === 0 ? 34 : 12,
              height: 12,
              borderRadius: 6,
              background: i === 0 ? "#fff" : "#ffffff66",
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
}

export function CarouselSlide(props: CarouselProps) {
  const pages = carouselPages(props);
  const index = Math.min(Math.max(props.page, 0), pages.length - 1);
  const page = pages[index]!;
  const count = pages.length;
  const footer = <Footer props={props} page={index} count={count} />;

  if (page.kind === "cover") return <Cover props={props} count={count} />;

  if (page.kind === "ingredients") {
    const two = page.items.length > 6;
    const dense = page.items.length > 10;
    const rows = two ? Math.ceil(page.items.length / 2) : page.items.length;
    return (
      <AbsoluteFill>
        <Backdrop props={props} />
        <Column>
          <div style={{ position: "relative", flex: 1, minHeight: 240, marginBottom: 70 }}>
            <Photo
              props={props}
              zoom={1.25}
              style={{ position: "absolute", inset: 0, borderRadius: 40, boxShadow: SHADOW }}
            />
            <div
              style={{
                position: "absolute",
                left: 40,
                bottom: -60,
                padding: "22px 40px",
                borderRadius: 28,
                background: IVORY,
                boxShadow: SHADOW,
              }}
            >
              <Overline>Pour {props.servings} personnes</Overline>
              <div style={{ fontFamily: serif, fontSize: 72, lineHeight: 1.05, color: INK, marginTop: 6 }}>
                Ingrédients
              </div>
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: two ? "1fr 1fr" : "1fr",
              gridTemplateRows: `repeat(${rows}, auto)`,
              gridAutoFlow: "column",
              columnGap: 20,
              rowGap: dense ? 10 : 16,
              padding: "0 20px",
            }}
          >
            {page.items.map((item) => (
              <div
                key={item.label}
                style={{
                  padding: dense ? "11px 20px" : two ? "16px 22px" : "18px 28px",
                  borderRadius: 20,
                  background: "#ffffffb3",
                  display: "flex",
                  flexDirection: two ? "column" : "row",
                  justifyContent: "space-between",
                  alignItems: two ? "flex-start" : "baseline",
                  gap: two ? 0 : 16,
                }}
              >
                <span
                  style={{
                    fontFamily: sans,
                    fontSize: dense ? 26 : two ? 29 : 36,
                    color: INK,
                    lineHeight: 1.2,
                  }}
                >
                  {item.label}
                </span>
                <span
                  style={{
                    fontFamily: sans,
                    fontSize: dense ? 24 : two ? 27 : 34,
                    fontWeight: 700,
                    color: COPPER,
                  }}
                >
                  {item.amount}
                </span>
              </div>
            ))}
          </div>
          {page.more > 0 ? (
            <div style={{ fontFamily: sans, fontSize: 28, color: MUTED, padding: "0 24px" }}>
              + {page.more} autre{page.more > 1 ? "s" : ""} : la liste complète via le lien en bio
            </div>
          ) : null}
        </Column>
        {footer}
      </AbsoluteFill>
    );
  }

  if (page.kind === "summary") {
    const dense = page.items.length > 6;
    return (
      <AbsoluteFill>
        <Backdrop props={props} />
        <Column>
          <Photo
            props={props}
            zoom={1.6}
            focus={FOCUS[1]}
            style={{ flex: 1, minHeight: 220, borderRadius: 40, boxShadow: SHADOW }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: dense ? 12 : 16, padding: "0 20px" }}>
            <Overline>La recette en bref</Overline>
            {page.items.map((line, i) => (
              <div key={i} style={{ display: "flex", gap: 22, alignItems: "center" }}>
                <div
                  style={{
                    flexShrink: 0,
                    width: dense ? 54 : 62,
                    height: dense ? 54 : 62,
                    borderRadius: 31,
                    background: COPPER,
                    color: "#fff",
                    fontFamily: serif,
                    fontSize: dense ? 28 : 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ fontFamily: sans, fontSize: dense ? 30 : 34, lineHeight: 1.25, color: INK }}>
                  {line}
                </div>
              </div>
            ))}
            <div
              style={{
                marginTop: 8,
                padding: "18px 26px",
                borderRadius: 24,
                background: "#ffffffcc",
                fontFamily: sans,
                fontSize: 30,
                fontWeight: 500,
                color: COPPER,
              }}
            >
              {page.total > page.items.length ? "La suite, les quantités" : "Les quantités"} et le pas à pas
              détaillé : lien dans la bio 🔗
            </div>
          </div>
        </Column>
        {footer}
      </AbsoluteFill>
    );
  }

  // Fin : Chef Ju en 3D, renvoi vers la recette complète (lien de la bio).
  return (
    <AbsoluteFill style={{ backgroundColor: CREAM }}>
      <Backdrop props={props} />
      <div
        style={{
          position: "absolute",
          top: 70,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 520,
            height: 520,
            borderRadius: 260,
            background: "radial-gradient(circle at 50% 40%, #e9a37a, #a84a24)",
            boxShadow: SHADOW,
          }}
        />
      </div>
      <Img
        src={staticFile(MASCOT_3D)}
        style={{ position: "absolute", top: 40, left: "50%", height: 640, transform: "translateX(-50%)" }}
      />
      <div
        style={{
          position: "absolute",
          top: 700,
          left: 80,
          right: 80,
          padding: "46px 50px",
          borderRadius: 40,
          background: "#fffffff0",
          boxShadow: SHADOW,
          textAlign: "center",
        }}
      >
        <div style={{ fontFamily: serif, fontSize: 64, color: INK, lineHeight: 1.1 }}>
          La recette complète
          <br />
          dans la bio 🔗
        </div>
        <div style={{ fontFamily: sans, fontSize: 32, color: MUTED, marginTop: 20, lineHeight: 1.35 }}>
          Pesée au gramme, pas à pas détaillé et conseils du chef, sur
        </div>
        <div style={{ fontFamily: serif, fontSize: 64, color: COPPER, marginTop: 10 }}>
          {props.site}/recettes
        </div>
        <div style={{ fontFamily: sans, fontSize: 30, color: INK, marginTop: 18 }}>
          Enregistre-la 📌 et partage-la à qui tu veux régaler
        </div>
      </div>
      {footer}
    </AbsoluteFill>
  );
}
