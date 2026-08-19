const gravityCanvas = document.querySelector('.gravity-stars');

if (gravityCanvas) {
  const context = gravityCanvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = { x: 0, y: 0, active: false };
  const settings = {
    color: '#c8ff3d',
    speed: 0.3,
    opacity: 0.72,
    size: 2,
    glow: 15,
    influence: 115,
    gravity: 82,
  };
  let stars = [];
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let frameId = 0;

  const createStar = () => {
    const angle = Math.random() * Math.PI * 2;
    const velocity = settings.speed * (0.5 + Math.random() * 0.5);
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      radius: Math.random() * settings.size + 1,
      opacity: settings.opacity,
      mass: Math.random() * 0.5 + 0.5,
      glow: 1,
    };
  };

  const buildStars = () => {
    const count = width < 768 ? 54 : 92;
    stars = Array.from({ length: count }, createStar);
  };

  const resize = () => {
    width = document.documentElement.clientWidth;
    height = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    gravityCanvas.width = Math.round(width * pixelRatio);
    gravityCanvas.height = Math.round(height * pixelRatio);
    gravityCanvas.style.width = `${width}px`;
    gravityCanvas.style.height = `${height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    buildStars();
  };

  const updateStar = (star) => {
    if (pointer.active) {
      const dx = pointer.x - star.x;
      const dy = pointer.y - star.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0 && distance < settings.influence) {
        const force = (settings.influence - distance) / settings.influence;
        const gravity = force * settings.gravity * 0.001;
        star.vx += (dx / distance) * gravity;
        star.vy += (dy / distance) * gravity;
        star.opacity += (Math.min(1, settings.opacity + force * 0.4) - star.opacity) * 0.18;
        star.glow += (1 + force * 2 - star.glow) * 0.15;
      } else {
        star.opacity += (settings.opacity * 0.3 - star.opacity) * 0.04;
        star.glow += (1 - star.glow) * 0.08;
      }
    } else {
      star.opacity += (settings.opacity - star.opacity) * 0.1;
      star.glow += (1 - star.glow) * 0.08;
    }

    star.x += star.vx;
    star.y += star.vy;
    star.vx = (star.vx + (Math.random() - 0.5) * 0.001) * 0.999;
    star.vy = (star.vy + (Math.random() - 0.5) * 0.001) * 0.999;
    if (star.x < 0) star.x = width;
    if (star.x > width) star.x = 0;
    if (star.y < 0) star.y = height;
    if (star.y > height) star.y = 0;
  };

  const draw = () => {
    context.fillStyle = '#080a08';
    context.fillRect(0, 0, width, height);
    stars.forEach((star) => {
      if (!reducedMotion.matches) updateStar(star);
      context.save();
      context.globalAlpha = star.opacity;
      context.fillStyle = settings.color;
      context.shadowColor = settings.color;
      context.shadowBlur = settings.glow * star.glow * 2;
      context.beginPath();
      context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      context.fill();
      context.restore();
    });
    if (!reducedMotion.matches) frameId = window.requestAnimationFrame(draw);
  };

  const restart = () => {
    window.cancelAnimationFrame(frameId);
    draw();
  };

  resize();
  draw();
  window.addEventListener('resize', () => {
    resize();
    if (reducedMotion.matches) draw();
  });
  window.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer.active = false; });
  reducedMotion.addEventListener('change', restart);
}
