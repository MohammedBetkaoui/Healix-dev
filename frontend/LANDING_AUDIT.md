# Audit et direction de la landing HealixDz

## État initial

- `page.tsx` assemblait 13 sections avant le CTA et le footer. PlatformBento, ClinicalWorkflow, ProductTour et InteroperabilitySection répétaient plusieurs fois l'idée de dossier et de workflows reliés.
- Le hero chargeait une vidéo d'ambiance de 6,87 Mo et plaçait le produit au second plan.
- `consultation-healixdz.png` est une photographie générée, selon `public/landing/SOURCES.md`, et non une capture d'interface.
- ProductTour présentait un circuit laboratoire explicitement étiqueté comme démonstration. Il ne devait pas servir de preuve produit principale.
- Les pages FR et AR avaient déjà des contenus distincts, un conteneur `dir="rtl"`, les routes `/register` et `/login`, un JSON-LD SoftwareApplication et les prix issus de `config/subscription-plans.ts`.
- La base visuelle vert profond / ivoire, les contrastes principaux, la carte des wilayas et le langage des bordures méritaient d'être conservés.

## Direction retenue

Le hero et l'exploration du produit utilisent des captures des composants applicatifs HealixDz, rendus sur la route interne de prévisualisation avec données fictives. Les vues retenues sont le registre patients, l'agenda, l'espace établissement, l'espace médecin et le parcours Healix AI. Le statut de démonstration des données est indiqué près des captures. Trois sélecteurs ont été retenus parce qu'aucune quatrième capture de qualité d'une autre fonctionnalité n'était disponible sans créer un faux écran.

La page suit désormais : hero, bande institutionnelle, produit en situation, parcours clinique, profils, Healix AI, confiance, contexte algérien, tarifs, FAQ, CTA et footer. La vidéo et le circuit laboratoire ne sont plus montés dans la page. Les tarifs restent issus de la configuration produit, sans prix marketing inventés.

## Référence UI/UX Pro Max

La [documentation du projet](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) et son [outil de recherche](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/src/ui-ux-pro-max/scripts/search.py) ont été consultés. Le skill n'était pas installé localement ; les commandes `search.py` demandées conditionnellement n'ont donc pas pu être exécutées. Les règles utiles retenues sont le contrôle du contraste, des états de focus, du responsive, des mouvements réduits et de la densité. Les couleurs, la typographie et les captures restent propres à HealixDz.

## Vérification

Captures de revue dans `../landing-review/` : 1440, 1280, 768, 390 et 360 px en français et en arabe, ainsi que les principales sections. Les largeurs de document relevées sur 390 et 360 px correspondent à la largeur du viewport, sans débordement horizontal. Le sélecteur produit passe de « Patients » à « Agenda » et charge la capture correspondante. Les sept ancres de navigation existent et la page ne comporte qu'un H1. Le contrôle TypeScript, ESLint ciblé, les 1 169 tests et le build de production passent. Le build a nécessité l'accès aux polices Google utilisées par `next/font`.
