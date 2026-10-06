import { buttonClasses } from "@culinova/ui";
import Link from "next/link";

/** Page d'accueil provisoire (la vraie page d'accueil arrive au jalon J8). */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-start justify-center gap-6 px-6 py-16">
      <p className="text-xs font-medium tracking-[0.3em] text-primary uppercase">Culinova</p>
      <h1 className="font-display text-5xl leading-[1.05] text-balance sm:text-6xl">
        De l&apos;idée à l&apos;assiette, avec l&apos;IA.
      </h1>
      <p className="max-w-xl text-lg text-muted">
        Créer, chiffrer, illustrer et gérer ses recettes. Accès sur invitation — ouverture prochaine.
      </p>
      <Link href="/design" className={buttonClasses("secondary", "lg")}>
        Voir le système de design
      </Link>
    </main>
  );
}
