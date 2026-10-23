# Module Prescriptions

## Architecture

Le domaine est isolé dans `src/prescriptions`. `PrescriptionsController` expose l’API REST, `PrescriptionsService` orchestre les transactions, et les services spécialisés portent les règles d’autorisation, de sécurité, de réglementation, de numérotation, de PDF et de stockage. Toutes les recherches d’ordonnance appliquent d’abord le `workspaceId` résolu côté serveur par `WorkspaceContextService`; aucune valeur de tenant ou de prescripteur envoyée par le client n’est utilisée pour décider du scope.

Les entités principales sont `Prescription`, `PrescriptionItem`, `MedicationReference` et `PrescriptionDocument`. Une ordonnance appartient obligatoirement à un workspace, un patient et un `DoctorProfile`. La consultation est facultative. Les relations vers le patient, le prescripteur, les auteurs et le document final utilisent `Restrict`; aucun historique médical finalisé n’est supprimé en cascade. Seuls les items d’un brouillon supprimé utilisent la cascade depuis leur ordonnance.

## Cycle de vie et immutabilité

Le cycle stocké est `DRAFT → PENDING_VALIDATION → VALIDATED → CANCELED`. Un médecin peut aussi valider directement un brouillon. `EXPIRED` est uniquement un `effectiveStatus` calculé lorsqu’une ordonnance `VALIDATED` dépasse `validUntil`. Une impression conserve le statut clinique et met à jour `printedAt`/`printCount`.

Seuls les brouillons peuvent être modifiés ou supprimés. Après validation, le numéro, les items, snapshots, empreinte et document PDF ne sont plus modifiés par l’API. L’annulation ajoute uniquement le statut, la date, l’acteur et le motif. Le renouvellement crée un nouveau brouillon relié par `basedOnPrescriptionId`; l’ancienne ordonnance et son PDF restent intacts.

## Permissions cliniques

- `INDEPENDENT_DOCTOR` et `AFFILIATED_DOCTOR` : consultation, création, édition, validation, annulation et impression.
- `ESTABLISHMENT_ADMIN` : consultation et impression uniquement.

Les opérations cliniques relisent le compte, le profil médecin, la vérification professionnelle, l’abonnement du médecin indépendant et le membership actif. La validation exige le numéro d’Ordre et le conseil régional présents dans `DoctorVerificationData`. Un administrateur d’établissement ne peut jamais signer ou annuler en raison de son seul rôle administratif.

## Scope patient et consultation

L’accès patient réutilise `PatientsService.getPatientInScope`. Une absence ou une ressource d’un autre workspace donne une réponse introuvable sans confirmer son existence. La création et la validation exigent un patient administrativement actif. Une consultation fournie doit appartenir au même patient et être accessible au prescripteur.

## Snapshots, empreinte et PDF

La validation fige les snapshots patient, prescripteur, organisation, assurance, contexte clinique, sécurité et réglementation. Les champs du catalogue médicament sont également copiés dans chaque `PrescriptionItem`. Le PDF final est toujours produit à partir de ces valeurs figées et jamais depuis les données courantes du patient ou du médecin.

L’empreinte logique SHA-256 est calculée sur un JSON canonique aux clés triées contenant le numéro, les snapshots imprimés, la date, le type, les items et le snapshot réglementaire. Le PDF A4 est rendu avec le même moteur Playwright/Chromium que les comptes rendus IA. Son SHA-256 est enregistré séparément et contrôlé avant chaque consultation. Le fichier est écrit sous `patients/<patientId>/prescriptions/<prescriptionId>/` avec un nom généré par le serveur.

`PrescriptionDocument` impose une unicité par ordonnance. Un `PatientDocument` de type `PRESCRIPTION` est créé avec le même chemin et checksum : aucun octet n’est dupliqué. Les accès suivants servent toujours ce fichier archivé et ne le régénèrent pas.

## Numérotation et concurrence

`ClinicalDocumentSequence` contient une ligne par type et année. Un `upsert` avec incrément atomique exécuté dans la transaction de validation attribue `ORD-AAAA-NNNNNN`; aucun `count()+1` n’est utilisé. La transition finale utilise une mise à jour conditionnelle sur `DRAFT/PENDING_VALIDATION`, et les contraintes uniques sur le numéro et le document garantissent un seul gagnant en cas de validations concurrentes. Le fichier d’une transaction perdante est supprimé et l’appel retourne le document gagnant déjà validé.

## Réglementation et sécurité clinique

Le type minimal de l’ordonnance est automatiquement relevé à la catégorie la plus stricte de ses items. Les catégories spéciales exigent un acknowledgement et peuvent exiger une référence de carnet via `PRESCRIPTION_REQUIRE_CARNET_REFERENCE=true`. Le snapshot rappelle que HealixDz ne remplace pas les supports réglementaires officiels.

La V1 vérifie uniquement les données réellement disponibles : doublon exact, correspondance exacte entre DCI et allergie structurée, catégorie réglementée, champs de posologie requis et durée positive. Interactions complètes, grossesse, fonctions rénale/hépatique, contre-indications et calculs complexes sont explicitement marqués `NOT_EVALUATED`; aucune conclusion clinique n’est inventée.

## Audit et notifications

Les actions `PRESCRIPTION_CREATED`, `UPDATED`, `SUBMITTED`, `VALIDATED`, `CANCELED`, `RENEWED`, `PDF_GENERATED`, `DOCUMENT_VIEWED`, `PRINTED` et `DRAFT_DELETED` sont inscrites avec `entityType=PRESCRIPTION`. Les métadonnées se limitent au statut, au nombre d’items et aux identifiants techniques; elles ne contiennent ni patient, ni diagnostic, ni allergie, ni posologie. Les notifications de validation/annulation réutilisent le module existant et ne transportent que `prescriptionId` et éventuellement le numéro.

## Endpoints

- `GET /api/prescriptions`, `/stats`, `/capabilities`, `/medications`, `/prescriber-context`
- `GET /api/prescriptions/patients/:patientId/context`
- `GET /api/prescriptions/:id`, `/:id/history`, `/:id/pdf`
- `POST /api/prescriptions`, `/:id/submit`, `/:id/validate`, `/:id/cancel`, `/:id/renew`, `/:id/printed`
- `PATCH /api/prescriptions/:id`
- `DELETE /api/prescriptions/:id` (brouillon uniquement)

La liste est paginée (20 par défaut, 50 maximum) et renvoie une vue légère sans snapshots ni contenu PDF. Le détail passe par un mapper unique et masque les données non nécessaires. `PRINTED` n’est pas un statut clinique; `EXPIRED` est calculé; les contenus médicaux réels ne sont jamais traduits automatiquement.

> Le module HealixDz Prescription est un outil de support à la prescription. Il ne constitue pas à lui seul une certification réglementaire ni un système officiel de prescription électronique.
