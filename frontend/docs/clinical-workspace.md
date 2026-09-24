# Healix Clinical System — refonte établissement

## Périmètre

L’établissement devient un centre opérationnel : activité du jour, demandes à traiter,
flux patients, activité clinique, activité récente, assistance IA, actions rapides et
statut du compte. Le statut n’est plus une métrique métier.

Aucun changement backend, endpoint inventé, nouvelle dépendance ni modification
de l’authentification. Le contenu du dashboard médecin est conservé. Admin et
Login/Register ne reçoivent pas le nouveau thème clinique.

## Fichiers et composants

- `src/app/dashboard-theme.css` : tokens cliniques sous `.clinical-theme`, surfaces,
  rayons, contrastes, responsive, RTL, réduction du mouvement et compatibilité des anciens tokens.
- `src/components/dashboard/layout/` : Shell, Content, Sidebar, Header et navigation
  refactorisés ; nouveaux `WorkspaceSearch` et `WorkspaceLink`.
- `src/components/dashboard/establishment/EstablishmentDashboard.tsx` : composition
  du centre opérationnel et séparation des sources de données.
- `src/components/dashboard/shared/` : nouveaux `ClinicalWorkspaceHeader`,
  `OperationalMetricCard`, `AttentionQueue`, `PatientFlow`, `ClinicalActivityChart`,
  `HealixAIWidget`, `CompactQuickActions`, `WorkspaceStatus`.
- `ActivityTable.tsx`, `StatusBadge.tsx`, `src/types/dashboard.ts` : table plus dense,
  typographie adaptée et liens d’action uniquement lorsqu’une destination existe.
- `src/components/subscription/PaymentCheckoutModal.tsx` : portée du thème clinique
  conservée à travers le portail du modal.
- `src/i18n/locales/{fr,ar}/clinical-workspace.ts` et `dashboard.ts` : textes et intégration FR/AR.
- `src/data/dashboard-establishment.mock.ts` : seules données métier de démonstration.
- `scripts/clinical-workspace.test.mjs` : cinq tests sans dépendance supplémentaire.

## Identité et fonctionnement

Teal médical pour l’identité, navy pour la navigation, bleu pour les actions, violet
réservé au widget IA et doré discret pour le statut professionnel. Les textes utilisent
des variantes plus contrastées que certains accents de marque. Rayons : 4, 6, 8, 12 px.
Le thème sombre mélange navy et surfaces neutres à nuance clinique.

La sidebar est repliable sur desktop et devient un drawer avec focus piégé, fermeture
Échap et retour du focus sur mobile. Les sections passent de deux colonnes à une sur
mobile, les métriques de quatre à deux ; graphiques et tables peuvent défiler dans leur
propre conteneur. RTL inverse navigation, alignements, marges et flèches ; les fractions
numériques sont isolées en LTR pour rester non ambiguës.

La recherche Ctrl/⌘ K filtre uniquement les destinations de navigation locales. Elle
ne recherche pas de dossiers médicaux et l’indique explicitement. Les modules encore
liés à des ancres affichent une information « module à venir » sans créer de données.
Les périodes 7/90 jours restent désactivées, seule la présentation 30 jours est disponible.

## Sources des données

- Réel : identité de l’utilisateur et statut du compte via `useCurrentUser` et
  `getDashboardAccountStatusPresentation` ; nom et vérification de l’établissement via
  le hook existant `useEstablishmentVerificationPrefill`.
- Démonstration clairement signalée : toutes les métriques du jour, la file à traiter,
  le flux patients, le graphique, les activités récentes et les volumes/statuts IA.
- Une identité indisponible utilise un intitulé générique, jamais un nom de clinique inventé.
- Les activités de démonstration ne proposent pas de faux liens vers des dossiers réels.

## Validation locale

- `npm run lint` : zéro erreur ; avertissement préexistant `next/no-img-element` dans
  `components/admin/verifications/detail/VerificationDocumentModal.tsx:167`.
- `npx tsc --noEmit` : réussi.
- `npm run build` : réussi, avec accès réseau pour les polices Google déjà configurées.
- `node --experimental-strip-types --test scripts/clinical-workspace.test.mjs` : 5/5.
  Node 22 peut afficher son avertissement de détection automatique ESM pour les imports TypeScript.
- Navigateur : 375, 768, 1024, 1440 et 1920 px, FR/AR, clair/sombre ; aucun débordement
  global constaté dans les sections du nouveau dashboard. Drawer, repli, Échap,
  recherche clavier, recherche vide, sélecteurs de langue/thème et modules à venir vérifiés.
- Paires sémantiques de texte mesurées : contraste minimal 4,65:1 en clair et 5,66:1
  en sombre. Ce contrôle ciblé ne remplace pas un audit WCAG complet.
- Les aperçus de développement établissement, médecin, patients, vérification,
  abonnement et Admin se chargent sans erreur JavaScript ni écran d’erreur Next.js.
- Les huit routes établissement/médecin demandées répondent par une redirection 307
  vers Login sans session ; Login/Register et la route Admin répondent 200.

Les vérifications visuelles utilisent les aperçus de développement existants
`/theme-review/*`, pas des comptes de production. Les opérations authentifiées de
création de patient, soumission de documents et paiement n’ont pas été exécutées.
