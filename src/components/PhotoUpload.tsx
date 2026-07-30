import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Camera, 
  Upload, 
  X, 
  Eye,
  Trash2,
  Loader2
} from 'lucide-react';
import { compressToDataUrl, deletePhoto, isStoragePath, TASK_PHOTOS_BUCKET, type MediaBucket } from '@/lib/mediaStorage';
import { MediaImage } from '@/components/MediaImage';
import { toast } from 'sonner';

interface PhotoUploadProps {
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  maxPhotos?: number;
  hidePhotoUpload?: boolean; // New prop to hide photo functionality
  /** Bucket usado quando a foto já está no Storage (leitura/exclusão) */
  bucket?: MediaBucket;
}

export const PhotoUpload: React.FC<PhotoUploadProps> = ({ 
  photos, 
  onPhotosChange, 
  maxPhotos = 10,
  hidePhotoUpload = false, // Default to false to maintain existing behavior
  bucket = TASK_PHOTOS_BUCKET,
}) => {
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Lista mista (Base64 histórico + paths do Storage): a resolução é feita
  // exclusivamente pelo MediaImage — sem lógica paralela de URL aqui.


  // If hidePhotoUpload is true, don't render anything
  if (hidePhotoUpload) {
    return null;
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter(f => f.type.startsWith('image/'));
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (files.length === 0) return;

    setProcessing(true);
    try {
      const available = Math.max(0, maxPhotos - photos.length);
      const accepted = files.slice(0, available);
      const compressed: string[] = [];
      for (const file of accepted) {
        try {
          // Compressão obrigatória antes de qualquer persistência.
          compressed.push(await compressToDataUrl(file));
        } catch (err) {
          console.error('[PhotoUpload] Falha ao comprimir imagem:', err);
          toast.error(`Não foi possível processar "${file.name}"`);
        }
      }
      if (compressed.length > 0) {
        onPhotosChange([...photos, ...compressed]);
      }
    } finally {
      setProcessing(false);
    }
  };

  const removePhoto = async (index: number) => {
    const value = photos[index];
    // Foto já no Storage: só removemos a referência após o Storage confirmar.
    if (isStoragePath(value)) {
      const ok = await deletePhoto(value, bucket);
      if (!ok) {
        toast.error('Não foi possível excluir a foto do armazenamento. Tente novamente.');
        return;
      }
    }
    onPhotosChange(photos.filter((_, i) => i !== index));
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
            disabled={photos.length >= maxPhotos || processing}
            className="flex-1"
          >
            {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
            Tirar Foto
          </Button>
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => fileInputRef.current?.click()}
            disabled={photos.length >= maxPhotos || processing}
            className="flex-1"
          >
            {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
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
          {processing && ' • otimizando imagens...'}
        </div>

        {/* Grid de Fotos */}
        {photos.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {photos.map((photo, index) => (
              <div key={`${photo.slice(0, 32)}-${index}`} className="relative group">
                <MediaImage
                  value={photo}
                  bucket={bucket}
                  alt={`Foto ${index + 1}`}
                  loading="lazy"
                  className="w-full h-24 object-cover rounded-md border"
                  fallbackClassName="w-full h-24 rounded-md border bg-muted flex items-center justify-center text-[10px] text-muted-foreground text-center px-2"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewPhoto(photo)}
                    className="h-8 w-8 p-0 text-primary-foreground hover:bg-white/20"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removePhoto(index)}
                    className="h-8 w-8 p-0 text-primary-foreground hover:bg-white/20"
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
              <MediaImage
                value={previewPhoto}
                bucket={bucket}
                alt="Preview"
                className="max-w-full max-h-[85vh] object-contain"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewPhoto(null)}
                className="absolute top-2 right-2 text-primary-foreground hover:bg-white/20"
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
