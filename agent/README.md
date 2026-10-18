# Agent de publication de Culinova

Partie séparée du projet : elle fabrique la **vidéo verticale** de chaque recette « à publier »
et l'envoie à Culinova. L'administrateur la regarde sur la page de la recette, puis clique
« Valider et publier » : c'est Culinova qui publie sur Instagram (Reel) et TikTok.

## La vidéo

- Format 9:16 (1080 × 1920), 30 images par seconde, 20 à 35 secondes.
- Déroulé : accroche (la mascotte s'exclame « Waouh ! ») → une scène par plan du script TikTok
  (texte qui apparaît mot à mot, mascotte qui réagit) → la photo 9:16 du plat → carte de fin
  « culinova.fr · @culinova.recette ».
- Mascotte : Julien en version chibi (`src/video/Mascot.tsx`), six expressions : content, waouh,
  croque, idee, fier, clin. Veste blanche par défaut (variable GitHub `MASCOTTE_VESTE=noire` pour la noire).
- Musique : déposer un fichier libre de droits `public/musique.mp3` ; sans fichier, piste silencieuse.
- Rendu par [Remotion](https://www.remotion.dev) (licence gratuite pour les entreprises de 3 personnes au plus).

## Où ça tourne

Sur GitHub Actions (`.github/workflows/videos.yml`) :

- toutes les 30 minutes de 7 h à 23 h : s'il y a des recettes « à publier » sans vidéo, il les fabrique
  et les envoie ; au passage, il fait avancer les publications en cours ;
- à la main (onglet Actions › « Vidéos des recettes » › Run workflow) : une recette précise
  (identifiant) pour refaire sa vidéo, ou seulement la vidéo d'exemple ;
- à chaque modification de ce dossier : vidéo d'exemple téléchargeable dans le résumé de l'exécution.

Réglages GitHub (Settings › Secrets and variables › Actions) : secret `AGENT_API_KEY` (la même
valeur que dans Vercel) ; variable `CULINOVA_URL` facultative (par défaut `https://culinova.fr`).

## En local

```bash
cd agent
npm install
npm run studio    # aperçu interactif de la vidéo d'exemple
npm run exemple   # sortie/exemple.mp4
CULINOVA_URL=http://localhost:3000 AGENT_API_KEY=… npm run rendre
```

## Échanges avec Culinova

Voir `docs/agent-publication.md` (porte `/api/agent/videos`).
