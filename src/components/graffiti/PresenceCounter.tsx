import { useDrawingStore } from '@/stores/drawing-store';

export function PresenceCounter() {
  const count = useDrawingStore((s) => s.presenceCount);

  return (
    <div className="fixed top-3 right-4 z-40 flex items-center gap-1.5 bg-black/60 backdrop-blur rounded-full px-3 py-1.5 text-white text-xs">
      <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
      {count}명 접속 중
    </div>
  );
}
