import { useEffect, useRef } from "react";

const COLORS = ["#e2543b", "#22c55e", "#eab308", "#ec4899", "#06b6d4", "#f97316"];
const PIECE_COUNT = 70;
const GRAVITY = 0.28;
const DRAG = 0.99;
const FADE_AFTER = 900; // ms before pieces start fading out
const LIFETIME = 1600; // ms

/**
 * One-shot confetti burst rendered on a full-screen canvas.
 * `origin` is a {x, y} point in viewport pixels — the card that was ticked.
 * Renders nothing and skips the animation entirely under prefers-reduced-motion.
 */
export default function Confetti({ origin, onDone }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      onDone?.();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pieces = Array.from({ length: PIECE_COUNT }, () => {
      // Fan upward and outward from the origin
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const speed = 5 + Math.random() * 8;
      return {
        x: origin.x,
        y: origin.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 5,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.3,
      };
    });

    const start = performance.now();
    let frame;

    const tick = (now) => {
      const elapsed = now - start;
      if (elapsed > LIFETIME) {
        onDone?.();
        return;
      }

      const alpha =
        elapsed < FADE_AFTER
          ? 1
          : 1 - (elapsed - FADE_AFTER) / (LIFETIME - FADE_AFTER);

      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = alpha;

      for (const p of pieces) {
        p.vx *= DRAG;
        p.vy = p.vy * DRAG + GRAVITY;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.spin;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    // Browsers freeze rAF while the tab is hidden, which would leave the canvas
    // mounted indefinitely. Tear down on a timer regardless of frames drawn.
    const bailout = setTimeout(() => onDone?.(), LIFETIME + 200);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(bailout);
    };
  }, [origin, onDone]);

  return <canvas ref={canvasRef} className="confetti-canvas" aria-hidden="true" />;
}
