import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Camera, 
  Eye, 
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface PhotoGalleryProps {
  photos: string[];
  maxDisplay?: number;
}

export const PhotoGallery: React.FC<PhotoGalleryProps> = ({ 
  photos, 
  maxDisplay = 3 
}) => {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  if (!photos || photos.length === 0) {
    return null;
  }

  const displayPhotos = photos.slice(0, maxDisplay);
  const remainingPhotos = photos.length - maxDisplay;

  const nextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
  };

  const prevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  return (
    <>
      {/* Miniatura das fotos */}
      <div className="flex items-center gap-2">
        <Camera className="h-4 w-4 text-muted-foreground" />
        <div className="flex gap-1">
          {displayPhotos.map((photo, index) => (
            <div
              key={index}
              className="w-8 h-8 rounded overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => {
                setCurrentPhotoIndex(index);
                setIsGalleryOpen(true);
              }}
            >
              <img 
                src={photo} 
                alt={`Foto ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
          {remainingPhotos > 0 && (
            <div 
              className="w-8 h-8 rounded bg-muted flex items-center justify-center text-xs font-medium cursor-pointer hover:bg-muted/80 transition-colors"
              onClick={() => {
                setCurrentPhotoIndex(maxDisplay);
                setIsGalleryOpen(true);
              }}
            >
              +{remainingPhotos}
            </div>
          )}
        </div>
      </div>

      {/* Modal da galeria */}
      {isGalleryOpen && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="relative w-full max-w-4xl">
            {/* Imagem principal */}
            <div className="relative">
              <img 
                src={photos[currentPhotoIndex]} 
                alt={`Foto ${currentPhotoIndex + 1}`}
                className="w-full max-h-[80vh] object-contain rounded-md"
              />
              
              {/* Botões de navegação */}
              {photos.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={prevPhoto}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={nextPhoto}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                </>
              )}
            </div>

            {/* Botão fechar */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsGalleryOpen(false)}
              className="absolute top-2 right-2 text-white hover:bg-white/20"
            >
              <X className="h-6 w-6" />
            </Button>

            {/* Indicador de posição */}
            {photos.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
                {currentPhotoIndex + 1} / {photos.length}
              </div>
            )}

            {/* Miniaturas na parte inferior */}
            {photos.length > 1 && (
              <div className="mt-4 flex justify-center gap-2 overflow-x-auto pb-2">
                {photos.map((photo, index) => (
                  <div
                    key={index}
                    className={`w-12 h-12 rounded overflow-hidden cursor-pointer transition-all ${
                      index === currentPhotoIndex 
                        ? 'ring-2 ring-white' 
                        : 'opacity-60 hover:opacity-100'
                    }`}
                    onClick={() => setCurrentPhotoIndex(index)}
                  >
                    <img 
                      src={photo} 
                      alt={`Miniatura ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};