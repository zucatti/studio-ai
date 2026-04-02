# Studio IA - Context for Claude Code

## Vue d'ensemble

Application web de pré-production vidéo assistée par IA. Pipeline complète : brainstorming → script → découpage → storyboard → production vidéo.

**Stack**: Next.js 16 + React 19 + TypeScript + Tailwind CSS + Supabase + BullMQ

## Structure du projet

```
studio/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Auth routes (sign-in, sign-up)
│   │   ├── (dashboard)/        # Protected routes
│   │   │   └── project/[projectId]/
│   │   │       ├── brainstorming/  # Idéation IA
│   │   │       ├── script/         # Éditeur de script
│   │   │       ├── storyboard/     # Storyboards générés
│   │   │       ├── decoupage/      # Découpage technique
│   │   │       ├── preprod/        # Préparation frames
│   │   │       ├── production/     # Génération vidéos
│   │   │       ├── shorts/         # Shorts musicaux
│   │   │       ├── quick-shot/     # Quick shots (mode rapide)
│   │   │       ├── clip/           # Timeline clips musicaux
│   │   │       ├── gallery/        # Galerie ressources
│   │   │       ├── bible/          # Personnages/lieux/props
│   │   │       └── rush/           # Rushes (footages)
│   │   └── api/                # 96+ API routes
│   ├── components/             # React Components
│   │   ├── ui/                 # Base shadcn/ui
│   │   ├── bible/              # Character/Location/Prop
│   │   ├── script/             # Script editor
│   │   ├── storyboard/         # Storyboard viewer
│   │   ├── decoupage/          # Shot breakdown
│   │   ├── production/         # Video generation
│   │   ├── shorts/             # Shorts & cinematic
│   │   ├── clip/               # Audio timeline
│   │   └── quick-shot/         # Quick shot generator
│   ├── hooks/                  # Custom hooks (use-project, use-scenes, etc.)
│   ├── store/                  # Zustand stores
│   ├── lib/                    # Utilities & services
│   │   ├── ai/                 # AI wrappers (claude, fal, runway, elevenlabs)
│   │   ├── bullmq/             # Job queue types & helpers
│   │   └── storage/            # B2 storage utils
│   └── types/                  # TypeScript types
├── worker/                     # Separate Node.js worker
│   ├── src/
│   │   ├── processors/         # Job processors (video, image, audio, ffmpeg)
│   │   ├── providers/          # Video providers (fal, wavespeed)
│   │   └── services/           # Generation services
│   └── package.json
├── supabase/                   # DB migrations
└── k8s/                        # Kubernetes deployment
```

## Providers IA

### Images
- **Nano Banana 2** (`fal-ai/nano-banana-2`) - Text-to-image rapide
- **Seedream 5** (`seedream-5`) - Alternative text-to-image
- **Kling O1** (`kling-o1` / `fal-ai/kling-image/o1`) - Avec images de référence

### Vidéos
- **Kling Omni** (`kling-omni`) - Video generation via fal.ai
- **Sora 2** (`sora-2`) - OpenAI video
- **Veo 3** (`veo-3`) - Google cinematic
- **OmniHuman** (`omnihuman`) - Character animation

### Audio
- **ElevenLabs** - TTS avec voix personnalisées

### Texte
- **Claude** (Anthropic) - Scripts, prompts, brainstorming

## Base de données (Supabase)

Tables principales:
- `projects` - Projets utilisateur
- `scenes` - Scènes du projet
- `shots` - Plans avec descriptions
- `characters`, `locations`, `props` - Bible du projet
- `global_assets` - Assets réutilisables
- `music_sections` - Sections musicales (clips)
- `generation_jobs` - Jobs en cours/terminés
- `credit_allocations` - Budgets par provider
- `api_usage_logs` - Logs d'utilisation

## Storage

**Backblaze B2** via API S3-compatible
- Format URLs: `b2://bucket-name/path/file.jpg`
- Conversion: `/api/storage/sign` → HTTPS signées

## Authentification

**Auth0** OAuth2/OIDC
- Middleware: `src/middleware.ts`
- Wrapper: `src/lib/auth0.ts`

## Worker (BullMQ)

5 queues:
- `video-gen` - Génération vidéo (3 concurrent, 7min timeout)
- `image-gen` - Génération image (5 concurrent, 90s timeout)
- `audio-gen` - Génération audio (5 concurrent, 30s timeout)
- `ffmpeg` - Processing vidéo (2 concurrent, 2min timeout)
- `quick-shot-gen` - Quick shots (4 concurrent, 2min timeout)

## Conventions de code

### Fichiers
- Components: `PascalCase.tsx`
- Utilities: `kebab-case.ts`
- Hooks: `use-kebab-case.ts`
- Stores: `kebab-case-store.ts`

### API Routes
```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  // 1. Auth check
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Access check (project ownership)
  // 3. Business logic
  // 4. Response
}
```

### Storage URLs
```typescript
// B2 URL → Signed HTTPS
const signedUrl = useSignedUrl(b2Url);
// ou
const response = await fetch(`/api/storage/sign?url=${encodeURIComponent(b2Url)}`);
```

## Scripts NPM

### Frontend (studio/)
```bash
npm run dev          # Start Next.js (port 3001)
npm run build        # Build production
npm run lint         # ESLint
```

### Worker (worker/)
```bash
npm run dev          # Start workers (tsx watch)
npm run build        # Compile TypeScript
npm start            # Start compiled workers
```

## Environment Variables

```env
# Auth0
AUTH0_SECRET, AUTH0_BASE_URL, AUTH0_ISSUER_BASE_URL
AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET

# Supabase
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# Storage (B2 via S3)
S3_ENDPOINT, S3_BUCKET, S3_KEY, S3_SECRET

# AI Providers
AI_FAL_KEY, AI_ELEVEN_LABS, ANTHROPIC_API_KEY

# Redis (BullMQ)
REDIS_HOST, REDIS_PORT
```

## Fonctionnalités principales

1. **Brainstorming** - Chat IA pour idéation
2. **Script Editor** - Markdown avec parsing Fountain
3. **Bible** - Personnages avec 5 types d'images, lieux, props
4. **Storyboard** - Génération d'images via fal.ai
5. **Découpage** - Plans avec mouvements caméra (38+ options)
6. **Production** - Génération vidéo multi-provider
7. **Clips** - Timeline audio avec WaveSurfer.js
8. **Shorts** - Cinematic presets avec génération automatique
9. **Quick Shots** - Génération rapide avec références (@Character, #Location, !Look)

## Références dans les prompts

- `@Character` - Mention personnage
- `#Location` ou `#Prop` - Mention lieu ou accessoire
- `!Look` - Variation de costume/style d'un personnage

Ces mentions sont parsées et les images de référence sont envoyées aux providers qui les supportent.
