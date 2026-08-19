const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');

const galaxyCanvas = document.querySelector('.stars-galaxy');

if (galaxyCanvas) {
  const context = galaxyCanvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const config = {
    gap: 14,
    radius: 0.85,
    padding: 8,
    influenceRadius: 100,
    pushStrength: 17,
    glowBoost: 0.58,
  };
  const pointer = { x: -9999, y: -9999, smoothX: -9999, smoothY: -9999, active: false };
  let dots = [];
  let shootingStars = [];
  let nextShootingStar = 2 + Math.random() * 3;
  let frameId = 0;
  let lastTime = performance.now();
  let width = 0;
  let height = 0;
  let pixelRatio = 1;

  const createGrid = () => {
    const mobile = width < 768;
    const budget = mobile ? 1500 : 8000;
    const minimumGap = mobile ? 18 : 12;
    let gap = Math.max(config.gap, minimumGap);
    if (((width * height) / (gap * gap)) > budget) gap = Math.ceil(Math.sqrt((width * height) / budget));
    const columns = Math.floor((width - config.padding * 2) / gap) + 1;
    const rows = Math.floor((height - config.padding * 2) / gap) + 1;
    const offsetX = (width - (columns - 1) * gap) / 2;
    const offsetY = (height - (rows - 1) * gap) / 2;

    dots = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const roll = Math.random();
        const type = roll > 0.986 ? 3 : roll > 0.95 ? 2 : roll > 0.87 ? 1 : 0;
        const jitter = type ? gap * 0.8 : 0;
        const baseX = offsetX + column * gap + (Math.random() - 0.5) * jitter;
        const baseY = offsetY + row * gap + (Math.random() - 0.5) * jitter;
        dots.push({
          baseX, baseY, x: baseX, y: baseY, vx: 0, vy: 0, type,
          phase: Math.random() * Math.PI * 2,
          speed: 0.4 + Math.random() * 2.4,
          rotation: Math.random() * Math.PI * 0.5,
          alpha: type === 3 ? 0.75 : type === 2 ? 0.5 : type === 1 ? 0.3 : 0.19 + Math.random() * 0.08,
          radius: type === 3 ? 3 + Math.random() : type === 2 ? 2 + Math.random() * 0.7 : type === 1 ? 1.3 + Math.random() * 0.4 : config.radius,
        });
      }
    }
  };

  const resizeGalaxy = () => {
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    width = document.documentElement.clientWidth;
    height = window.innerHeight;
    galaxyCanvas.width = Math.round(width * pixelRatio);
    galaxyCanvas.height = Math.round(height * pixelRatio);
    galaxyCanvas.style.width = `${width}px`;
    galaxyCanvas.style.height = `${height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    createGrid();
  };

  const drawStar = (dot, alpha, radius) => {
    const innerRadius = radius * 0.3;
    context.beginPath();
    for (let point = 0; point < 8; point += 1) {
      const angle = dot.rotation + point * Math.PI / 4;
      const pointRadius = point % 2 === 0 ? radius : innerRadius;
      const x = dot.x + Math.cos(angle) * pointRadius;
      const y = dot.y + Math.sin(angle) * pointRadius;
      if (point === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath();
    context.fillStyle = `rgba(200,255,61,${alpha})`;
    context.fill();

    if (width >= 768 && dot.type >= 2) {
      const glowRadius = radius * (dot.type === 3 ? 5 : 3);
      const glow = context.createRadialGradient(dot.x, dot.y, radius * 0.2, dot.x, dot.y, glowRadius);
      glow.addColorStop(0, `rgba(200,255,61,${alpha * 0.22})`);
      glow.addColorStop(1, 'rgba(200,255,61,0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(dot.x, dot.y, glowRadius, 0, Math.PI * 2);
      context.fill();
    }
  };

  const drawShootingStars = (delta) => {
    if (!reducedMotion.matches) nextShootingStar -= delta;
    if (nextShootingStar <= 0) {
      shootingStars.push({ x: Math.random() * width * 0.65, y: -8, vx: 4 + Math.random() * 2, vy: 2.4 + Math.random() * 2, life: 1, length: 40 + Math.random() * 35 });
      nextShootingStar = 3 + Math.random() * 3;
    }

    shootingStars = shootingStars.filter((star) => {
      if (!reducedMotion.matches) {
        star.x += star.vx;
        star.y += star.vy;
        star.life -= 0.012;
      }
      const speed = Math.hypot(star.vx, star.vy);
      const tailX = star.x - (star.vx / speed) * star.length;
      const tailY = star.y - (star.vy / speed) * star.length;
      const trail = context.createLinearGradient(tailX, tailY, star.x, star.y);
      trail.addColorStop(0, 'rgba(200,255,61,0)');
      trail.addColorStop(1, `rgba(200,255,61,${star.life * 0.85})`);
      context.strokeStyle = trail;
      context.lineWidth = 1.2;
      context.beginPath();
      context.moveTo(tailX, tailY);
      context.lineTo(star.x, star.y);
      context.stroke();
      return star.life > 0 && star.x < width + 60 && star.y < height + 60;
    });
  };

  const drawGalaxy = (now = performance.now()) => {
    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    const time = reducedMotion.matches ? 0 : now * 0.001;
    context.fillStyle = '#080a08';
    context.fillRect(0, 0, width, height);

    if (pointer.active) {
      pointer.smoothX += (pointer.x - pointer.smoothX) * 0.12;
      pointer.smoothY += (pointer.y - pointer.smoothY) * 0.12;
    }

    dots.forEach((dot) => {
      const distanceX = dot.baseX - pointer.smoothX;
      const distanceY = dot.baseY - pointer.smoothY;
      const distance = Math.hypot(distanceX, distanceY);
      const influence = pointer.active && distance < config.influenceRadius ? (1 - distance / config.influenceRadius) ** 3 : 0;
      const targetX = dot.baseX + (distance > 0 ? distanceX / distance : 0) * config.pushStrength * influence;
      const targetY = dot.baseY + (distance > 0 ? distanceY / distance : 0) * config.pushStrength * influence;

      if (!reducedMotion.matches) {
        dot.vx = (dot.vx + (targetX - dot.x) * 0.15) * 0.75;
        dot.vy = (dot.vy + (targetY - dot.y) * 0.15) * 0.75;
        dot.x += dot.vx;
        dot.y += dot.vy;
        dot.rotation += dot.type ? 0.002 + dot.type * 0.001 : 0;
      }

      const breathe = dot.type === 0 ? (Math.sin(dot.baseX * 0.012 + dot.baseY * 0.008 + time * 0.6) + 1) * 0.045 : 0;
      const twinkle = dot.type ? 0.55 + (Math.sin(time * dot.speed + dot.phase) + 1) * 0.225 : 1;
      const alpha = Math.min(1, (dot.alpha + breathe) * twinkle + config.glowBoost * influence);
      const radius = dot.radius * (1 + influence * 0.6);

      if (dot.type === 0) {
        context.fillStyle = `rgba(244,245,239,${alpha})`;
        context.beginPath();
        context.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
        context.fill();
      } else drawStar(dot, alpha, radius);
    });

    drawShootingStars(delta);
    if (!reducedMotion.matches) frameId = window.requestAnimationFrame(drawGalaxy);
  };

  const restartGalaxy = () => {
    window.cancelAnimationFrame(frameId);
    drawGalaxy();
  };

  resizeGalaxy();
  drawGalaxy();

  window.addEventListener('resize', () => {
    resizeGalaxy();
    if (reducedMotion.matches) drawGalaxy();
  });
  window.addEventListener('pointermove', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (!pointer.active) {
      pointer.smoothX = pointer.x;
      pointer.smoothY = pointer.y;
    }
    pointer.active = true;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer.active = false; });
  reducedMotion.addEventListener('change', restartGalaxy);
}

menuButton?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
});

document.querySelectorAll('.nav nav a').forEach((link) => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menuButton?.setAttribute('aria-expanded', 'false');
  menuButton?.setAttribute('aria-label', 'Abrir menu');
}));

const tabs = [...document.querySelectorAll('[role="tab"]')];
tabs.forEach((tab) => tab.addEventListener('click', () => {
  tabs.forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
  tabs.forEach((item) => item.setAttribute('tabindex', item === tab ? '0' : '-1'));
  document.querySelectorAll('[role="tabpanel"]').forEach((panel) => {
    panel.hidden = panel.id !== tab.getAttribute('aria-controls');
  });
}));

tabs.forEach((tab, index) => tab.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const direction = event.key === 'ArrowRight' ? 1 : -1;
  const nextTab = tabs[(index + direction + tabs.length) % tabs.length];
  nextTab.click();
  nextTab.focus();
}));

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));
document.querySelector('#year').textContent = new Date().getFullYear();

const progressBar = document.querySelector('.scroll-progress span');
const updateScrollState = () => {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0;
  if (progressBar) progressBar.style.width = `${progress * 100}%`;
};

window.addEventListener('scroll', updateScrollState, { passive: true });
window.addEventListener('resize', updateScrollState);
updateScrollState();

const navigationLinks = [...document.querySelectorAll('.nav nav a[href^="#"]')];
const trackedSections = navigationLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

const navigationObserver = new IntersectionObserver((entries) => {
  const visible = entries
    .filter((entry) => entry.isIntersecting)
    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  navigationLinks.forEach((link) => {
    const active = link.getAttribute('href') === `#${visible.target.id}`;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}, { rootMargin: '-20% 0px -65%', threshold: [0, 0.2, 0.6] });

trackedSections.forEach((section) => navigationObserver.observe(section));

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !nav.classList.contains('open')) return;
  nav.classList.remove('open');
  menuButton?.setAttribute('aria-expanded', 'false');
  menuButton?.setAttribute('aria-label', 'Abrir menu');
  menuButton?.focus();
});

