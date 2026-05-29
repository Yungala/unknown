import { useDrawingStore } from '@/stores/drawing-store';

export function ConnectionBanner() {
  const isConnected = useDrawingStore((s) => s.isConnected);

  if (isConnected) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-black text-center text-sm py-2 font-medium">
      연결이 끊겼습니다. 재연결 중…
    </div>
  );
}
