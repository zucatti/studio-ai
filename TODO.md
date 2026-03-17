# TODO - Studio IA

## Personnages - Variantes nommées

### Concept
Permettre de référencer un personnage avec une variante spécifique dans le script :
```
@Maya                    → Image par défaut (face)
@Maya[casquette]         → Variante avec casquette
@Maya[robe_soirée]       → Variante robe de soirée
@Maya[sport]             → Variante tenue sport
```

### Implémentation
1. **Système de tags sur les images de référence**
   - Chaque image a un slug unique (`front`, `profile`, `casquette`, `robe_soirée`...)
   - Images par défaut : `front`, `profile`, `back`, `three_quarter`
   - Images custom : slug défini par l'utilisateur

2. **Parser de script**
   - Reconnaître la syntaxe `@Nom[variante]`
   - Fallback sur image par défaut si variante non trouvée

3. **Autocomplétion dans l'éditeur**
   - `@Maya[` → propose les variantes disponibles

4. **Découpage / Génération**
   - Utiliser automatiquement la bonne image de référence

---

## Personnages - Restructuration des onglets

### Onglet Références (actuel)
- [ ] Garder les 5 vues de base (face, profil, dos, 3/4, autre)
- [ ] Ajouter possibilité d'images libres supplémentaires
- [ ] Chaque image peut avoir un tag/slug pour les variantes

### Onglet Situations (ex-Looks)
- [ ] Renommer "Looks" en "Situations"
- [ ] Portfolio / Mood board du personnage en contexte
- [ ] Exemples : "café au bistrot", "court sous la pluie"

---

## Découpage - Auto-détection

### Concept
Au moment du découpage, détecter automatiquement les @références et pré-remplir les besoins :
- Personnages (avec variante si spécifiée)
- Lieux
- Props

### Implémentation
- [ ] Parser les @références dans le texte du shot
- [ ] Lier automatiquement aux assets de la bible
- [ ] Proposer les assets manquants à créer

---

## Bible - Assets manquants

### Lieux
- [ ] Créer le système de lieux (similaire aux personnages)
- [ ] Images de référence pour les décors
- [ ] Tags : intérieur/extérieur, jour/nuit, etc.

### Props
- [ ] Créer le système de props
- [ ] Images de référence
- [ ] Catégorisation

---

## Modèles IA

### Roue crantée pour changer de modèle
- [ ] Ajouter un bouton discret (gear icon) à côté du sélecteur de style
- [ ] Permettre de choisir entre :
  - Nano Banana 2 (défaut)
  - Flux Pro 1.1
  - Ideogram
  - Autres...

---

## Notes techniques

### Nano Banana 2 (Google Gemini 3.1 Flash)
- Endpoint : `fal-ai/nano-banana-2`
- Prix : $0.08/image (1K), $0.16/image (4K)
- Supporte : 4K, 15 aspect ratios
- Utilisé pour : génération text-to-image de personnages

### Ideogram Character
- Utilisé pour : consistance de personnage avec image de référence

### Perspective
- Utilisé pour : rotation de vue (face → profil, etc.)
