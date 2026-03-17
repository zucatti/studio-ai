'use client';

import { useState, useEffect } from 'react';
import {
  User,
  MapPin,
  Package,
  Check,
  AlertCircle,
  Link2,
  Plus,
  Loader2,
  Search,
  Film,
  Hash,
  AtSign,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { ExtractedResource, ScriptBreakdown } from '@/lib/script-breakdown';

interface ScriptBreakdownViewProps {
  projectId: string;
}

type ResourceType = 'location' | 'character' | 'prop';

const RESOURCE_CONFIG: Record<ResourceType, {
  icon: typeof User;
  label: string;
  labelPlural: string;
  color: string;
  bgColor: string;
  prefix: '@' | '#';
}> = {
  character: {
    icon: User,
    label: 'Personnage',
    labelPlural: 'Personnages',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    prefix: '@',
  },
  location: {
    icon: MapPin,
    label: 'Lieu',
    labelPlural: 'Lieux',
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    prefix: '#',
  },
  prop: {
    icon: Package,
    label: 'Accessoire',
    labelPlural: 'Accessoires',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
    prefix: '#',
  },
};

export function ScriptBreakdownView({ projectId }: ScriptBreakdownViewProps) {
  const [breakdown, setBreakdown] = useState<ScriptBreakdown | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Section collapse state
  const [sectionsOpen, setSectionsOpen] = useState({
    locations: true,
    characters: true,
    props: true,
  });

  // Link/Create dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<ExtractedResource | null>(null);
  const [dialogMode, setDialogMode] = useState<'link' | 'create'>('link');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; asset_type: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create form state
  const [createForm, setCreateForm] = useState({
    name: '',
    visual_description: '',
  });

  // Fetch breakdown data
  const fetchBreakdown = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/breakdown`);
      if (!res.ok) throw new Error('Failed to fetch breakdown');
      const data = await res.json();
      setBreakdown(data);
      setError(null);
    } catch (err) {
      setError('Erreur lors de l\'analyse du script');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBreakdown();
  }, [projectId]);

  // Search Bible assets
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim() || !selectedResource) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const assetType = selectedResource.type === 'character' ? 'character' : selectedResource.type;
      const res = await fetch(`/api/global-assets?search=${encodeURIComponent(query)}&type=${assetType}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.assets || []);
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Open dialog for a resource
  const handleOpenDialog = (resource: ExtractedResource) => {
    setSelectedResource(resource);
    setDialogMode('link');
    setSearchQuery('');
    setSearchResults([]);
    setCreateForm({
      name: resource.name,
      visual_description: '',
    });
    setDialogOpen(true);
  };

  // Link to existing asset
  const handleLink = async (assetId: string) => {
    if (!selectedResource) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/breakdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceType: selectedResource.type,
          resourceName: selectedResource.name,
          action: 'link',
          assetId,
        }),
      });

      if (res.ok) {
        setDialogOpen(false);
        fetchBreakdown(); // Refresh
      }
    } catch (err) {
      console.error('Link error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create new asset
  const handleCreate = async () => {
    if (!selectedResource || !createForm.name.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/breakdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceType: selectedResource.type,
          resourceName: selectedResource.name,
          action: 'create',
          assetData: {
            name: createForm.name,
            visual_description: createForm.visual_description,
          },
        }),
      });

      if (res.ok) {
        setDialogOpen(false);
        fetchBreakdown(); // Refresh
      }
    } catch (err) {
      console.error('Create error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
        <span className="ml-2 text-slate-400">Analyse du script...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-red-400">{error}</p>
        <Button variant="outline" onClick={fetchBreakdown} className="mt-4">
          Réessayer
        </Button>
      </div>
    );
  }

  if (!breakdown || breakdown.totalCount === 0) {
    return (
      <div className="text-center py-12">
        <Film className="w-12 h-12 text-slate-500 mx-auto mb-4" />
        <p className="text-slate-400">Aucune ressource trouvée dans le script</p>
        <p className="text-sm text-slate-500 mt-2">
          Ajoutez des scènes et utilisez @personnages et #lieux dans vos actions
        </p>
      </div>
    );
  }

  const renderResourceSection = (
    type: ResourceType,
    resources: ExtractedResource[],
    isOpen: boolean,
    onToggle: () => void
  ) => {
    const config = RESOURCE_CONFIG[type];
    const Icon = config.icon;
    const linkedCount = resources.filter(r => r.linkedAssetId).length;
    const unlinkedCount = resources.length - linkedCount;

    return (
      <Collapsible open={isOpen} onOpenChange={onToggle}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-3">
              <div className={cn('p-2 rounded-lg', config.bgColor)}>
                <Icon className={cn('w-5 h-5', config.color)} />
              </div>
              <div className="text-left">
                <h3 className="font-medium text-white">{config.labelPlural}</h3>
                <p className="text-xs text-slate-400">
                  {resources.length} trouvé{resources.length > 1 ? 's' : ''}
                  {unlinkedCount > 0 && (
                    <span className="text-amber-400 ml-2">
                      • {unlinkedCount} non lié{unlinkedCount > 1 ? 's' : ''}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {linkedCount === resources.length && resources.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <Check className="w-3.5 h-3.5" />
                  Complet
                </span>
              )}
              {isOpen ? (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-slate-400" />
              )}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 space-y-1">
            {resources.map((resource, idx) => (
              <ResourceRow
                key={`${resource.reference}-${idx}`}
                resource={resource}
                config={config}
                onLink={() => handleOpenDialog(resource)}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Dépouillement</h2>
          <p className="text-sm text-slate-400">
            {breakdown.totalCount} ressource{breakdown.totalCount > 1 ? 's' : ''} •{' '}
            {breakdown.unlinkedCount > 0 ? (
              <span className="text-amber-400">
                {breakdown.unlinkedCount} à lier
              </span>
            ) : (
              <span className="text-green-400">Tout est lié</span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchBreakdown}
          className="border-white/10"
        >
          <Loader2 className={cn('w-4 h-4 mr-2', isLoading && 'animate-spin')} />
          Actualiser
        </Button>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {breakdown.locations.length > 0 &&
          renderResourceSection(
            'location',
            breakdown.locations,
            sectionsOpen.locations,
            () => setSectionsOpen(s => ({ ...s, locations: !s.locations }))
          )}

        {breakdown.characters.length > 0 &&
          renderResourceSection(
            'character',
            breakdown.characters,
            sectionsOpen.characters,
            () => setSectionsOpen(s => ({ ...s, characters: !s.characters }))
          )}

        {breakdown.props.length > 0 &&
          renderResourceSection(
            'prop',
            breakdown.props,
            sectionsOpen.props,
            () => setSectionsOpen(s => ({ ...s, props: !s.props }))
          )}
      </div>

      {/* Link/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md bg-[#0d1520] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              {selectedResource && (
                <>
                  {RESOURCE_CONFIG[selectedResource.type as ResourceType].prefix === '@' ? (
                    <AtSign className="w-5 h-5 text-blue-400" />
                  ) : (
                    <Hash className="w-5 h-5 text-green-400" />
                  )}
                  {selectedResource.name}
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-white/10 pb-2">
            <button
              onClick={() => setDialogMode('link')}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md transition-colors',
                dialogMode === 'link'
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              <Link2 className="w-4 h-4 inline mr-1.5" />
              Lier à existant
            </button>
            <button
              onClick={() => setDialogMode('create')}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md transition-colors',
                dialogMode === 'create'
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              <Plus className="w-4 h-4 inline mr-1.5" />
              Créer nouveau
            </button>
          </div>

          {dialogMode === 'link' ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Rechercher dans la Bible..."
                  className="pl-9 bg-white/5 border-white/10"
                />
              </div>

              {isSearching ? (
                <div className="py-4 text-center">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {searchResults.map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => handleLink(asset.id)}
                      disabled={isSubmitting}
                      className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 text-left transition-colors"
                    >
                      {asset.asset_type === 'character' ? (
                        <User className="w-4 h-4 text-blue-400" />
                      ) : asset.asset_type === 'location' ? (
                        <MapPin className="w-4 h-4 text-green-400" />
                      ) : (
                        <Package className="w-4 h-4 text-orange-400" />
                      )}
                      <span className="text-white">{asset.name}</span>
                    </button>
                  ))}
                </div>
              ) : searchQuery ? (
                <p className="text-sm text-slate-500 text-center py-4">
                  Aucun résultat. Essayez de créer un nouveau.
                </p>
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">
                  Tapez pour rechercher dans la Bible
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 block mb-1.5">Nom</label>
                <Input
                  value={createForm.name}
                  onChange={(e) => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 block mb-1.5">
                  Description visuelle (pour la génération IA)
                </label>
                <Textarea
                  value={createForm.visual_description}
                  onChange={(e) => setCreateForm(f => ({ ...f, visual_description: e.target.value }))}
                  placeholder="Décrivez l'apparence en détail..."
                  className="bg-white/5 border-white/10 min-h-[100px]"
                />
              </div>
            </div>
          )}

          {dialogMode === 'create' && (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="border-white/10"
              >
                Annuler
              </Button>
              <Button
                onClick={handleCreate}
                disabled={isSubmitting || !createForm.name.trim()}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Créer et lier
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Resource row component
function ResourceRow({
  resource,
  config,
  onLink,
}: {
  resource: ExtractedResource;
  config: typeof RESOURCE_CONFIG[ResourceType];
  onLink: () => void;
}) {
  const isLinked = !!resource.linkedAssetId;
  const PrefixIcon = config.prefix === '@' ? AtSign : Hash;

  return (
    <div
      className={cn(
        'flex items-center justify-between p-2 pl-4 rounded-lg transition-colors',
        isLinked ? 'bg-green-500/5' : 'bg-amber-500/5 hover:bg-amber-500/10'
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <PrefixIcon className={cn('w-4 h-4 flex-shrink-0', config.color)} />
        <div className="min-w-0">
          <p className="text-sm text-white truncate">{resource.name}</p>
          <p className="text-xs text-slate-500">
            {resource.occurrences}× • Scènes {resource.scenes.join(', ')}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {isLinked ? (
          <span className="flex items-center gap-1 text-xs text-green-400 px-2 py-1 rounded bg-green-500/10">
            <Check className="w-3.5 h-3.5" />
            {resource.linkedAssetName || 'Lié'}
          </span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onLink}
            className="h-7 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
          >
            <Link2 className="w-3.5 h-3.5 mr-1" />
            Lier
          </Button>
        )}
      </div>
    </div>
  );
}
