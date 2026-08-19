const typewriter = document.querySelector('[data-typewriter]');

if (typewriter) {
  const fullText = typewriter.dataset.typewriter || '';
  const main = typewriter.querySelector('.typewriter-main');
  const trail = typewriter.querySelector('.typewriter-trail');
  const caret = typewriter.querySelector('.typewriter-caret');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const trailLength = 3;
  let value = '';
  let phase = 'start';
  let timer = 0;

  const render = () => {
    const split = Math.max(0, value.length - trailLength);
    main.textContent = value.slice(0, split);
    trail.textContent = value.slice(split);
  };

  const schedule = (delay) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(step, delay);
  };

  const step = () => {
    if (reducedMotion.matches) {
      value = fullText;
      caret.hidden = true;
      render();
      return;
    }

    caret.hidden = false;
    if (phase === 'start') {
      phase = 'typing';
      schedule(400);
      return;
    }
    if (phase === 'typing') {
      value = fullText.slice(0, value.length + 1);
      render();
      if (value === fullText) {
        phase = 'pause-full';
        schedule(900 + (/[.!?]$/.test(value) ? 320 : 0));
      } else schedule(45);
      return;
    }
    if (phase === 'pause-full') {
      phase = 'deleting';
      schedule(30);
      return;
    }
    if (phase === 'deleting') {
      value = value.slice(0, -1);
      render();
      if (!value) {
        phase = 'pause-empty';
        schedule(300);
      } else schedule(30);
      return;
    }
    phase = 'typing';
    schedule(45);
  };

  const restart = () => {
    window.clearTimeout(timer);
    value = reducedMotion.matches ? fullText : '';
    phase = 'start';
    render();
    step();
  };

  reducedMotion.addEventListener('change', restart);
  restart();
}
