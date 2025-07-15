import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { 
  Camera, 
  Upload, 
  X, 
  Eye,
  Trash2
} from 'lucide-react';

interface PhotoUploadProps {
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  maxPhotos?: number;
}

export const PhotoUpload: React.FC<PhotoUploadProps> = ({ 
  photos, 
  onPhotosChange, 
  maxPhotos = 10 
}) => {
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const newPhoto = e.target?.result as string;
          if (photos.length < maxPhotos) {
            onPhotosChange([...photos, newPhoto]);
          }
        };
        reader.readAsDataURL(file);
      }
    });
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    onPhotosChange(newPhotos);
  };

  const openCamera = () => {
    // Simula abertura da câmera - em produção seria integrado com API da câmera
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Fotos da Visita
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Botões de Upload */}
        <div className="flex gap-2">
          <Button 
            type="button" 
            variant="outline" 
            onClick={openCamera}
            disabled={photos.length >= maxPhotos}
            className="flex-1"
          >
            <Camera className="h-4 w-4 mr-2" />
            Tirar Foto
          </Button>
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => fileInputRef.current?.click()}
            disabled={photos.length >= maxPhotos}
            className="flex-1"
          >
            <Upload className="h-4 w-4 mr-2" />
            Enviar Imagem
          </Button>
        </div>

        {/* Input file escondido */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {/* Informações */}
        <div className="text-sm text-muted-foreground">
          {photos.length} / {maxPhotos} fotos adicionadas
        </div>

        {/* Grid de Fotos */}
        {photos.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {photos.map((photo, index) => (
              <div key={index} className="relative group">
                <img 
                  src={photo} 
                  alt={`Foto ${index + 1}`}
                  className="w-full h-24 object-cover rounded-md border"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewPhoto(photo)}
                    className="h-8 w-8 p-0 text-white hover:bg-white/20"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removePhoto(index)}
                    className="h-8 w-8 p-0 text-white hover:bg-white/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal de Preview */}
        {previewPhoto && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="relative max-w-4xl max-h-[90vh]">
              <img 
                src={previewPhoto} 
                alt="Preview" 
                className="max-w-full max-h-full object-contain"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewPhoto(null)}
                className="absolute top-2 right-2 text-white hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};