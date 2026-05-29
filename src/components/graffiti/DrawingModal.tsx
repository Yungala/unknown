import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Eraser, Trash2 } from 'lucide-react';
import { PALETTE, THICKNESSES, type Thickness } from '@/stores/drawing-store';

const MODAL_SIZE = 300;

const THICKNESS_LABELS: Record<Thickness, string> = { 2: '얇게', 6: '보통', 14: '굵게' };

interface DrawingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (file: File) => void;
}

export function DrawingModal({ isOpen, onClose, onConfirm }: DrawingModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState('#EF4444');
  const [thickness, setThickness] = useState<Thickness>(6);
  const [isEraser, setIsEraser] = useState(false);

  const getCtx = useCallback(() => canvasRef.current?.getContext('2d') ?? null, []);

  useEffect(() => {
    if (!isOpen) return;
    // 모달이 열릴 때마다 투명 배경으로 초기화
    const id = requestAnimationFrame(() => {
      const c = getCtx();
      if (!c) return;
      c.clearRect(0, 0, MODAL_SIZE, MODAL_SIZE);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, getCtx]);

  function getPos(e: React.PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * MODAL_SIZE,
      y: ((e.clientY - rect.top) / rect.height) * MODAL_SIZE,
    };
  }

  function handlePointerDown(e: React.PointerEvent) {
    isDrawing.current = true;
    lastPoint.current = getPos(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!isDrawing.current || !lastPoint.current) return;
    const c = getCtx();
    if (!c) return;
    const pt = getPos(e);
    c.save();
    c.strokeStyle = isEraser ? '#ffffff' : color;
    c.lineWidth = isEraser ? thickness * 3 : thickness;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(lastPoint.current.x, lastPoint.current.y);
    c.lineTo(pt.x, pt.y);
    c.stroke();
    c.restore();
    lastPoint.current = pt;
  }

  function handlePointerUp() {
    isDrawing.current = false;
    lastPoint.current = null;
  }

  function handleClear() {
    const c = getCtx();
    if (!c) return;
    c.clearRect(0, 0, MODAL_SIZE, MODAL_SIZE);
  }

  function handleConfirm() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `drawing-${Date.now()}.png`, { type: 'image/png' });
      onConfirm(file);
      onClose();
    }, 'image/png');
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 rounded-2xl p-5 flex flex-col gap-4 shadow-2xl border border-white/10">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <span className="text-white font-medium text-sm">그리기</span>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* 캔버스 */}
        <canvas
          ref={canvasRef}
          width={MODAL_SIZE}
          height={MODAL_SIZE}
          className="rounded-lg"
          style={{
            width: MODAL_SIZE,
            height: MODAL_SIZE,
            cursor: isEraser ? 'cell' : 'crosshair',
            touchAction: 'none',
            backgroundImage:
              'linear-gradient(45deg,#555 25%,transparent 25%),' +
              'linear-gradient(-45deg,#555 25%,transparent 25%),' +
              'linear-gradient(45deg,transparent 75%,#555 75%),' +
              'linear-gradient(-45deg,transparent 75%,#555 75%)',
            backgroundSize: '12px 12px',
            backgroundPosition: '0 0,0 6px,6px -6px,-6px 0',
            backgroundColor: '#3a3a3a',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />

        {/* 도구 영역 */}
        <div className="flex flex-col gap-2">
          {/* 색상 팔레트 */}
          <div className="flex items-center gap-1 flex-wrap">
            {PALETTE.map((c) => (
              <button
                key={c}
                aria-label={c}
                onClick={() => { setColor(c); setIsEraser(false); }}
                className="w-5 h-5 rounded-full border border-white/20 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  outline: color === c && !isEraser ? '2px solid white' : 'none',
                  outlineOffset: '2px',
                }}
              />
            ))}
          </div>

          {/* 두께 + 지우개 + 초기화 */}
          <div className="flex items-center gap-1.5">
            {THICKNESSES.map((t) => (
              <button
                key={t}
                aria-label={THICKNESS_LABELS[t]}
                title={THICKNESS_LABELS[t]}
                onClick={() => setThickness(t)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                  thickness === t && !isEraser ? 'bg-white text-black' : 'text-white hover:bg-white/20'
                }`}
              >
                <span className="rounded-full bg-current" style={{ width: t + 3, height: t + 3 }} />
              </button>
            ))}

            <div className="w-px h-5 bg-white/20 mx-1" />

            <button
              onClick={() => setIsEraser((v) => !v)}
              title="지우개"
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                isEraser ? 'bg-white text-black' : 'text-white hover:bg-white/20'
              }`}
            >
              <Eraser size={14} />
            </button>

            <button
              onClick={handleClear}
              title="초기화"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* 확인/취소 */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-white/60 hover:bg-white/10 transition-colors text-sm"
          >
            취소
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded-lg bg-white text-black font-medium hover:bg-white/90 transition-colors text-sm"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
