import { useRef } from 'react';
import { ImageIcon } from 'lucide-react';
import { PALETTE, THICKNESSES, type Thickness, useDrawingStore } from '@/stores/drawing-store';

const COLOR_NAMES: Record<string, string> = {
  '#FFFFFF': '흰색', '#111111': '검정', '#EF4444': '빨강', '#F97316': '주황',
  '#EAB308': '노랑', '#22C55E': '초록', '#38BDF8': '하늘', '#3B82F6': '파랑',
  '#A855F7': '보라', '#EC4899': '분홍', '#6B7280': '회색', '#D4B896': '베이지',
};

const THICKNESS_LABELS: Record<Thickness, string> = { 2: '얇게', 6: '보통', 14: '굵게' };

interface DrawingToolbarProps {
  onImageSelected: (file: File) => void;
}

export function DrawingToolbar({ onImageSelected }: DrawingToolbarProps) {
  const { color, thickness, isUploadMode, setColor, setThickness } = useDrawingStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('파일 크기는 5MB 이하만 가능합니다.');
      return;
    }
    onImageSelected(file);
    e.target.value = '';
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-black/70 backdrop-blur-sm rounded-2xl px-5 py-3 shadow-xl">
      {/* 색상 팔레트 */}
      <div className="flex items-center gap-1.5">
        {PALETTE.map((c) => (
          <button
            key={c}
            aria-label={COLOR_NAMES[c]}
            title={COLOR_NAMES[c]}
            onClick={() => setColor(c)}
            className="w-6 h-6 rounded-full border border-white/20 transition-transform hover:scale-110"
            style={{
              backgroundColor: c,
              outline: color === c ? '2px solid white' : 'none',
              outlineOffset: '2px',
            }}
          />
        ))}
      </div>

      <div className="w-px h-6 bg-white/20" />

      {/* 두께 */}
      <div className="flex items-center gap-1.5">
        {THICKNESSES.map((t) => (
          <button
            key={t}
            aria-label={THICKNESS_LABELS[t]}
            title={THICKNESS_LABELS[t]}
            onClick={() => setThickness(t)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              thickness === t ? 'bg-white text-black' : 'text-white hover:bg-white/20'
            }`}
          >
            <span
              className="rounded-full bg-current"
              style={{ width: t + 4, height: t + 4 }}
            />
          </button>
        ))}
      </div>

      <div className="w-px h-6 bg-white/20" />

      {/* 사진 업로드 */}
      <button
        aria-label="사진 업로드"
        title="사진 업로드"
        onClick={() => fileInputRef.current?.click()}
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
          isUploadMode ? 'bg-white text-black' : 'text-white hover:bg-white/20'
        }`}
      >
        <ImageIcon size={16} />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
