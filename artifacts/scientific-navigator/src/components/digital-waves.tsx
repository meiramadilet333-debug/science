import { useEffect, useRef } from 'react';

export type AILiveState = 'idle' | 'typing' | 'analyzing' | 'complete' | 'error';

const stateLabels: Record<AILiveState, string> = {
  idle: 'Ожидание идеи',
  typing: 'Идея готова к анализу',
  analyzing: 'Идёт научный анализ',
  complete: 'Анализ завершён',
  error: 'Не удалось выполнить запрос',
};

type Particle = {
  x: number;
  offset: number;
  speed: number;
  radius: number;
  phase: number;
  hue: number;
};

function createParticles(width: number, isMobile: boolean): Particle[] {
  const count = Math.min(isMobile ? 34 : 96, Math.max(isMobile ? 18 : 44, Math.round(width / (isMobile ? 11 : 10))));
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    offset: (Math.random() - 0.5) * 0.85,
    speed: 8 + Math.random() * 24,
    radius: 0.65 + Math.random() * 1.1,
    phase: Math.random() * Math.PI * 2,
    hue: Math.random() > 0.56 ? 185 : 210,
  }));
}

function waveY(x: number, width: number, height: number, phase: number, offset = 0): number {
  const progress = x / Math.max(width, 1);
  return height * (0.5 + offset) +
    Math.sin(progress * Math.PI * 4.2 + phase) * height * 0.16 +
    Math.sin(progress * Math.PI * 7.1 - phase * 0.72) * height * 0.055;
}

