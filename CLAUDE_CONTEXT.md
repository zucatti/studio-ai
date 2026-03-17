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
