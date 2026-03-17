'use client';

import { useState, useEffect } from 'react';
import { MapPin, ChevronDown, Plus, AlertCircle, Sun, Moon, Cloud } from 'lucide-react';
import { StorageImg } from '@/components/ui/storage-image';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBibleStore } from '@/store/bible-store';
import { cn } from '@/lib/utils';

interface Location {
  id: string;
  name: string;
  data?: {
    description?: string;
    int_ext?: 'INT' | 'EXT' | 'INT/EXT';
    reference_images?: string[];
  };
}

interface LocationPickerProps {
  projectId: string;
  locationId: string | null;
  locationName: string | null;
  intExt: string | null;
  timeOfDay: string | null;
  onChange: (data: {
    location_id: string;
    location: string;
    int_ext: string;
    time_of_day: string;
  }) => void;
  className?: string;
}

const TIME_OF_DAY_OPTIONS = [
  { value: 'JOUR', label: 'Jour', icon: Sun },
  { value: 'NUIT', label: 'Nuit', icon: Moon },
  { value: 'AUBE', label: 'Aube', icon: Cloud },
  { value: 'CREPUSCULE', label: 'Crepuscule', icon: Cloud },
  { value: 'CONTINU', label: 'Continu', icon: null },
];

const INT_EXT_OPTIONS = [
  { value: 'INT', label: 'INT.' },
  { value: 'EXT', label: 'EXT.' },
  { value: 'INT/EXT', label: 'INT/EXT.' },
];

export function LocationPicker({
  projectId,
  locationId,
  locationName,
  intExt,
  timeOfDay,
  onChange,
  className,
}: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const { projectAssets, fetchProjectAssets, setOpen: openBible, setActiveTab } = useBibleStore();

  // Get locations from Bible (project assets)
  const locations: Location[] = projectAssets
    .filter((asset) => asset.asset_type === 'location')
    .map((asset) => ({
      id: asset.id,
      name: asset.name,
      data: asset.data as Location['data'],
    }));

  useEffect(() => {
    if (projectId) {
      fetchProjectAssets(projectId);
    }
  }, [projectId, fetchProjectAssets]);

  const selectedLocation = locations.find((l) => l.id === locationId);

  const handleSelectLocation = (location: Location) => {
    onChange({
      location_id: location.id,
      location: location.name,
      int_ext: location.data?.int_ext || intExt || 'INT',
      time_of_day: timeOfDay || 'JOUR',
    });
    setOpen(false);
  };

  const handleIntExtChange = (value: string) => {
    if (selectedLocation) {
      onChange({
        location_id: selectedLocation.id,
        location: selectedLocation.name,
        int_ext: value,
        time_of_day: timeOfDay || 'JOUR',
      });
    }
  };

  const handleTimeChange = (value: string) => {
    if (selectedLocation) {
      onChange({
        location_id: selectedLocation.id,
        location: selectedLocation.name,
        int_ext: intExt || 'INT',
        time_of_day: value,
      });
    }
  };

  const handleOpenBible = () => {
    setOpen(false);
    setActiveTab('locations');
    openBible(true);
  };

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {/* INT/EXT selector */}
      <Select value={intExt || 'INT'} onValueChange={handleIntExtChange} disabled={!selectedLocation}>
        <SelectTrigger className="w-20 bg-white/5 border-white/10 text-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-[#1a2433] border-white/10">
          {INT_EXT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-white">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Location picker */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              'flex-1 min-w-[180px] justify-between bg-white/5 border-white/10 text-white hover:bg-white/10',
              !selectedLocation && 'text-slate-500'
            )}
          >
            <div className="flex items-center gap-2 truncate">
              <MapPin className="w-4 h-4 flex-shrink-0 text-green-400" />
              <span className="truncate uppercase">
                {selectedLocation?.name || locationName || 'Selectionner un lieu'}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 ml-2 flex-shrink-0 text-slate-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-72 p-0 bg-[#1a2433] border-white/10"
          align="start"
        >
          {locations.length === 0 ? (
            <div className="p-4 text-center">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
              <p className="text-sm text-slate-400 mb-3">
                Aucun lieu dans la Bible
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenBible}
                className="gap-2 bg-blue-500/20 border-blue-500/30 text-blue-400 hover:bg-blue-500/30"
              >
                <Plus className="w-4 h-4" />
                Ajouter un lieu
              </Button>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {locations.map((location) => (
                <button
                  key={location.id}
                  onClick={() => handleSelectLocation(location)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                    location.id === locationId
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-white hover:bg-white/5'
                  )}
                >
                  {location.data?.reference_images?.[0] ? (
                    <StorageImg
                      src={location.data.reference_images[0]}
                      alt={location.name}
                      className="w-10 h-10 rounded object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-slate-700 flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-slate-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {location.data?.int_ext && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-slate-400">
                          {location.data.int_ext}
                        </span>
                      )}
                      <p className="text-sm font-medium uppercase truncate">
                        {location.name}
                      </p>
                    </div>
                    {location.data?.description && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {location.data.description}
                      </p>
                    )}
                  </div>
                </button>
              ))}

              {/* Add location button */}
              <button
                onClick={handleOpenBible}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left border-t border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <div className="w-10 h-10 rounded bg-white/5 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <span className="text-sm">Ajouter un lieu...</span>
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Time of day selector */}
      <Select value={timeOfDay || 'JOUR'} onValueChange={handleTimeChange} disabled={!selectedLocation}>
        <SelectTrigger className="w-32 bg-white/5 border-white/10 text-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-[#1a2433] border-white/10">
          {TIME_OF_DAY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-white">
              <div className="flex items-center gap-2">
                {opt.icon && <opt.icon className="w-4 h-4" />}
                <span>{opt.label}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
