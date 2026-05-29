import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase, type GraffitiImage, type Stroke, type StrokeInsert } from '@/lib/supabase';
import { useDrawingStore } from '@/stores/drawing-store';

const LOGICAL_W = 1920;
const LOGICAL_H = 1080;
const CHANNEL_NAME = 'graffiti-wall';

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke | StrokeInsert) {
  if (stroke.points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.thickness;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

async function drawImage(ctx: CanvasRenderingContext2D, img: GraffitiImage) {
  return new Promise<void>((resolve) => {
    const el = new Image();
    el.onload = () => {
      ctx.save();
      ctx.drawImage(el, img.x - img.width / 2, img.y - img.height / 2, img.width, img.height);
      ctx.restore();
      resolve();
    };
    el.onerror = () => resolve();
    el.src = img.url;
  });
}

export function GraffitiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const { color, thickness, setConnected, setPresenceCount, setUploadMode, setPendingImageFile, pendingImageFile } = useDrawingStore();
  const isDrawing = useRef(false);
  const currentPoints = useRef<{ x: number; y: number }[]>([]);
  const localStrokeIds = useRef(new Set<string>());
  const localImageIds = useRef(new Set<string>());

  const [placementMode, setPlacementMode] = useState(false);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const ghostImageRef = useRef<{ file: File; dataUrl: string; width: number; height: number } | null>(null);

  const ctx = useCallback(() => canvasRef.current?.getContext('2d') ?? null, []);

  function toLogical(e: React.PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * LOGICAL_W,
      y: ((e.clientY - rect.top) / rect.height) * LOGICAL_H,
    };
  }

  // 초기 로딩
  useEffect(() => {
    async function load() {
      const c = ctx();
      if (!c) return;

      c.fillStyle = '#1c1917';
      c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

      const [strokesRes, imagesRes] = await Promise.all([
        supabase.from('strokes').select('*').order('created_at'),
        supabase.from('images').select('*').order('created_at'),
      ]);

      const strokes: Stroke[] = strokesRes.data ?? [];
      const images: GraffitiImage[] = imagesRes.data ?? [];

      type Item = { type: 'stroke'; data: Stroke } | { type: 'image'; data: GraffitiImage };
      const items: Item[] = [
        ...strokes.map((s) => ({ type: 'stroke' as const, data: s })),
        ...images.map((img) => ({ type: 'image' as const, data: img })),
      ].sort((a, b) => a.data.created_at.localeCompare(b.data.created_at));

      for (const item of items) {
        if (item.type === 'stroke') drawStroke(c, item.data);
        else await drawImage(c, item.data);
      }
    }

    load();
  }, [ctx]);

  // Realtime 구독 (Broadcast 방식)
  useEffect(() => {
    const channel = supabase
      .channel(CHANNEL_NAME)
      .on('broadcast', { event: 'new_stroke' }, ({ payload: stroke }: { payload: Stroke }) => {
        if (localStrokeIds.current.has(stroke.id)) return;
        const c = ctx();
        if (c) drawStroke(c, stroke);
      })
      .on('broadcast', { event: 'new_image' }, async ({ payload: img }: { payload: GraffitiImage }) => {
        if (localImageIds.current.has(img.id)) return;
        const c = ctx();
        if (c) await drawImage(c, img);
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setPresenceCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        console.log('[Realtime]', status);
        setConnected(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') {
          await channel.track({ joined_at: Date.now() });
        }
      });

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [ctx, setConnected, setPresenceCount]);

  // 이미지 파일 선택 → 배치 모드
  useEffect(() => {
    if (!pendingImageFile) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const maxSize = 400;
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        ghostImageRef.current = {
          file: pendingImageFile,
          dataUrl,
          width: img.width * ratio,
          height: img.height * ratio,
        };
        setPlacementMode(true);
        setUploadMode(true);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(pendingImageFile);
  }, [pendingImageFile, setUploadMode]);

  // 이미지 배치 완료
  async function handleImagePlace(e: React.PointerEvent) {
    if (!placementMode || !ghostImageRef.current) return;
    const pos = toLogical(e);
    const ghost = ghostImageRef.current;

    const c = ctx();
    if (c) {
      const tempImg: GraffitiImage = {
        id: 'temp', url: ghost.dataUrl,
        x: pos.x, y: pos.y,
        width: ghost.width, height: ghost.height,
        created_at: new Date().toISOString(),
      };
      await drawImage(c, tempImg);
    }

    setPlacementMode(false);
    setUploadMode(false);
    setGhostPos(null);
    setPendingImageFile(null);
    ghostImageRef.current = null;

    const ext = ghost.file.name.split('.').pop() ?? 'jpg';
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('graffiti-images')
      .upload(fileName, ghost.file, { contentType: ghost.file.type });

    if (uploadError) { toast.error('사진 저장에 실패했습니다. 다시 시도해주세요.'); return; }

    const { data: urlData } = supabase.storage.from('graffiti-images').getPublicUrl(fileName);

    const { data, error } = await supabase.from('images').insert({
      url: urlData.publicUrl, x: pos.x, y: pos.y,
      width: ghost.width, height: ghost.height,
    }).select().single();

    if (error) { toast.error('사진 저장에 실패했습니다. 다시 시도해주세요.'); return; }

    localImageIds.current.add(data.id);
    channelRef.current?.send({ type: 'broadcast', event: 'new_image', payload: data });
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (placementMode) { handleImagePlace(e); return; }
    isDrawing.current = true;
    currentPoints.current = [toLogical(e)];
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (placementMode) { setGhostPos({ x: e.clientX, y: e.clientY }); return; }
    if (!isDrawing.current) return;
    const pt = toLogical(e);
    const points = currentPoints.current;
    const c = ctx();
    if (c && points.length > 0) {
      const prev = points[points.length - 1];
      c.save();
      c.strokeStyle = color;
      c.lineWidth = thickness;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(prev.x, prev.y);
      c.lineTo(pt.x, pt.y);
      c.stroke();
      c.restore();
    }
    points.push(pt);
  }

  async function handlePointerUp() {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const points = currentPoints.current;
    if (points.length < 2) return;

    const payload: StrokeInsert = { points, color, thickness };
    const { data, error } = await supabase.from('strokes').insert(payload).select().single();
    if (error) { toast.error('저장에 실패했습니다. 다시 시도해주세요.'); return; }

    localStrokeIds.current.add(data.id);
    currentPoints.current = [];
    // DB 저장 후 다른 클라이언트에 broadcast
    channelRef.current?.send({ type: 'broadcast', event: 'new_stroke', payload: data });
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        width={LOGICAL_W}
        height={LOGICAL_H}
        className="fixed inset-0 w-screen h-screen"
        style={{ cursor: 'crosshair', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      {placementMode && ghostImageRef.current && ghostPos && (
        <img
          src={ghostImageRef.current.dataUrl}
          alt="배치 미리보기"
          className="fixed pointer-events-none opacity-60 -translate-x-1/2 -translate-y-1/2"
          style={{ left: ghostPos.x, top: ghostPos.y, width: ghostImageRef.current.width, height: ghostImageRef.current.height }}
        />
      )}

      {placementMode && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-black/70 backdrop-blur text-white text-sm px-4 py-2 rounded-full">
          클릭해서 사진을 붙여넣으세요
        </div>
      )}
    </>
  );
}
