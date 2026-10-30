# Démonstration de HealixDz Desktop — déroulé de la soutenance

Le parcours d'un médecin **sans Internet** : rendez-vous, consultation complète,
ordonnance avec contrôles de sécurité, impression, puis retour du réseau et
synchronisation. Durée : **10 minutes**.

Tout repose sur le jeu de démonstration (`npm run seed:demo`) : « Dr
Démonstration », 8 patients fictifs, 5 rendez-vous aujourd'hui, 3 consultations
passées, 1 ordonnance validée. **Aucune donnée réelle.**

---

## 1. Vérifications de la veille (J-1)

À faire sur **le PC qui servira à la démonstration**, avec le réseau.

### Données

- [ ] Base de **démonstration** (jamais la production : le script refuse
      `NODE_ENV=production`, sauf `ALLOW_DEMO_SEED=1`).
- [ ] Jeu de données chargé pour **le jour de la soutenance** :

  ```bash
  cd backend
  DEMO_SEED_DAY=2026-11-12 npm run seed:demo      # PowerShell : $env:DEMO_SEED_DAY="2026-11-12"; npm run seed:demo
  ```

  Sans `DEMO_SEED_DAY`, les rendez-vous sont ceux **du jour où le script
  s'exécute**. Le script est idempotent : on peut le relancer sans rien
  dupliquer. Il affiche l'adresse du médecin et son mot de passe
  (`DEMO_DOCTOR_PASSWORD` pour en choisir un autre).
- [ ] Dans l'application web, connecté en médecin : 8 patients, 5 rendez-vous
      à la date de la démonstration (dont **10:00 — Amine Benali — Toux
      persistante**), 3 consultations, l'ordonnance `ORD-DEMO-000001`.
- [ ] Décalage horaire : si la répétition a lieu l'après-midi,
      `DEMO_SLOT_SHIFT_MINUTES=…` décale les rendez-vous.

### Le PC

- [ ] **Connexion du matin, en ligne** : l'autorisation hors ligne dure **24 h par défaut**
      (`OFFLINE_GRANT_LIFETIME_HOURS`). Une ouverture faite la veille au soir
      expire avant le début de la démonstration ; une ouverture faite le matin
      tient toute la journée. Cette connexion apporte aussi le cabinet et
      l'identité du prescripteur qui figurent sur l'ordonnance imprimée.
- [ ] Version affichée en bas de page : « HealixDz Desktop v0.1.0 bêta ».
- [ ] **Imprimante** : « **Microsoft Print to PDF** » est présente
      (Paramètres → Bluetooth et appareils → Imprimantes et scanners). Une
      imprimante réelle, si possible, **testée** une fois. Faire un essai
      d'impression complet la veille.
- [ ] WebView2 présent (livré avec Windows 11 et Edge).
- [ ] Heure et fuseau du PC corrects (un recul d'horloge bloque l'application).
- [ ] Fenêtre à 1280 × 800 ou plus ; zoom Windows à 100 %–125 %.
- [ ] Notifications Windows coupées (« Ne pas déranger »), mise en veille
      désactivée, PC branché sur secteur, mises à jour Windows reportées.
- [ ] Une seconde session ouverte sur l'application **web** (même médecin), pour
      montrer l'arrivée des données au retour du réseau.

### Plan de secours

- [ ] Captures de chaque étape : `docs/release/captures/`.
- [ ] Une courte vidéo de la démonstration, enregistrée la veille.
- [ ] Le PDF d'une ordonnance imprimée : `docs/release/captures/prescription-print.pdf`.

## 2. Le matin de la démonstration (T-30 min)

1. Brancher le PC, ouvrir **HealixDz Desktop**, se **connecter en ligne**
   (médecin de démonstration). Laisser la synchronisation se terminer :
   la pastille de la barre latérale indique « En ligne » et la page
   **Aujourd'hui** affiche les 5 rendez-vous.
2. Si les données ont été (re)chargées après cette connexion, cliquer sur
   **Synchroniser maintenant** (page Synchronisation) : le script publie aussi
   ses lignes dans le flux de synchronisation.
3. Ouvrir une fois le dossier d'Amine Benali : il apparaît dans « Patients
   récents ». Revenir sur **Aujourd'hui**.
4. Vérifier que l'icône réseau de Windows est à portée de main (mode avion).

## 3. Déroulé minute par minute

