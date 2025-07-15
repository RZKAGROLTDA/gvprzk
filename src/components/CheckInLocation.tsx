import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  MapPin, 
  Navigation,
  CheckCircle,
  AlertCircle,
  Loader2,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CheckInLocationProps {
  checkInLocation?: {
    lat: number;
    lng: number;
    timestamp: Date;
  };
  onCheckIn: (location: { lat: number; lng: number; timestamp: Date }) => void;
  disabled?: boolean;
}

export const CheckInLocation: React.FC<CheckInLocationProps> = ({
  checkInLocation,
  onCheckIn,
  disabled = false
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationSupported, setLocationSupported] = useState(true);

  useEffect(() => {
    // Verifica se a API de geolocalização está disponível
    setLocationSupported('geolocation' in navigator);
  }, []);

  const handleCheckIn = async () => {
    if (!locationSupported) {
      setError('Geolocalização não é suportada neste navegador');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
          }
        );
      });

      const location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        timestamp: new Date()
      };

      onCheckIn(location);
    } catch (err) {
      let errorMessage = 'Erro ao obter localização';
      
      if (err instanceof GeolocationPositionError) {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            errorMessage = 'Permissão de localização negada. Permita o acesso à localização.';
            break;
          case err.POSITION_UNAVAILABLE:
            errorMessage = 'Localização indisponível. Verifique se o GPS está ativado.';
            break;
          case err.TIMEOUT:
            errorMessage = 'Tempo limite excedido. Tente novamente.';
            break;
        }
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCoordinates = (lat: number, lng: number) => {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  };

  const getGoogleMapsUrl = (lat: number, lng: number) => {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Check-in de Localização
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!locationSupported && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Geolocalização não é suportada neste navegador.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {checkInLocation ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-success" />
              <Badge variant="success">Check-in Realizado</Badge>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>
                  {format(checkInLocation.timestamp, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <Navigation className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono">
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
              <MapPin className="h-4 w-4 mr-2" />
              Ver no Google Maps
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Faça check-in para registrar sua localização na chegada da visita.
            </p>
            
            <Button
              onClick={handleCheckIn}
              disabled={isLoading || disabled || !locationSupported}
              className="w-full"
              variant="gradient"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Obtendo localização...
                </>
              ) : (
                <>
                  <Navigation className="h-4 w-4 mr-2" />
                  Fazer Check-in
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Sua localização será registrada com data e hora para comprovar a visita.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};