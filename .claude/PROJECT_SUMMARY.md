# Studio - Résumé Projet

## Vue d'ensemble

Application Next.js 16 pour la création de vidéos/shorts avec IA. Permet de gérer des personnages, lieux, accessoires, générer des images/vidéos via différents providers IA.

## Stack Technique

- **Frontend**: Next.js 16.1.6 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui
- **State**: Zustand (stores dans `/src/store/`)
- **Auth**: Auth0 v4 (`/src/lib/auth0.ts`)
- **Database**: Supabase (PostgreSQL + RLS)
- **Storage**: Backblaze B2 (S3-compatible) - URLs format `b2://bucket/key`
- **Deployment**: Docker + k3s (self-hosted) via GitHub Actions
- **CDN/SSL**: Cloudflare (proxy mode, SSL Full)

## Providers IA

| Provider | Usage | Env Var |
|----------|-------|---------|
| fal.ai | Images (défaut) | `AI_FAL_KEY` |
| WaveSpeed | Vidéos (défaut), OmniHuman | `AI_WAVESPEED` |
| Creatomate | Assemblage vidéo, concat | `AI_CREATOMATE_API` |
| ElevenLabs | Audio/voix TTS | `AI_ELEVEN_LABS` |
| Anthropic Claude | Prompts IA | `AI_ANTHROPIC` |
| Runway ML | Vidéos (alternatif) | `AI_RUNWAY_ML` |
| ModelsLab | Vidéos (fallback) | `AI_MODELS_LAB` |

## Structure Clé

```
/src
├── app/
│   ├── (dashboard)/           # Pages authentifiées
│   │   ├── project/[projectId]/
│   │   │   ├── shorts/        # Gestion des shorts
│   │   │   ├── rush/          # Galerie rush
│   │   │   └── gallery/       # Galerie projet
│   │   └── layout.tsx         # Layout avec QueueProvider
│   └── api/
│       ├── global-assets/[assetId]/
│       │   ├── generate-images/  # Génération sync
│       │   └── queue-generate/   # Génération async (queue)
│       ├── jobs/                 # API queue
│       │   ├── route.ts          # GET/POST jobs
│       │   ├── [jobId]/route.ts  # GET/DELETE job
│       │   └── webhook/route.ts  # Callback fal.ai
│       ├── projects/[projectId]/
│       │   ├── rush/             # Génération rush
│       │   ├── shots/[shotId]/
│       │   │   ├── generate-video/ # Génération vidéo
│       │   │   └── add-audio/      # Ajout audio
│       │   └── shorts/[shortId]/
│       │       └── assemble/     # Assemblage final
│       ├── health/route.ts       # Health check k8s
│       └── storage/
│           ├── sign/route.ts     # Signer URLs B2
│           └── [...path]/route.ts # Proxy + thumbnails
├── components/
│   ├── bible/                 # Gestion assets (personnages, lieux...)
│   ├── shorts/                # Composants shorts/plans
│   │   ├── PlanEditorModal.tsx
│   │   ├── VideoCard.tsx
│   │   └── PlanTimeline.tsx
│   ├── queue/                 # Système de queue
│   │   ├── QueuePanel.tsx     # Panel file d'attente
│   │   └── QueueProvider.tsx
│   └── ui/
│       ├── mention-textarea.tsx  # Input avec @mentions
│       └── storage-image.tsx     # Composants pour images B2
├── store/
│   ├── bible-store.ts         # Store assets globaux
│   ├── shorts-store.ts        # Store shorts/plans
│   └── jobs-store.ts          # Store queue jobs
├── middleware.ts              # Auth0 middleware (fix proxy HTTPS)
└── lib/
    ├── auth0.ts               # Config Auth0
    ├── storage.ts             # Client B2/S3
    ├── credits.ts             # Gestion crédits/budget
    └── ai/
        ├── video-provider.ts  # Providers vidéo
        └── creatomate-wrapper.ts # Wrapper Creatomate
```

## Déploiement K8s/K3s

### Architecture
```
GitHub Actions → ghcr.io → k3s cluster
                              ↓
                         nginx ingress
                              ↓
                         studio pods (x2)
                              ↓
                         Cloudflare (HTTPS)
```

### Fichiers K8s (`/k8s/`)
- `deployment.yaml` - 2 replicas, health probes, imagePullSecrets
- `service.yaml` - ClusterIP port 80 → 3000
- `ingress.yaml` - nginx, sans TLS (Cloudflare gère)
- `secrets.yaml` - Toutes les env vars (gitignored)
- `secrets.yaml.example` - Template

### GitHub Actions (`.github/workflows/deploy.yaml`)
```yaml
1. Build Docker image (multi-stage, standalone Next.js)
2. Push to ghcr.io/zucatti/studio-ai:latest
3. kubectl rollout restart deployment/studio -n ia-studio
```

### Secrets GitHub Actions
| Secret | Description |
|--------|-------------|
| `GITHUB_TOKEN` | Auto (pour ghcr.io) |
| `KUBE_CONFIG` | Kubeconfig k3s (brut, pas base64) |

