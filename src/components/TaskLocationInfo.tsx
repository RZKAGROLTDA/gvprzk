import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  MapPin, 
  Navigation,
  CheckCircle,
  Clock,
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TaskLocationInfoProps {
  checkInLocation?: {
    lat: number;
    lng: number;
    timestamp: Date;
  };
  compact?: boolean;
}

export const TaskLocationInfo: React.FC<TaskLocationInfoProps> = ({
  checkInLocation,
  compact = false
}) => {
  if (!checkInLocation) {
    return null;
  }

  const formatCoordinates = (lat: number, lng: number) => {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  };

  const getGoogleMapsUrl = (lat: number, lng: number) => {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle className="h-4 w-4 text-success" />
        <span className="text-muted-foreground">Check-in:</span>
        <span className="font-mono text-xs">
          {format(checkInLocation.timestamp, "dd/MM HH:mm", { locale: ptBR })}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => window.open(getGoogleMapsUrl(checkInLocation.lat, checkInLocation.lng), '_blank')}
        >
          <ExternalLink className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <CheckCircle className="h-4 w-4 text-success" />
        <Badge variant="success">Check-in Realizado</Badge>
      </div>
      
      <div className="space-y-1 text-sm">
        <div className="flex items-center gap-2">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span>
            {format(checkInLocation.timestamp, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <Navigation className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono text-xs">
            {formatCoordinates(checkInLocation.lat, checkInLocation.lng)}
          </span>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => window.open(getGoogleMapsUrl(checkInLocation.lat, checkInLocation.lng), '_blank')}
        className="w-full"
      >
        <MapPin className="h-3 w-3 mr-2" />
        Ver Localização
      </Button>
    </div>
  );
};