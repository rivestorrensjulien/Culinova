# Porte d'accès de l'agent de publication

L'agent de publication (projet séparé) récupère les recettes de l'administrateur marquées « à publier »,
publie sur TikTok et Instagram, puis indique le résultat. Il n'a accès qu'aux recettes des administrateurs.

## Authentification

Chaque appel porte l'en-tête :

```
Authorization: Bearer <AGENT_API_KEY>
```

`AGENT_API_KEY` est une variable d'environnement de Culinova (au moins 32 caractères). Sans elle, la porte
est fermée (réponse `503 agent_disabled`). Mauvaise clé : `401 unauthorized`.

## Lire la file « à publier »

```
GET /api/agent/publications
GET /api/agent/publications?recette=<recipeId>
```

Réponse :

```json
{
  "recipes": [
    {
      "recipeId": "…",
      "name": "Saumon snacké, riz vinaigré…",
      "description": "…",
      "language": "fr",
      "pending": ["instagram", "tiktok"],
      "publications": [{ "platform": "tiktok", "status": "queued", "publishedAt": null, "postUrl": null, "note": null }],
      "social": [
        { "platform": "instagram", "title": "…", "description": "…", "caption": "…", "hashtags": ["…"] },
        { "platform": "tiktok", "title": "…", "description": "…", "caption": "Accroche…\nPlan 1 : …", "hashtags": ["…"] }
      ],
      "images": [
        { "format": "source", "width": 1440, "height": 1440, "url": "https://…/api/agent/images/<id>?expire=…&signature=…" },
        { "format": "9:16", "width": 810, "height": 1440, "url": "…" }
      ]
    }
  ]
}
```

Les liens des photos sont valables **1 heure** et ne demandent pas d'en-tête : les télécharger tout de suite.
Pour TikTok, utiliser le format `9:16` ; pour Instagram, `4:5` ou `1:1`.

## Rendre compte d'une publication

```
POST /api/agent/publications
Content-Type: application/json
```

Publié :

```json
{ "recipeId": "…", "platform": "tiktok", "status": "published", "postUrl": "https://www.tiktok.com/@…/video/…", "publishedAt": "2026-10-12T18:30:00+02:00" }
```

Échec :

```json
{ "recipeId": "…", "platform": "instagram", "status": "failed", "note": "Jeton Instagram expiré" }
```

Réponses : `200 { "ok": true }`, `400 invalid_body`, `404 recipe_not_found` (recette absente ou pas d'un administrateur).
Chaque compte rendu est inscrit au journal d'audit et s'affiche sur la page de la recette (« Publié sur TikTok le… »).
