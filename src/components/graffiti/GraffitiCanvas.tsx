import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase, type GraffitiImage, type GraffitiText, type Stroke, type StrokeInsert } from '@/lib/supabase';
import { useDrawingStore, type Thickness } from '@/stores/drawing-store';

const LOGICAL_W = 1920;
const LOGICAL_H = 1080;
const CHANNEL_NAME = 'graffiti-wall';
const FONT_SIZES: Record<Thickness, number> = { 2: 28, 6: 52, 14: 100 };

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

async function preloadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(el);
    el.src = url;
  });
}

function drawImageEl(ctx: CanvasRenderingContext2D, el: HTMLImageElement, img: GraffitiImage) {
  if (!el.naturalWidth) return;
  ctx.save();
  ctx.drawImage(el, img.x - img.width / 2, img.y - img.height / 2, img.width, img.height);
  ctx.restore();
}

async function drawImage(ctx: CanvasRenderingContext2D, img: GraffitiImage) {
  const el = await preloadImage(img.url);
  drawImageEl(ctx, el, img);
}

function drawText(ctx: CanvasRenderingContext2D, text: GraffitiText) {
  ctx.save();
  ctx.fillStyle = text.color;
  ctx.font = `bold ${text.font_size}px sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(text.content, text.x, text.y);
  ctx.restore();
}

export function GraffitiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const { color, thickness, tool, setConnected, setPresenceCount, setUploadMode, setPendingImageFile, pendingImageFile } = useDrawingStore();
  const isDrawing = useRef(false);
  const currentPoints = useRef<{ x: number; y: number }[]>([]);
  const localStrokeIds = useRef(new Set<string>());
  const localImageIds = useRef(new Set<string>());
  const localTextIds = useRef(new Set<string>());

  const [textInput, setTextInput] = useState<{
    logX: number; logY: number; screenX: number; screenY: number; value: string;
  } | null>(null);
  const textEscaped = useRef(false);

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

      const [strokesRes, imagesRes, textsRes] = await Promise.all([
        supabase.from('strokes').select('*').order('created_at'),
        supabase.from('images').select('*').order('created_at'),
        supabase.from('texts').select('*').order('created_at'),
      ]);

      const strokes: Stroke[] = strokesRes.data ?? [];
      const images: GraffitiImage[] = imagesRes.data ?? [];
      const texts: GraffitiText[] = textsRes.data ?? [];

      // 이미지 모두 병렬 프리로드
      const imageElMap = new Map(
        await Promise.all(
          images.map(async (img) => [img.id, await preloadImage(img.url)] as const)
        )
      );

      type Item =
        | { type: 'stroke'; data: Stroke }
        | { type: 'image'; data: GraffitiImage }
        | { type: 'text'; data: GraffitiText };

      const items: Item[] = [
        ...strokes.map((s) => ({ type: 'stroke' as const, data: s })),
        ...images.map((img) => ({ type: 'image' as const, data: img })),
        ...texts.map((t) => ({ type: 'text' as const, data: t })),
      ].sort((a, b) => a.data.created_at.localeCompare(b.data.created_at));

      for (const item of items) {
        if (item.type === 'stroke') drawStroke(c, item.data);
        else if (item.type === 'image') {
          const el = imageElMap.get(item.data.id);
          if (el) drawImageEl(c, el, item.data);
        } else {
          drawText(c, item.data);
        }
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
      .on('broadcast', { event: 'new_text' }, ({ payload: text }: { payload: GraffitiText }) => {
        if (localTextIds.current.has(text.id)) return;
        const c = ctx();
        if (c) drawText(c, text);
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

    if (uploadError) {
      console.error('[storage upload error]', uploadError);
      toast.error('사진 저장에 실패했습니다. 다시 시도해주세요.');
      return;
    }

    const { data: urlData } = supabase.storage.from('graffiti-images').getPublicUrl(fileName);
    console.log('[image url]', urlData.publicUrl);

    const { data, error } = await supabase.from('images').insert({
      url: urlData.publicUrl, x: pos.x, y: pos.y,
      width: ghost.width, height: ghost.height,
    }).select().single();

    console.log('[image insert]', data, error);
    if (error) { toast.error('사진 저장에 실패했습니다. 다시 시도해주세요.'); return; }

    localImageIds.current.add(data.id);
    channelRef.current?.send({ type: 'broadcast', event: 'new_image', payload: data });
  }

  function getCanvasScale() {
    const canvas = canvasRef.current;
    if (!canvas) return 1;
    return canvas.getBoundingClientRect().width / LOGICAL_W;
  }

  async function handleTextCommit() {
    if (!textInput?.value.trim()) { setTextInput(null); return; }
    const { logX, logY, value } = textInput;
    const fontSize = FONT_SIZES[thickness];
    setTextInput(null);

    const c = ctx();
    if (c) {
      c.save();
      c.fillStyle = color;
      c.font = `bold ${fontSize}px sans-serif`;
      c.textBaseline = 'top';
      c.fillText(value, logX, logY);
      c.restore();
    }

    const { data, error } = await supabase
      .from('texts')
      .insert({ content: value, x: logX, y: logY, color, font_size: fontSize })
      .select()
      .single();

    if (error) { toast.error('저장에 실패했습니다. 다시 시도해주세요.'); return; }

    localTextIds.current.add(data.id);
    channelRef.current?.send({ type: 'broadcast', event: 'new_text', payload: data });
  }

  async function handleTextBlur() {
    if (textEscaped.current) { textEscaped.current = false; return; }
    await handleTextCommit();
  }

  function handleTextKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); void handleTextCommit(); }
    else if (e.key === 'Escape') { textEscaped.current = true; setTextInput(null); }
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (placementMode) { handleImagePlace(e); return; }
    if (tool === 'text') {
      const pos = toLogical(e);
      setTextInput({ logX: pos.x, logY: pos.y, screenX: e.clientX, screenY: e.clientY, value: '' });
      return;
    }
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
        style={{ cursor: tool === 'text' && !placementMode ? 'text' : 'crosshair', touchAction: 'none' }}
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

      {textInput && (() => {
        const scaledSize = FONT_SIZES[thickness] * getCanvasScale();
        return (
          <div
            style={{
              position: 'fixed',
              left: textInput.screenX,
              top: textInput.screenY,
              display: 'grid',
              fontSize: scaledSize,
              fontFamily: 'sans-serif',
              fontWeight: 'bold',
              color,
              zIndex: 50,
            }}
          >
            <span
              aria-hidden
              style={{
                gridArea: '1/1',
                whiteSpace: 'pre',
                visibility: 'hidden',
                padding: '0 2px',
                minWidth: '0.6em',
              }}
            >
              {textInput.value + '​'}
            </span>
            <input
              autoFocus
              value={textInput.value}
              onChange={(e) => setTextInput((prev) => prev && { ...prev, value: e.target.value })}
              onKeyDown={handleTextKeyDown}
              onBlur={handleTextBlur}
              style={{
                gridArea: '1/1',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'inherit',
                fontFamily: 'inherit',
                fontSize: 'inherit',
                fontWeight: 'inherit',
                caretColor: color,
                padding: '0 2px',
                width: '100%',
              }}
            />
          </div>
        );
      })()}
    </>
  );
}
