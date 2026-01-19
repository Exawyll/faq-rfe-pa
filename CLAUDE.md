# FAQ PA RFE - Documentation Projet

## Description

Application FAQ pour la **Facturation Électronique** et les **Plateformes Agréées** en France. Permet aux clients de poser des questions et aux administrateurs d'y répondre, avec notifications par email.

**URL de production** : https://faq-rfe-pa-1025620012992.europe-west1.run.app

## Architecture

```
faq-pa-rfe/
├── src/
│   └── server.js          # Backend Express.js
├── public/
│   ├── index.html         # Page publique FAQ (split layout: formulaire + liste)
│   └── admin.html         # Panel administrateur
├── Dockerfile             # Image Docker pour Cloud Run
├── cloudbuild.yaml        # CI/CD Google Cloud Build
├── firestore.indexes.json # Index Firestore
├── package.json           # Dépendances Node.js
└── .env.example           # Variables d'environnement exemple
```

## Stack Technique

- **Backend** : Node.js + Express.js
- **Base de données** : Google Cloud Firestore (collection: `questions`) ou mock en mémoire
- **Frontend** : HTML/CSS/JS vanilla + bibliothèques CDN :
  - [marked.js](https://marked.js.org/) - Rendu Markdown
  - [DOMPurify](https://github.com/cure53/DOMPurify) - Sanitization HTML (sécurité XSS)
  - [Fuse.js](https://fusejs.io/) - Recherche floue (détection doublons)
- **Email** : SendGrid API
- **Hébergement** : Google Cloud Run
- **CI/CD** : Google Cloud Build (auto-deploy sur push to main)

## Variables d'Environnement

| Variable | Description |
|----------|-------------|
| `USE_MOCK_DB` | `true` pour utiliser une base en mémoire (dev local sans GCP) |
| `GCP_PROJECT_ID` | ID du projet GCP (`faq-rfe-pa`) - ignoré si USE_MOCK_DB=true |
| `ADMIN_PASSWORD` | Mot de passe admin |
| `SENDGRID_API_KEY` | Clé API SendGrid |
| `ADMIN_EMAIL` | Email qui reçoit les notifications de nouvelles questions |
| `FROM_EMAIL` | Email expéditeur (doit être vérifié dans SendGrid) |

Ces variables sont configurées dans le **trigger Cloud Build** via les substitution variables (`_ADMIN_PASSWORD`, `_SENDGRID_API_KEY`, etc.).

## API Endpoints

### Public

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/questions` | Questions répondues uniquement |
| GET | `/api/questions/all` | Toutes les questions (pending + answered) |
| POST | `/api/questions` | Soumettre une nouvelle question |

### Admin (requiert header `X-Admin-Password`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/admin/questions` | Toutes les questions |
| PUT | `/api/admin/questions/:id` | Répondre à une question |
| DELETE | `/api/admin/questions/:id` | Supprimer une question |
| POST | `/api/admin/verify` | Vérifier le mot de passe |
| GET | `/api/admin/export` | Export JSON |
| GET | `/api/admin/export/csv` | Export CSV |

## Fonctionnalités

### Page Publique (`/`)
- Formulaire de soumission de question (nom optionnel, email optionnel)
- **Détection de doublons** : suggestions de questions similaires en temps réel (Fuse.js)
- Liste des questions avec filtres par statut (Toutes, Répondues, En attente)
- Recherche textuelle dans questions/réponses/noms
- Boutons "Tout déplier" / "Tout replier"
- **Rendu Markdown** des réponses (gras, listes, code, liens, tableaux...)
- **Modale d'agrandissement** : bouton "Agrandir" pour lire les longues réponses
- Auto-refresh toutes les 10 secondes (préserve l'état des questions dépliées)

### Panel Admin (`/admin.html`)
- Authentification par mot de passe
- Liste de toutes les questions
- **Éditeur Markdown** avec toolbar et aperçu en temps réel
- Interface pour répondre aux questions
- Suppression de questions
- Export des données (JSON/CSV)

## Notifications Email

- **Nouvelle question** : Email envoyé à `ADMIN_EMAIL`
- **Réponse publiée** : Email envoyé au client (si email fourni)

Note: Les emails peuvent arriver en spam car le domaine `groupeonepoint.com` n'est pas authentifié (SPF/DKIM).

## Déploiement

### Automatique (CI/CD)
Chaque push sur `main` déclenche automatiquement :
1. Build de l'image Docker
2. Push vers Container Registry
3. Déploiement sur Cloud Run

### Manuel
```bash
# Build et push
gcloud builds submit --config cloudbuild.yaml

# Ou déploiement direct
gcloud run deploy faq-rfe-pa \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated
```

## Développement Local

```bash
# Installer les dépendances
npm install

# Créer le fichier .env à partir de .env.example
cp .env.example .env
# Configurer les variables (USE_MOCK_DB=true pour tester sans GCP)

# Lancer le serveur
npm start
# ou
npm run dev
```

Le serveur démarre sur http://localhost:8080

### Mode Mock (sans GCP)

Avec `USE_MOCK_DB=true` dans `.env`, l'application utilise une base de données en mémoire avec des données de test. Idéal pour :
- Tester l'UI sans configurer GCP
- Développer de nouvelles fonctionnalités
- Faire des démos

Les données sont perdues au redémarrage du serveur.

## Configuration GCP

- **Projet** : `faq-rfe-pa`
- **Région** : `europe-west1`
- **Services activés** :
  - Cloud Run
  - Cloud Build
  - Firestore (Native mode)
  - Container Registry

### IAM
Le service Cloud Run est configuré avec `allUsers` comme invoker pour permettre l'accès public.

## GitHub

- **Repository** : https://github.com/Exawyll/faq-rfe-pa
- **Trigger Cloud Build** : Configuré pour déclencher sur push to `main`

## Schema Firestore

Collection: `questions`

```javascript
{
  question: string,      // Texte de la question
  name: string,          // Nom du demandeur (défaut: "Anonyme")
  email: string | null,  // Email du demandeur (optionnel)
  status: "pending" | "answered",
  answer: string | null, // Réponse (null si pending)
  createdAt: string,     // ISO date
  answeredAt: string | null // ISO date (null si pending)
}
```

Index composite requis : `status ASC, answeredAt DESC` (défini dans `firestore.indexes.json`)

## Coûts GCP Estimés

Pour une utilisation légère (~1000 requêtes/jour) :
- Cloud Run : ~0-5€/mois (tier gratuit)
- Firestore : ~0€/mois (tier gratuit jusqu'à 50k lectures/jour)
- Container Registry : ~0.5€/mois
- **Total estimé** : ~0-10€/mois
