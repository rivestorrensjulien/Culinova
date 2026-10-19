/**
 * Une image du carrousel Instagram (1080 × 1350) : couverture (photo de la recette),
 * ingrédients pesés, étapes, carte de fin. Fonds tirés de la photo, pour rester cohérent.
 */
import { loadFont as loadDancing } from "@remotion/google-fonts/DancingScript";
import { loadFont as loadSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadSerif } from "@remotion/google-fonts/Fraunces";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { carouselPages, type CarouselProps } from "./carousel.ts";
import { Mascot } from "./Mascot.tsx";

const serif = loadSerif("normal", { weights: ["600"], subsets: ["latin", "latin-ext"] }).fontFamily;
const sans = loadSans("normal", { weights: ["400", "500"], subsets: ["latin", "latin-ext"] }).fontFamily;
loadDancing("normal", { weights: ["600"], subsets: ["latin"] });

const INK = "#1f1a16";
const COPPER = "#a84a24";
const MUTED = "#6b5f55";
const IVORY = "#faf6ef";

function src(photoUrl: string) {
  return photoUrl.startsWith("static:") ? staticFile(photoUrl.slice(7)) : photoUrl;
}

function Backdrop({ props }: { props: CarouselProps }) {
  return (
    <AbsoluteFill style={{ backgroundColor: IVORY, overflow: "hidden" }}>
      <Img
        src={src(props.photoUrl)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "blur(48px) saturate(1.2)",
          transform: "scale(1.25)",
        }}
      />
      <AbsoluteFill style={{ backgroundColor: IVORY, opacity: 0.84 }} />
    </AbsoluteFill>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ position: "absolute", top: 80, left: 90, right: 300 }}>
      <div
        style={{
          fontFamily: sans,
          fontSize: 30,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: COPPER,
        }}
      >
        {subtitle}
      </div>
      <div style={{ fontFamily: serif, fontSize: 84, lineHeight: 1.05, color: INK, marginTop: 12 }}>
        {title}
      </div>
    </div>
  );
}

function Footer({ props, page, count }: { props: CarouselProps; page: number; count: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 90,
        right: 90,
        bottom: 60,
        display: "flex",
        justifyContent: "space-between",
        fontFamily: sans,
        fontSize: 28,
        color: MUTED,
      }}
    >
      <span>{props.handle}</span>
      <span>
        {page + 1} / {count}
      </span>
    </div>
  );
}

export function CarouselSlide(props: CarouselProps) {
  const pages = carouselPages(props);
  const page = pages[Math.min(Math.max(props.page, 0), pages.length - 1)]!;
  const footer = <Footer props={props} page={props.page} count={pages.length} />;

  if (page.kind === "cover") {
    return (
      <AbsoluteFill style={{ backgroundColor: INK }}>
        <Img src={src(props.photoUrl)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <AbsoluteFill style={{ background: "linear-gradient(180deg, #0000 50%, #000b 85%, #000d 100%)" }} />
        <div
          style={{ position: "absolute", top: 70, left: 80, fontFamily: serif, fontSize: 40, color: "#fff" }}
        >
          Culinova
        </div>
        <div style={{ position: "absolute", left: 80, right: 80, bottom: 150 }}>
          <div style={{ fontFamily: serif, fontSize: 88, lineHeight: 1.04, color: "#fff" }}>{props.name}</div>
          <div style={{ fontFamily: sans, fontSize: 34, color: "#ffffffd9", marginTop: 22 }}>
            {props.servings} personnes · {props.totalMinutes} min · recette pesée au gramme
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            right: 80,
            bottom: 70,
            fontFamily: sans,
            fontSize: 30,
            color: "#fff",
            padding: "10px 24px",
            borderRadius: 999,
            background: "#ffffff33",
          }}
        >
          Glisse pour la recette →
        </div>
      </AbsoluteFill>
    );
  }

  if (page.kind === "ingredients") {
    return (
      <AbsoluteFill>
        <Backdrop props={props} />
        <Header
          title="Ingrédients"
          subtitle={`Pour ${props.servings} personnes${page.parts > 1 ? ` · ${page.part + 1}/${page.parts}` : ""}`}
        />
        <div style={{ position: "absolute", right: 70, top: 60 }}>
          <Mascot expression="idee" jacket={props.jacket} size={230} bust />
        </div>
        <div
          style={{
            position: "absolute",
            top: 330,
            left: 90,
            right: 90,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {page.items.map((item) => (
            <div
              key={item.label}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 16,
                fontFamily: sans,
                fontSize: 38,
                color: INK,
                borderBottom: "2px dotted #1f1a1633",
                paddingBottom: 12,
              }}
            >
              <span style={{ flex: 1 }}>{item.label}</span>
              <span style={{ fontWeight: 500, color: COPPER }}>{item.amount}</span>
            </div>
          ))}
        </div>
        {footer}
      </AbsoluteFill>
    );
  }

  if (page.kind === "steps") {
    const fontSize = page.items.length >= 4 ? 32 : 38;
    return (
      <AbsoluteFill>
        <Backdrop props={props} />
        <Header title="Étapes" subtitle={props.name} />
        <div
          style={{
            position: "absolute",
            top: 330,
            left: 90,
            right: 90,
            display: "flex",
            flexDirection: "column",
            gap: 34,
          }}
        >
          {page.items.map((item) => (
            <div key={item.number} style={{ display: "flex", gap: 26, alignItems: "flex-start" }}>
              <div
                style={{
                  flexShrink: 0,
                  width: 70,
                  height: 70,
                  borderRadius: 35,
                  background: COPPER,
                  color: "#fff",
                  fontFamily: serif,
                  fontSize: 38,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {item.number}
              </div>
              <div style={{ fontFamily: sans, fontSize, lineHeight: 1.35, color: INK }}>{item.text}</div>
            </div>
          ))}
          {page.more ? (
            <div style={{ fontFamily: sans, fontSize: 34, color: COPPER }}>La suite sur {props.site} →</div>
          ) : null}
        </div>
        {footer}
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <Backdrop props={props} />
      <div style={{ position: "absolute", top: 90 }}>
        <Mascot expression="clin" jacket={props.jacket} size={440} />
      </div>
      <div style={{ position: "absolute", top: 620, left: 90, right: 90, textAlign: "center" }}>
        <div style={{ fontFamily: serif, fontSize: 76, color: INK, lineHeight: 1.1 }}>
          Enregistre la recette 📌
        </div>
        <div style={{ fontFamily: sans, fontSize: 38, color: MUTED, marginTop: 28 }}>
          La recette complète, pesée et chiffrée
        </div>
        <div style={{ fontFamily: serif, fontSize: 96, color: COPPER, marginTop: 16 }}>{props.site}</div>
        <div style={{ fontFamily: sans, fontSize: 40, color: INK, marginTop: 20 }}>{props.handle}</div>
      </div>
    </AbsoluteFill>
  );
}
