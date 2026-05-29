import { createFileRoute } from '@tanstack/react-router';
import { Toaster } from 'sonner';
import { GraffitiCanvas } from '@/components/graffiti/GraffitiCanvas';
import { DrawingToolbar } from '@/components/graffiti/DrawingToolbar';
import { ConnectionBanner } from '@/components/graffiti/ConnectionBanner';
import { PresenceCounter } from '@/components/graffiti/PresenceCounter';
import { SkyView } from '@/components/graffiti/SkyView';
import { useDrawingStore } from '@/stores/drawing-store';

export const Route = createFileRoute('/')({
  component: GraffitiWallPage,
});

function GraffitiWallPage() {
  const { setPendingImageFile, setUploadMode } = useDrawingStore();

  function handleImageSelected(file: File) {
    setPendingImageFile(file);
    setUploadMode(true);
  }

  return (
    <>
      <ConnectionBanner />
      <PresenceCounter />
      <SkyView />
      <GraffitiCanvas />
      <DrawingToolbar onImageSelected={handleImageSelected} />
      <Toaster position="top-center" richColors />
    </>
  );
}
