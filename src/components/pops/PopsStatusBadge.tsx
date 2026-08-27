import React from 'react';
import { Badge } from '@/components/ui/badge';

const MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  foco: { label: 'FOCO', variant: 'outline' },
  em_andamento: { label: 'EM ANDAMENTO', variant: 'secondary' },
  servicada: { label: 'SERVIÇADA', variant: 'default' },
};

export const PopsStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const item = MAP[status] ?? { label: status.toUpperCase(), variant: 'outline' as const };
  return (
    <Badge variant={item.variant} className="text-[10px] tracking-wide">
      {item.label}
    </Badge>
  );
};
