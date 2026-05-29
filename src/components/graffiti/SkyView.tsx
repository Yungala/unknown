import { useEffect, useState } from 'react';

type RGB = [number, number, number];

const SKY_FRAMES: Array<{ hour: number; top: RGB; bot: RGB }> = [
  { hour: 0,  top: [8, 8, 30],     bot: [20, 20, 60]    },
  { hour: 4,  top: [25, 20, 55],   bot: [80, 40, 90]    },
  { hour: 6,  top: [230, 80, 30],  bot: [255, 180, 100] },
  { hour: 8,  top: [60, 140, 210], bot: [150, 200, 240] },
  { hour: 12, top: [25, 110, 190], bot: [90, 170, 230]  },
  { hour: 17, top: [200, 70, 25],  bot: [255, 160, 80]  },
  { hour: 19, top: [130, 25, 50],  bot: [200, 70, 80]   },
  { hour: 21, top: [20, 15, 50],   bot: [35, 25, 70]    },
  { hour: 24, top: [8, 8, 30],     bot: [20, 20, 60]    },
];

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function toRgb(c: RGB) {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function getSkyGradient() {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;

  let i = SKY_FRAMES.findIndex((f, idx) => idx < SKY_FRAMES.length - 1 && h >= f.hour && h < SKY_FRAMES[idx + 1].hour);
  if (i === -1) i = SKY_FRAMES.length - 2;

  const f0 = SKY_FRAMES[i];
  const f1 = SKY_FRAMES[i + 1];
  const t = (h - f0.hour) / (f1.hour - f0.hour);

  const top = toRgb(lerpRgb(f0.top, f1.top, t));
  const bot = toRgb(lerpRgb(f0.bot, f1.bot, t));

  return `linear-gradient(to bottom, ${top}, ${bot})`;
}

export function SkyView() {
  const [gradient, setGradient] = useState(getSkyGradient);

  useEffect(() => {
    const id = setInterval(() => setGradient(getSkyGradient()), 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="fixed top-0 left-0 w-screen z-10 pointer-events-none"
      style={{ height: '33.333vh', background: gradient, transition: 'background 4s ease' }}
    />
  );
}
