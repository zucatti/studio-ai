# Studio - Résumé Projet

## Vue d'ensemble

Application Next.js 15 pour la création de vidéos/shorts avec IA. Permet de gérer des personnages, lieux, accessoires, générer des images/vidéos via différents providers IA.

## Stack Technique

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui
- **State**: Zustand (stores dans `/src/store/`)
- **Auth**: Auth0 (`/src/lib/auth0.ts`)
- **Database**: Supabase (PostgreSQL + RLS)
- **Storage**: Backblaze B2 (S3-compatible) - URLs format `b2://bucket/key`
- **Providers IA**:
  - fal.ai (images) - `AI_FAL_KEY`
  - PiAPI (Kling vidéos) - `PIAPI_API_KEY`
  - Creatomate (rendu vidéo) - `CREATOMATE_API_KEY`
  - ElevenLabs (audio/voix) - `ELEVENLABS_API_KEY`
  - Anthropic Claude (prompts) - `AI_CLAUDE_KEY`

## Structure Clé

```
/src
├── app/
│   ├── (dashboard)/           # Pages authentifiées
│   │   ├── project/[projectId]/
│   │   │   ├── shorts/        # Gestion des shorts
│   │   │   └── rush/          # Galerie rush (à implémenter)
│   │   └── layout.tsx         # Layout avec QueueProvider
│   └── api/
│       ├── global-assets/[assetId]/
│       │   ├── generate-images/  # Génération sync
│       │   └── queue-generate/   # Génération async (queue)
│       ├── jobs/                 # API queue
│       │   ├── route.ts          # GET/POST jobs
│       │   ├── [jobId]/route.ts  # GET/DELETE job
│       │   └── webhook/route.ts  # Callback fal.ai
│       └── storage/
│           ├── sign/route.ts     # Signer URLs B2
│           └── [...path]/route.ts # Proxy + thumbnails
├── components/
│   ├── bible/                 # Gestion assets (personnages, lieux...)
│   │   ├── BibleAssetCard.tsx
│   │   └── CharacterFormDialog.tsx
│   ├── queue/                 # Système de queue
│   │   ├── QueuePanel.tsx     # Panel file d'attente
│   │   └── QueueProvider.tsx
│   └── ui/
│       └── storage-image.tsx  # Composants pour images B2
├── store/
│   ├── bible-store.ts         # Store assets globaux
│   ├── shorts-store.ts        # Store shorts/plans
│   └── jobs-store.ts          # Store queue jobs
└── lib/
    ├── storage.ts             # Client B2/S3
    ├── fal-utils.ts           # Utilitaires fal.ai
    └── credits.ts             # Gestion crédits/budget
```

## Système de Queue (EN COURS)

### Architecture
```
Client → POST /api/queue-generate
         ↓
      Insert job (Supabase: generation_jobs)
         ↓
      fal.queue.submit(endpoint, { webhookUrl })
         ↓
      [fal.ai traite en arrière-plan]
         ↓
      POST /api/jobs/webhook (callback)
         ↓
      Update job + asset dans Supabase
```

### Table `generation_jobs`
```sql
- id, user_id, asset_id, asset_type, asset_name
- job_type (image/video/audio/look)
- job_subtype (front/profile/back...)
- status (pending/queued/running/completed/failed/cancelled)
- fal_request_id, fal_endpoint
- input_data, result_data (JSONB)
- timestamps (created_at, queued_at, started_at, completed_at)
```

### Fichiers Queue
- `/src/app/api/jobs/route.ts` - Liste/crée jobs
- `/src/app/api/jobs/[jobId]/route.ts` - Status/annulation
- `/src/app/api/jobs/webhook/route.ts` - Webhook fal.ai
- `/src/app/api/global-assets/[assetId]/queue-generate/route.ts` - Queue génération
- `/src/store/jobs-store.ts` - Zustand store
- `/src/components/queue/QueuePanel.tsx` - UI panel

### État actuel
- ✅ Table Supabase créée
- ✅ APIs implémentées
- ✅ UI Panel implémenté
- ✅ fal.ai queue intégré (image-to-image perspective)
- 🔄 En test
- ⏳ À faire: Creatomate, PiAPI, ElevenLabs

## Génération d'Images Personnages

### Modes
1. **generate_single** - Une vue (front/profile/back/three_quarter)
2. **generate_all** - Les 3 vues depuis description
3. **generate_variations** - Profile/back depuis image uploadée
4. **generate_look** - Variation costume/tenue

### Flow Profile/Back depuis Front
```
Front image → fal-ai/image-apps-v2/perspective → Profile/Back
              (target_perspective: three_quarter_right / back)
```

### Modèles Text-to-Image
- `fal-ai/nano-banana-2` (défaut, 4K)
- `seedream-5` (ByteDance)
- `flux-2-pro` (Black Forest Labs)
- `gpt-image-1.5` (OpenAI)

## Système de Thumbnails

### Endpoint `/api/storage/[...path]?w=SIZE`
- Redimensionne à la volée avec Sharp
- Cache 3 niveaux: mémoire → B2 → navigateur
- Tailles autorisées: 48, 80, 96, 160, 320, 640, 1280
- Output: WebP optimisé

### Composant `StorageThumbnail`
- Extrait la clé B2 depuis `b2://bucket/key`
- Appelle `/api/storage/KEY?w=SIZE`
- Fallback placeholder si erreur

## Points d'Attention

1. **URLs B2**: Format `b2://bucket/key`, signées via `/api/storage/sign`
2. **RLS Supabase**: Policies basées sur `user_id = current_setting('request.jwt.claims')::json->>'sub'`
3. **Webhooks**: Doivent être accessibles publiquement (NEXT_PUBLIC_APP_URL)
4. **Timeouts Vercel**: Max 60s (Pro), webhooks nécessaires pour jobs longs

## Plan en Cours

Voir `/Users/zuccatti/.claude/plans/tingly-growing-stallman.md`:
- Rush (génération photos rapide)
- Galerie améliorée
- Animation Prompt avec &in/&out
- Frame Picker depuis galerie

## Variables d'Environnement Clés

```env
# Auth
AUTH0_SECRET, AUTH0_BASE_URL, AUTH0_ISSUER_BASE_URL, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET

# Supabase
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# Storage B2
S3_ENDPOINT, S3_KEY, S3_SECRET, S3_BUCKET

# AI Providers
AI_FAL_KEY, AI_CLAUDE_KEY, PIAPI_API_KEY, CREATOMATE_API_KEY, ELEVENLABS_API_KEY

# App
NEXT_PUBLIC_APP_URL (pour webhooks)
```
