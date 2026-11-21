# Sécurité

## Signaler une vulnérabilité

Merci de **ne pas ouvrir d'issue publique** pour une faille de sécurité.

Utiliser le signalement privé de GitHub : onglet **Security** du dépôt, puis **Report a vulnerability**. À défaut, passer par le formulaire de contact de https://www.miroirspolaires.fr.

Préciser si possible la page ou la route concernée, les étapes pour reproduire et l'impact constaté. Ce site est un projet personnel : la réponse se fait sur le temps libre, sans délai garanti.

## Périmètre

- Le site public https://www.miroirspolaires.fr et ses routes `/api/*`.
- Le worker de redimensionnement d'images (`workers/image-resizer/`).
- L'interface d'administration (`/admin`, `/api/admin/*`), qui ne répond qu'en développement et sur la Preview de la branche `dev`, derrière un login GitHub.

Les composants tiers listés dans `THIRD_PARTY_NOTICES.md` sont à signaler à leurs propres projets.