document.querySelectorAll('.faq details').forEach((detail) => {
  detail.addEventListener('toggle', () => {
    if (!detail.open) return;
    document.querySelectorAll('.faq details').forEach((other) => {
      if (other !== detail) other.open = false;
    });
  });
});

const promptToast = document.querySelector('.prompt-toast');
let toastTimer;
document.querySelectorAll('[data-prompt]').forEach((button) => {
  button.addEventListener('click', async () => {
    const prompt = button.dataset.prompt;
    if (!promptToast) return;
    let copied = false;
    try {
      await navigator.clipboard?.writeText(prompt);
      copied = Boolean(navigator.clipboard);
    } catch (_) {
      copied = false;
    }
    promptToast.textContent = copied ? `Exemplo copiado: “${prompt}”` : `Exemplo: “${prompt}”`;
    promptToast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => promptToast.classList.remove('show'), 2600);
  });
});

document.querySelectorAll('a[download]').forEach((link) => {
  link.addEventListener('click', () => {
    link.classList.add('download-started');
    const label = link.firstChild?.textContent?.trim() || 'Download';
    window.setTimeout(() => link.classList.remove('download-started'), 1800);
    if (promptToast) {
      promptToast.textContent = `${label} iniciado.`;
      promptToast.classList.add('show');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => promptToast.classList.remove('show'), 2200);
    }
  });
});
