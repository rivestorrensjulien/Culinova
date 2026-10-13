import type { MetadataRoute } from "next";

/** Manifeste de l'application installable (PWA), servi sur /manifest.webmanifest. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "Culinova",
    short_name: "Culinova",
    description: "De l'idée à l'assiette, avec l'IA : créer, chiffrer, illustrer et gérer ses recettes.",
    lang: "fr",
    dir: "ltr",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#faf6ef",
    theme_color: "#faf6ef",
    categories: ["food", "productivity", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Créer une recette", short_name: "Créer", url: "/app/creer" },
      { name: "Mes recettes", short_name: "Recettes", url: "/app/recettes" },
      { name: "Listes de courses", short_name: "Courses", url: "/app/courses" },
    ],
  };
}