export function DigitalWaves({ state }: { state: AILiveState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobileQuery = window.matchMedia('(max-width: 600px)');
    let frameId = 0;
    let width = 0;
    let height = 0;
    let lastFrameTime = 0;
    let elapsed = 0;
    let particles: Particle[] = [];
    let isVisible = document.visibilityState === 'visible';

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      width = bounds.width;
      height = bounds.height;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, mobileQuery.matches ? 1.5 : 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      particles = createParticles(width, mobileQuery.matches);
      draw(elapsed);
    };

    const draw = (time: number) => {
      if (width <= 0 || height <= 0) return;
      const mobile = mobileQuery.matches;
      const lineCount = mobile ? 11 : 19;
      const families = mobile ? 3 : 4;
      const baseSpeed = state === 'analyzing' ? 0.00092 : state === 'typing' ? 0.00066 : 0.00046;
      const intensity = state === 'analyzing' ? 1.22 : state === 'typing' ? 1.08 : 1;
      const centerY = height * 0.51;
      context.clearRect(0, 0, width, height);

      for (let family = 0; family < families; family += 1) {
        const familyOffset = (family - (families - 1) / 2) * (mobile ? 0.085 : 0.072);
        for (let line = 0; line < lineCount; line += 1) {
          const spread = (line / Math.max(lineCount - 1, 1) - 0.5) * (mobile ? 0.32 : 0.39);
          const phase = time * baseSpeed * (family % 2 === 0 ? 1 : -0.84) + family * 1.37 + spread * 2.8;
          const lineOffset = familyOffset + spread;
          const alpha = (0.13 + (1 - Math.abs(spread) * 1.7) * 0.29) * intensity;
          const hue = family % 2 === 0 ? 197 : 214;

          context.beginPath();
          for (let x = 0; x <= width + 6; x += mobile ? 6 : 5) {
            const progress = x / Math.max(width, 1);
            const y = centerY +
              Math.sin(progress * Math.PI * 4.15 + phase) * height * (0.17 + Math.abs(spread) * 0.14) +
              Math.sin(progress * Math.PI * 7.3 - phase * 0.74 + family) * height * 0.055 +
              lineOffset * height;
            if (x === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          }
          context.strokeStyle = `hsla(${hue}, 100%, ${family % 2 === 0 ? 70 : 74}%, ${alpha})`;
          context.lineWidth = line % 6 === 0 ? 1.05 : 0.62;
          context.shadowColor = `hsla(${hue}, 100%, 70%, ${0.38 * intensity})`;
          context.shadowBlur = line % 4 === 0 ? 5 : 1.5;
          context.stroke();
        }
      }
      context.shadowBlur = 0;

      particles.forEach((particle) => {
        const speedBoost = state === 'analyzing' ? 1.9 : state === 'typing' ? 1.35 : 1;
        particle.x = (particle.x + particle.speed * speedBoost / (mobile ? 30 : 50)) % width;
        const phase = time * baseSpeed + particle.phase;
        const y = waveY(particle.x, width, height, phase, particle.offset * 0.45);
        const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(time * 0.0015 + particle.phase));
        const radius = particle.radius * (state === 'analyzing' ? 1.18 : 1);

        context.beginPath();
        context.arc(particle.x, y, radius * 3, 0, Math.PI * 2);
        context.fillStyle = `hsla(${particle.hue}, 100%, 73%, ${twinkle * 0.12 * intensity})`;
        context.fill();
        context.beginPath();
        context.arc(particle.x, y, radius, 0, Math.PI * 2);
        context.fillStyle = `hsla(${particle.hue}, 100%, 84%, ${twinkle * 0.85})`;
        context.fill();
      });

      const crossings = [0.25, 0.51, 0.77];
      crossings.forEach((point, index) => {
        const x = width * point;
        const y = centerY + Math.sin(point * Math.PI * 4.15 + time * baseSpeed + index) * height * 0.13;
        const glow = context.createRadialGradient(x, y, 0, x, y, mobile ? 22 : 36);
        glow.addColorStop(0, `rgba(139, 235, 255, ${0.15 * intensity})`);
        glow.addColorStop(1, 'rgba(139, 235, 255, 0)');
        context.fillStyle = glow;
        context.fillRect(x - (mobile ? 22 : 36), y - (mobile ? 22 : 36), mobile ? 44 : 72, mobile ? 44 : 72);
      });

      const edgeFade = context.createLinearGradient(0, 0, width, 0);
      edgeFade.addColorStop(0, 'rgba(0, 0, 0, 0.05)');
      edgeFade.addColorStop(0.12, 'rgba(0, 0, 0, 0.82)');
      edgeFade.addColorStop(0.5, 'rgba(0, 0, 0, 1)');
      edgeFade.addColorStop(0.88, 'rgba(0, 0, 0, 0.82)');
      edgeFade.addColorStop(1, 'rgba(0, 0, 0, 0.05)');
      context.globalCompositeOperation = 'destination-in';
      context.fillStyle = edgeFade;
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = 'source-over';
    };

    const animate = (timestamp: number) => {
      if (!isVisible || reducedMotion.matches) return;
      const frameInterval = mobileQuery.matches ? 1000 / 30 : 1000 / 50;
      if (timestamp - lastFrameTime >= frameInterval) {
        const delta = lastFrameTime === 0 ? frameInterval : Math.min(timestamp - lastFrameTime, 100);
        elapsed += delta;
        lastFrameTime = timestamp;
        draw(elapsed);
      }
      frameId = window.requestAnimationFrame(animate);
    };

    const start = () => {
      if (!isVisible || reducedMotion.matches || frameId) return;
      lastFrameTime = 0;
      frameId = window.requestAnimationFrame(animate);
    };

    const stop = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = 0;
    };

    const updateVisibility = () => {
      isVisible = document.visibilityState === 'visible';
      if (isVisible) start();
      else stop();
    };

    const updateMotionPreference = () => {
      if (reducedMotion.matches) {
        stop();
        draw(elapsed);
      } else {
        start();
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    document.addEventListener('visibilitychange', updateVisibility);
    reducedMotion.addEventListener('change', updateMotionPreference);
    mobileQuery.addEventListener('change', resize);
    resize();
    updateMotionPreference();

    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', updateVisibility);
      reducedMotion.removeEventListener('change', updateMotionPreference);
      mobileQuery.removeEventListener('change', resize);
    };
  }, [state]);

  return <div className={`digital-waves digital-waves-${state}`} role="status" aria-live="polite" data-testid="ai-live-core">
    <canvas ref={canvasRef} className="digital-waves-canvas" aria-hidden="true" />
    <span className="sr-only">{stateLabels[state]}</span>
  </div>;
}
