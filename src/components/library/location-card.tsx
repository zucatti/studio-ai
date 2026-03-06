'use client';

import { Location, LOCATION_TYPES } from '@/types/character';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, MapPin, Sun, Sparkles } from 'lucide-react';

interface LocationCardProps {
  location: Location;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function LocationCard({ location, onEdit, onDelete }: LocationCardProps) {
  const typeLabel = LOCATION_TYPES.find((t) => t.value === location.type)?.label;

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <div className="aspect-video relative bg-muted">
        {location.referenceImages[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={location.referenceImages[0]}
            alt={location.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <MapPin className="w-12 h-12 text-muted-foreground" />
          </div>
        )}

        {typeLabel && (
          <Badge className="absolute top-2 left-2" variant="secondary">
            {typeLabel}
          </Badge>
        )}
      </div>

      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold">{location.name}</h3>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onEdit}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
          {location.visualDescription}
        </p>

        <div className="flex flex-wrap gap-2 mt-3">
          {location.lighting && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Sun className="w-3 h-3" />
              <span>{location.lighting}</span>
            </div>
          )}
          {location.mood && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Sparkles className="w-3 h-3" />
              <span>{location.mood}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
