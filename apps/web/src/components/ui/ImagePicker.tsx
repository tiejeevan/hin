import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, ImagePlus, Paperclip, X, Loader2 } from 'lucide-react';
import { getMediaItemClass } from '../feed/PostMediaGallery';

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
  actions?: ReactNode;
}

export function ImagePicker({
  images,
  max,
  disabled,
  uploading,
  error,
  onAddFiles,
  onRemove,
  actions,
}: ImagePickerProps) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [localError, setLocalError] = useState<string | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);

  const remaining = max - images.length;
  const canAdd = remaining > 0 && !disabled && !uploading;

  const addFiles = (files: File[]) => {
    if (!files.length) return;
    setLocalError(null);
    const imagesOnly = files.filter(f => f.type.startsWith('image/'));
    if (!imagesOnly.length) {
      setLocalError('Please select image files only');
      return;
    }
    if (imagesOnly.length > remaining) {
      setLocalError(`You can add up to ${remaining} more image${remaining === 1 ? '' : 's'}`);
      onAddFiles(imagesOnly.slice(0, remaining));
      return;
    }
    onAddFiles(imagesOnly);
  };

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    addFiles(Array.from(fileList));
  };

  const stopCameraStream = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const closeCamera = () => {
    stopCameraStream();
    setCameraOpen(false);
    setCameraStarting(false);
  };

  const openGallery = () => {
    setAttachMenuOpen(false);
    galleryRef.current?.click();
  };

  const openCamera = async () => {
    setAttachMenuOpen(false);
    setLocalError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }

    setCameraOpen(true);
    setCameraStarting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      closeCamera();
      cameraInputRef.current?.click();
    } finally {
      setCameraStarting(false);
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      blob => {
        if (!blob) {
          setLocalError('Failed to capture photo');
          return;
        }
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
        addFiles([file]);
        closeCamera();
      },
      'image/jpeg',
      0.92,
    );
  };

  useEffect(() => {
    if (!attachMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAttachMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [attachMenuOpen]);

  useEffect(() => {
    if (!cameraOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCamera();
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      stopCameraStream();
    };
  }, [cameraOpen]);

  const attachLabel =
    max === 1 ? 'Attach photo' : `Attach photos, ${images.length} of ${max}`;

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div
          className={`rounded-xl overflow-hidden border border-border-custom bg-bg-primary ${
            images.length === 1 ? '' : 'grid gap-0.5 grid-cols-2'
          }`}
        >
          {images.map((img, index) => (
            <div
              key={img.previewUrl}
              className={`relative overflow-hidden ${getMediaItemClass(images.length, index)}`}
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

      {(canAdd || actions) && (
        <div className="flex items-center justify-between gap-2">
          {canAdd ? (
            <div ref={attachMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setAttachMenuOpen(prev => !prev)}
                className="relative inline-flex items-center justify-center gap-1 rounded-xl border border-border-custom bg-bg-primary px-2.5 py-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer min-h-[44px] min-w-[44px]"
                aria-label={attachLabel}
                aria-haspopup="menu"
                aria-expanded={attachMenuOpen}
                title={max === 1 ? 'Attach photo' : `Attach photos (${images.length}/${max})`}
              >
                <Paperclip className="h-4 w-4" />
                {max > 1 && (
                  <span className="text-[10px] font-semibold tabular-nums leading-none">
                    {images.length}/{max}
                  </span>
                )}
              </button>

              {attachMenuOpen && (
                <div
                  role="menu"
                  className="absolute left-0 bottom-full mb-1 w-44 rounded-xl border border-border-custom bg-bg-secondary shadow-lg overflow-hidden z-20"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openGallery}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors cursor-pointer min-h-[44px]"
                  >
                    <ImagePlus className="h-3.5 w-3.5 shrink-0" />
                    {max === 1 ? 'Choose photo' : 'Choose photos'}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void openCamera()}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors cursor-pointer min-h-[44px]"
                  >
                    <Camera className="h-3.5 w-3.5 shrink-0" />
                    Take photo
                  </button>
                </div>
              )}

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
                ref={cameraInputRef}
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
          ) : (
            <div />
          )}
          {actions}
        </div>
      )}

      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border-custom bg-bg-secondary overflow-hidden shadow-xl">
            <div className="relative aspect-[4/3] bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              {cameraStarting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 p-3">
              <button
                type="button"
                onClick={closeCamera}
                className="px-3 py-2 rounded-xl text-xs text-text-muted hover:bg-bg-tertiary hover:text-text-primary transition-colors cursor-pointer min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={capturePhoto}
                disabled={cameraStarting}
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors cursor-pointer min-h-[44px]"
              >
                <Camera className="h-3.5 w-3.5" />
                Capture
              </button>
            </div>
          </div>
        </div>
      )}

      {(error || localError) && (
        <p className="text-xs text-rose-400">{error || localError}</p>
      )}
    </div>
  );
}
