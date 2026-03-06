'use client';

import { Prop, PROP_TYPES } from '@/types/character';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Package } from 'lucide-react';

interface PropCardProps {
  prop: Prop;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function PropCard({ prop, onEdit, onDelete }: PropCardProps) {
  const typeLabel = PROP_TYPES.find((t) => t.value === prop.type)?.label;

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
            {prop.referenceImages[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={prop.referenceImages[0]}
                alt={prop.name}
                className="h-full w-full object-cover rounded-lg"
              />
            ) : (
              <Package className="w-8 h-8 text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold truncate">{prop.name}</h3>
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

            {typeLabel && (
              <Badge variant="secondary" className="text-xs mt-1">
                {typeLabel}
              </Badge>
            )}

            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
              {prop.visualDescription}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