| Temps | Action | Ce que le jury voit |
| --- | --- | --- |
| **0:00** | Page **Aujourd'hui**. Présenter : la barre latérale (mêmes sections que la plateforme web), les 4 tuiles, « Rendez-vous du jour ». | Rendez-vous triés par heure, pastilles de statut identiques au web, pastille **« En ligne »**, « Dernière synchro ». |
| **1:00** | Parler de la contrainte : un cabinet sans réseau fiable. | Les données sont déjà **sur le PC, chiffrées** (SQLCipher). |
| **1:30** | **Couper le Wi-Fi** (icône réseau → mode avion). | La pastille passe à **« Hors ligne »** ; le bandeau « Hors ligne — vos modifications seront synchronisées au retour de la connexion » apparaît. Healix AI se grise. |
| **2:00** | Rendez-vous **10:00 — Amine Benali — Toux persistante** : **Démarrer la consultation**. | L'éditeur s'ouvre, **patient et motif déjà remplis**. |
| **2:30** | Constantes : **150 / 95**, FC 92, SpO₂ **93**, température **38,4**, poids 82,5, taille 178. | L'**IMC est calculé**. Sous les champs, **en toutes lettres** : « Tension élevée », « Saturation basse », « Fièvre », « Surpoids » (la couleur ne fait que répéter). |
| **3:30** | Examen clinique, évaluation. **Ajouter un diagnostic** : « Bronchite aiguë », code J20 (principal) ; « Hypertension artérielle », I10. | Un seul diagnostic principal : désigner l'autre le remplace. |
| **4:15** | Montrer l'indicateur en bas : « **Enregistré sur cet appareil à 09:42** ». | L'enregistrement est automatique (au plus 10 s, et à la sortie d'un champ) : rien ne se perd. |
| **4:30** | **Terminer la consultation**. | « Consultation terminée… » + bouton **Rédiger l'ordonnance**. |
| **5:00** | **Rédiger l'ordonnance** : médicament **Amoxicilline** 1 g, 1 comprimé, 2 fois par jour, 6 jours, 1 boîte. | Alerte **critique** « Correspondance exacte avec une allergie structurée connue » (Amine est allergique à l'amoxicilline), résumé en haut **et** sous la ligne. **L'enregistrement est bloqué** : case « Je confirme… malgré l'allergie connue » + motif obligatoire. |
| **6:00** | Remplacer par **Paracétamol** 1 g. | L'alerte disparaît, l'enregistrement est possible. (Option : Amlodipine → alerte « figure déjà dans les traitements actuels ».) |
| **6:30** | **Imprimer**. Choisir **Microsoft Print to PDF** et enregistrer. | L'ordonnance est d'abord **enregistrée**, la boîte d'impression de Windows s'ouvre. |
| **7:15** | Ouvrir le PDF. | Cabinet, **Patient / Prescripteur (n° d'Ordre) / Médicaments**, « Fait à Bordj Bou Arréridj, le… », cadre cachet/signature, et la mention **« Établie hors ligne le … — numéro attribué lors de la synchronisation »** (pas de numéro, pas d'empreinte : c'est un brouillon). |
| **8:00** | Retour sur **Aujourd'hui** (barre latérale). | Le rendez-vous 10:00 affiche **« Consultation faite »** ; la tuile et la barre latérale indiquent **2 opérations en attente**. |
| **8:30** | **Rétablir le Wi-Fi**. | La synchronisation démarre **toute seule** ; « En ligne », le compteur retombe à **0**, « Dernière synchro : à l'instant ». |
| **9:00** | Sur l'application **web** : la consultation (constantes, diagnostics, lien avec le rendez-vous) et l'ordonnance (brouillon, numéro officiel à la validation). | Le même dossier des deux côtés ; aucun doublon. |
| **10:00** | Conclusion. | — |

## 4. Si quelque chose se passe mal

| Symptôme | Que faire |
| --- | --- |
| « Autorisation hors ligne expirée » au démarrage | Se reconnecter **en ligne**, puis couper le réseau. Cela ne doit pas arriver si la connexion date du matin. |
| La synchronisation ne démarre pas au retour du réseau | Page **Synchronisation** → **Synchroniser maintenant**. |
| La boîte d'impression ne s'ouvre pas | Un message l'explique : **Enregistrer la version imprimable** télécharge la même page ; l'ouvrir dans un navigateur, puis Imprimer → Microsoft Print to PDF. Sinon, montrer `prescription-print.pdf`. |
| « Les coordonnées du prescripteur ne sont pas disponibles » (bouton Imprimer grisé) | La connexion du matin n'a pas rapporté l'identité du prescripteur (serveur ancien). Se reconnecter en ligne. |
| Un rendez-vous manque | Le jeu de données n'a pas été chargé pour ce jour : relancer le seed avec `DEMO_SEED_DAY`, puis **Synchroniser maintenant**. |
| L'alerte d'allergie n'apparaît pas | Le patient n'est pas Amine Benali, ou la DCI est mal saisie : l'alerte exige la **DCI exacte** (« Amoxicilline »). |

## 5. Ce qu'il faut savoir dire

- **Ce qui marche hors ligne** : lecture du cabinet, consultation complète,
  brouillon d'ordonnance et son impression. **Ce qui exige Internet** : la
  validation officielle de l'ordonnance (numéro, empreinte, PDF archivé),
  Healix AI, la création et la modification des rendez-vous.
- **Les contrôles de sécurité** sont ceux du serveur (même code de règles,
  vérifié par des tests communs) plus un contrôle propre au Desktop (médicament
  déjà dans les traitements actuels). Ils ne remplacent pas le jugement du
  médecin : interactions, contre-indications complexes, grossesse, fonctions
  rénale et hépatique **ne sont pas évalués** ; l'écran le dit.
- **La confirmation malgré une allergie** est tracée dans le journal d'audit
  de l'appareil (avec son motif).
- Un brouillon imprimé n'a **pas de valeur de prescription officielle** tant
  qu'il n'est pas validé en ligne.
- **Limites** : l'impression dépend de la WebView ; le jeu de démonstration est
  fictif ; le verrouillage local (PIN) n'est pas encore en place.
