# Studio IA - Production Vidéo

## Vue d'ensemble
Application de pré-production vidéo avec génération IA d'images et de contenu.

## Stack technique
- **Framework**: Next.js 16 (App Router)
- **UI**: React, TypeScript, Tailwind CSS, shadcn/ui
- **State**: Zustand
- **Backend**: Supabase (auth, database)
- **Storage**: Backblaze B2 (images) avec URLs signées
- **IA Images**: fal.ai (flux-pro, ideogram)
- **IA Texte**: Claude API (optimisation prompts)
- **Audio**: ElevenLabs (voix personnages)

## Structure principale

### Pages principales
- `/projects` - Liste des projets
- `/project/[projectId]/script` - Éditeur de script
- `/project/[projectId]/storyboard` - Storyboard
- `/project/[projectId]/decoupage` - Découpage technique
- `/project/[projectId]/clip` - Timeline clip musical avec sections et plans

### Composants clés

#### Bible des personnages (`/src/components/bible/`)
- `CharacterFormDialog.tsx` - Dialog création/édition personnage
  - Onglets: Références (Face, Profil, Dos, 3/4, Autre), Looks, Audio
  - Upload d'images + génération IA
  - Sélection voix ElevenLabs
- `BibleAssetCard.tsx` - Carte d'affichage asset (personnage, lieu, prop)
- `BibleCharacters.tsx` - Liste des personnages
- `ProjectBible.tsx` - Vue globale de la bible

#### Storage (`/src/components/ui/storage-image.tsx`)
- `StorageImage` - Composant Next.js Image avec URLs B2 signées
- `StorageImg` - Simple img avec URLs B2 signées
- `StorageBackgroundDiv` - Div avec background-image B2

#### Hooks importants
- `useSignedUrl` - Résout les URLs `b2://` en URLs signées
- `useProjectEntities` - Entités du projet (personnages, lieux, props)

### API Routes

#### Assets globaux
- `/api/global-assets` - CRUD assets globaux
- `/api/global-assets/[assetId]/generate-images` - Génération IA images
  - Modes: `generate_single`, `generate_all`, `generate_look`

#### Storage
- `/api/storage/sign` - Signature URLs B2
- `/api/upload` - Upload fichiers vers B2

## Conventions

### URLs de stockage
- Format B2: `b2://bucket-name/path/to/file.jpg`
- Résolution via `/api/storage/sign` → URL HTTPS signée temporaire

### Types d'images personnage
- `front` (Face) - Vue de face, requis pour génération IA
- `profile` (Profil) - Vue de côté
- `back` (Dos) - Vue arrière
- `three_quarter` (3/4) - Vue trois-quarts
- `custom` (Autre) - Image personnalisée

### Génération IA personnages
1. Requiert une image "front" (face) uploadée
2. Utilise la description visuelle du personnage
3. Claude optimise le prompt
4. fal.ai génère l'image

## Notes importantes
- Les images utilisent `object-contain` pour afficher l'image entière sans troncature
- Les labels d'images ont un fond noir (`bg-black/70`) pour la lisibilité
- Spinner pendant l'upload d'images
- Bouton + pour importer un personnage dans un projet
- Click sur carte = ouvre modification (avec stopPropagation sur boutons)

## Clip Timeline (Music Videos)

### Vue d'ensemble
Timeline pour clips musicaux avec waveform audio (WaveSurfer.js), sections musicales et plans (shots).

### Structure
```
Audio Track (WaveSurfer.js + RegionsPlugin)
├── Sections (verse, chorus, bridge, etc.)
│   └── Shots/Plans (filmstrip sub-timeline)
```

### Contraintes des plans
- **Durée minimum**: 3 secondes (limite IA video generators comme Kling, Runway)
- **Durée maximum**: 15 secondes (idem)
- **Mode "collé"**: Les plans sont toujours adjacents (pas de gaps)

### Comportement resize
- Resize d'un plan pousse/tire le plan adjacent pour maintenir la continuité
- Limites physiques: le resize s'arrête aux bornes (3s min, 15s max) sans toast
- Split: cliquer sur un plan le divise en deux, avec auto-ajustement pour respecter les contraintes

### Fichiers clés

#### Composant principal
- `src/components/clip/ClipTimeline.tsx` - Timeline avec waveform et gestion des shots
  - Constantes: `MIN_SHOT_DURATION = 3`, `MAX_SHOT_DURATION = 15`
  - État: `resizingShot`, `shots` par section
  - Handlers: `handleResizeMove`, `handleFilmstripClick` (split), `handleShotDelete`

#### API Routes
- `api/projects/[projectId]/sections/[sectionId]/shots/route.ts`
  - GET: récupère tous les shots d'une section
  - POST: crée un shot (valide contraintes 3-15s)
- `api/projects/[projectId]/sections/[sectionId]/shots/[shotId]/route.ts`
  - PATCH: met à jour un shot (position, description)
  - DELETE: supprime un shot

#### Hooks
- `src/hooks/use-sections.ts` - CRUD sections musicales

### Base de données
- Table `music_sections`: sections avec start_time, end_time, section_type, color
- Table `shots`: plans avec section_id, relative_start, sort_order
  - `relative_start`: position du plan par rapport au début de la section
  - `sort_order`: `Math.round(relative_start * 1000)` pour tri integer

### Notes techniques
- Audio B2 via proxy temporaire (`/api/storage/proxy`) pendant propagation CORS
- Création automatique d'une scène par défaut si aucune n'existe
- Shot `sort_order` doit être un integer (utiliser `Math.round()`)
