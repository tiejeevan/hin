import { useRef, useState } from 'react';
import { Camera, ImagePlus, X, Loader2 } from 'lucide-react';

export interface PickedImage {
  /** Local object URL for preview */
  previewUrl: string;
  /** Remote URL after upload (empty while pending) */
  remoteUrl: string;
  /** Upload id from API */
  uploadId?: number;
  /** Original file (before or after compress handled by parent) */
  file: File;
}

interface ImagePickerProps {
  images: PickedImage[];
  max: number;
  disabled?: boolean;
  uploading?: boolean;
  error?: string | null;
  onAddFiles: (files: File[]) => void;
  onRemove: (index: number) => void;
}

export function ImagePicker({
  images,
  max,
  disabled,
  uploading,
  error,
  onAddFiles,
  onRemove,
}: ImagePickerProps) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const remaining = max - images.length;
  const canAdd = remaining > 0 && !disabled && !uploading;

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setLocalError(null);
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (!files.length) {
      setLocalError('Please select image files only');
      return;
    }
    if (files.length > remaining) {
      setLocalError(`You can add up to ${remaining} more image${remaining === 1 ? '' : 's'}`);
      onAddFiles(files.slice(0, remaining));
      return;
    }
    onAddFiles(files);
  };

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className={`grid gap-2 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {images.map((img, index) => (
            <div
              key={img.previewUrl}
              className="relative aspect-square rounded-xl overflow-hidden border border-border-custom bg-bg-primary"
            >
              <img src={img.previewUrl} alt="" className="w-full h-full object-cover" />
              {!img.remoteUrl && uploading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                </div>
              )}
              <button
                type="button"
                onClick={() => onRemove(index)}
                disabled={disabled || uploading}
                className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 cursor-pointer disabled:opacity-50"
                aria-label="Remove image"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {canAdd && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-bg-primary border border-border-custom text-text-secondary hover:text-text-primary hover:border-indigo-500/50 transition-colors cursor-pointer min-h-[44px]"
          >
            <ImagePlus className="h-4 w-4" />
            {max === 1 ? 'Choose photo' : `Choose photos (${images.length}/${max})`}
          </button>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-bg-primary border border-border-custom text-text-secondary hover:text-text-primary hover:border-indigo-500/50 transition-colors cursor-pointer min-h-[44px]"
          >
            <Camera className="h-4 w-4" />
            Take photo
          </button>
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple={max > 1}
            className="hidden"
            onChange={e => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {(error || localError) && (
        <p className="text-xs text-rose-400">{error || localError}</p>
      )}
    </div>
  );
}
