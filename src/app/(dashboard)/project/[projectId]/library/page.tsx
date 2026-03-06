'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useLibraryStore } from '@/store/library-store';
import { Character, Prop, Location, PROP_TYPES, LOCATION_TYPES } from '@/types/character';
import { CharacterCard, PropCard, LocationCard } from '@/components/library';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Users, Package, MapPin, Library as LibraryIcon } from 'lucide-react';

type DialogType = 'character' | 'prop' | 'location' | null;

export default function LibraryPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const {
    getCharactersByProject,
    getPropsByProject,
    getLocationsByProject,
    addCharacter,
    updateCharacter,
    deleteCharacter,
    addProp,
    updateProp,
    deleteProp,
    addLocation,
    updateLocation,
    deleteLocation,
  } = useLibraryStore();

  const characters = getCharactersByProject(projectId);
  const props = getPropsByProject(projectId);
  const locations = getLocationsByProject(projectId);

  const [dialogType, setDialogType] = useState<DialogType>(null);
  const [editingItem, setEditingItem] = useState<Character | Prop | Location | null>(null);

  // Character form
  const [characterForm, setCharacterForm] = useState({
    name: '',
    description: '',
    visualDescription: '',
    age: '',
    gender: '' as Character['gender'] | '',
  });

  // Prop form
  const [propForm, setPropForm] = useState({
    name: '',
    type: 'object' as Prop['type'],
    visualDescription: '',
  });

  // Location form
  const [locationForm, setLocationForm] = useState({
    name: '',
    type: 'interior' as Location['type'],
    visualDescription: '',
    lighting: '',
    mood: '',
  });

  const openCharacterDialog = (character?: Character) => {
    if (character) {
      setEditingItem(character);
      setCharacterForm({
        name: character.name,
        description: character.description,
        visualDescription: character.visualDescription,
        age: character.age || '',
        gender: character.gender || '',
      });
    } else {
      setEditingItem(null);
      setCharacterForm({
        name: '',
        description: '',
        visualDescription: '',
        age: '',
        gender: '',
      });
    }
    setDialogType('character');
  };

  const openPropDialog = (prop?: Prop) => {
    if (prop) {
      setEditingItem(prop);
      setPropForm({
        name: prop.name,
        type: prop.type,
        visualDescription: prop.visualDescription,
      });
    } else {
      setEditingItem(null);
      setPropForm({
        name: '',
        type: 'object',
        visualDescription: '',
      });
    }
    setDialogType('prop');
  };

  const openLocationDialog = (location?: Location) => {
    if (location) {
      setEditingItem(location);
      setLocationForm({
        name: location.name,
        type: location.type,
        visualDescription: location.visualDescription,
        lighting: location.lighting || '',
        mood: location.mood || '',
      });
    } else {
      setEditingItem(null);
      setLocationForm({
        name: '',
        type: 'interior',
        visualDescription: '',
        lighting: '',
        mood: '',
      });
    }
    setDialogType('location');
  };

  const handleSaveCharacter = () => {
    if (editingItem) {
      updateCharacter(editingItem.id, {
        ...characterForm,
        gender: characterForm.gender || undefined,
      });
    } else {
      addCharacter({
        id: crypto.randomUUID(),
        projectId,
        ...characterForm,
        gender: characterForm.gender || undefined,
        referenceImages: [],
      });
    }
    setDialogType(null);
  };

  const handleSaveProp = () => {
    if (editingItem) {
      updateProp(editingItem.id, propForm);
    } else {
      addProp({
        id: crypto.randomUUID(),
        projectId,
        ...propForm,
        referenceImages: [],
      });
    }
    setDialogType(null);
  };

  const handleSaveLocation = () => {
    if (editingItem) {
      updateLocation(editingItem.id, locationForm);
    } else {
      addLocation({
        id: crypto.randomUUID(),
        projectId,
        ...locationForm,
        referenceImages: [],
      });
    }
    setDialogType(null);
  };

  const handleDelete = (type: 'character' | 'prop' | 'location', id: string) => {
    if (!confirm('Supprimer cet élément ?')) return;
    if (type === 'character') deleteCharacter(id);
    if (type === 'prop') deleteProp(id);
    if (type === 'location') deleteLocation(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <LibraryIcon className="w-5 h-5" />
        <h2 className="text-xl font-semibold">Bibliothèque</h2>
      </div>

      <Tabs defaultValue="characters" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="characters" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Personnages ({characters.length})
          </TabsTrigger>
          <TabsTrigger value="props" className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Accessoires ({props.length})
          </TabsTrigger>
          <TabsTrigger value="locations" className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Lieux ({locations.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="characters" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button onClick={() => openCharacterDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un personnage
            </Button>
          </div>
          {characters.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Aucun personnage défini.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {characters.map((character) => (
                <CharacterCard
                  key={character.id}
                  character={character}
                  onEdit={() => openCharacterDialog(character)}
                  onDelete={() => handleDelete('character', character.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="props" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button onClick={() => openPropDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un accessoire
            </Button>
          </div>
          {props.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Aucun accessoire défini.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {props.map((prop) => (
                <PropCard
                  key={prop.id}
                  prop={prop}
                  onEdit={() => openPropDialog(prop)}
                  onDelete={() => handleDelete('prop', prop.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="locations" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button onClick={() => openLocationDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un lieu
            </Button>
          </div>
          {locations.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Aucun lieu défini.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {locations.map((location) => (
                <LocationCard
                  key={location.id}
                  location={location}
                  onEdit={() => openLocationDialog(location)}
                  onDelete={() => handleDelete('location', location.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Character Dialog */}
      <Dialog open={dialogType === 'character'} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Modifier le personnage' : 'Nouveau personnage'}
            </DialogTitle>
            <DialogDescription>
              Définissez les caractéristiques du personnage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nom</Label>
              <Input
                value={characterForm.name}
                onChange={(e) =>
                  setCharacterForm({ ...characterForm, name: e.target.value })
                }
                placeholder="Nom du personnage"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Âge (optionnel)</Label>
                <Input
                  value={characterForm.age}
                  onChange={(e) =>
                    setCharacterForm({ ...characterForm, age: e.target.value })
                  }
                  placeholder="35"
                />
              </div>
              <div>
                <Label>Genre (optionnel)</Label>
                <Select
                  value={characterForm.gender}
                  onValueChange={(v) =>
                    setCharacterForm({
                      ...characterForm,
                      gender: v as Character['gender'],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Homme</SelectItem>
                    <SelectItem value="female">Femme</SelectItem>
                    <SelectItem value="non_binary">Non-binaire</SelectItem>
                    <SelectItem value="other">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={characterForm.description}
                onChange={(e) =>
                  setCharacterForm({ ...characterForm, description: e.target.value })
                }
                placeholder="Personnalité, background..."
                rows={2}
              />
            </div>
            <div>
              <Label>Description visuelle</Label>
              <Textarea
                value={characterForm.visualDescription}
                onChange={(e) =>
                  setCharacterForm({
                    ...characterForm,
                    visualDescription: e.target.value,
                  })
                }
                placeholder="Apparence physique, vêtements..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>
              Annuler
            </Button>
            <Button onClick={handleSaveCharacter} disabled={!characterForm.name.trim()}>
              {editingItem ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prop Dialog */}
      <Dialog open={dialogType === 'prop'} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Modifier l\'accessoire' : 'Nouvel accessoire'}
            </DialogTitle>
            <DialogDescription>
              Définissez les caractéristiques de l&apos;accessoire.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nom</Label>
              <Input
                value={propForm.name}
                onChange={(e) => setPropForm({ ...propForm, name: e.target.value })}
                placeholder="Nom de l'accessoire"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={propForm.type}
                onValueChange={(v) => setPropForm({ ...propForm, type: v as Prop['type'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROP_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description visuelle</Label>
              <Textarea
                value={propForm.visualDescription}
                onChange={(e) =>
                  setPropForm({ ...propForm, visualDescription: e.target.value })
                }
                placeholder="Apparence, matériaux, couleurs..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>
              Annuler
            </Button>
            <Button onClick={handleSaveProp} disabled={!propForm.name.trim()}>
              {editingItem ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Location Dialog */}
      <Dialog open={dialogType === 'location'} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Modifier le lieu' : 'Nouveau lieu'}
            </DialogTitle>
            <DialogDescription>
              Définissez les caractéristiques du lieu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nom</Label>
              <Input
                value={locationForm.name}
                onChange={(e) =>
                  setLocationForm({ ...locationForm, name: e.target.value })
                }
                placeholder="Nom du lieu"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={locationForm.type}
                onValueChange={(v) =>
                  setLocationForm({ ...locationForm, type: v as Location['type'] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description visuelle</Label>
              <Textarea
                value={locationForm.visualDescription}
                onChange={(e) =>
                  setLocationForm({
                    ...locationForm,
                    visualDescription: e.target.value,
                  })
                }
                placeholder="Décor, ambiance, détails architecturaux..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Éclairage (optionnel)</Label>
                <Input
                  value={locationForm.lighting}
                  onChange={(e) =>
                    setLocationForm({ ...locationForm, lighting: e.target.value })
                  }
                  placeholder="Lumière naturelle, néons..."
                />
              </div>
              <div>
                <Label>Ambiance (optionnel)</Label>
                <Input
                  value={locationForm.mood}
                  onChange={(e) =>
                    setLocationForm({ ...locationForm, mood: e.target.value })
                  }
                  placeholder="Mystérieux, chaleureux..."
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>
              Annuler
            </Button>
            <Button onClick={handleSaveLocation} disabled={!locationForm.name.trim()}>
              {editingItem ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