### Dockerfile
- Multi-stage: deps → builder → runner
- Placeholders env vars pour build Next.js
- Output standalone pour image légère
- Port 3000

## Système de Vidéo

### Providers Vidéo (ordre de préférence)
1. **WaveSpeed** (défaut) - Kling 2.0/3.0, Seedance
2. **fal.ai** - Kling, Seedance, Hunyuan
3. **ModelsLab** - Fallback

### Modèles Vidéo Standard
| Modèle | Provider | Durées |
|--------|----------|--------|
| Kling 3.0 Pro | wavespeed | 5, 10s |
| Kling 2.0 Pro | wavespeed | 5, 10s |
| Seedance 1.0 | wavespeed | 5s |

### Modèles Dialogue (avec audio)
| Modèle | Provider | Durées |
|--------|----------|--------|
| OmniHuman 1.5 | wavespeed | 5, 10, 15s |
| OmniHuman 1.5 | fal | 5, 10s |

### Assemblage Vidéo (Creatomate)
- `concatenateVideos()` - Clips bout à bout (sans transition)
- `mergeVideoAudio()` - Vidéo + audio dialogue
- Polling status jusqu'à completion

## Système de Queue

### Table `generation_jobs`
```sql
- id, user_id, asset_id, asset_type, asset_name
- job_type (image/video/audio/look)
- job_subtype (front/profile/back/video model...)
- status (pending/queued/running/completed/failed/cancelled)
- fal_request_id, fal_endpoint
- input_data, result_data (JSONB)
- estimated_cost
- timestamps (created_at, queued_at, started_at, completed_at)
```

### Flow Génération Vidéo
```
1. POST /generate-video
2. Insert job (status: running)
3. SSE: job_created event → frontend fetchJobs()
4. Appel provider (WaveSpeed/fal)
5. Polling status
6. Upload résultat B2
7. Update shot + job (status: completed)
8. SSE: video_ready event
```

## Auth0 Behind Proxy

### Problème
Auth0 SDK ne détecte pas HTTPS derrière nginx/Cloudflare.

### Solution (`/src/middleware.ts`)
```typescript
// Force X-Forwarded-Proto header en production
if (process.env.NODE_ENV === 'production') {
  headers.set('x-forwarded-proto', 'https');
}
```

### Config Cloudflare
- SSL/TLS: **Full** (pas Strict, car pas de cert côté origin)
- Proxy: **Proxied** (orange cloud)

## Variables d'Environnement

### Auth
```env
AUTH0_SECRET=<32+ chars>
AUTH0_BASE_URL=https://studio.stevencreeks.com
AUTH0_ISSUER_BASE_URL=https://xxx.auth0.com
AUTH0_CLIENT_ID=xxx
AUTH0_CLIENT_SECRET=xxx
```

### Supabase
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### Storage B2
```env
S3_ENDPOINT=s3.eu-central-003.backblazeb2.com
S3_BUCKET=creeks-studio
S3_KEY=xxx
S3_SECRET=xxx
```

### AI Providers
```env
AI_FAL_KEY=xxx
AI_WAVESPEED=xxx
AI_ELEVEN_LABS=xxx
AI_ANTHROPIC=xxx
AI_CREATOMATE_API=xxx
AI_CREATOMATE_TOKEN=xxx
AI_RUNWAY_ML=xxx
AI_MODELS_LAB=xxx
```

### App
```env
NEXT_PUBLIC_APP_URL=https://studio.stevencreeks.com
```

## Récents Changements (Mars 2026)

### Suppression kling-dialog
- Modèle retiré (mauvaise qualité)
- Remplacé par OmniHuman 1.5 (WaveSpeed) pour dialogue

### Intégration Jobs pour Vidéo
- Génération vidéo passe par le système de queue
- Apparaît dans QueuePanel
- Fix FK constraint: `asset_id` null pour vidéos (stocké dans `input_data`)

### Assemblage Creatomate
- Suppression transition fade entre clips
- Clips bout à bout pour continuité fluide

### Déploiement K3s
- Migration Vercel → k3s self-hosted
- Docker multi-stage build
- GitHub Actions CI/CD
- Cloudflare comme CDN/SSL

### Fix Auth0 Proxy
- Middleware force X-Forwarded-Proto: https
- Résout erreur "exchange authorization code"

## Plan en Cours

Voir `/Users/zuccatti/.claude/plans/tingly-growing-stallman.md`:
- Rush (génération photos rapide)
- Galerie améliorée avec filtre aspect ratio
- Animation Prompt avec &in/&out
- Frame Picker depuis galerie

## Commandes Utiles

### Local
```bash
npm run dev          # Dev server
npm run build        # Build production
npm run lint         # ESLint
```

### K8s
```bash
kubectl get pods -n ia-studio
kubectl logs -f -n ia-studio -l app=studio
kubectl rollout restart deployment/studio -n ia-studio
kubectl exec -it -n ia-studio deploy/studio -- sh
```

### Docker
```bash
docker build -t studio .
docker run -p 3000:3000 --env-file .env.local studio
```
