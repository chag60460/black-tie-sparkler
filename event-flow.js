const eventFlow = (() => {
  const source = document.querySelector('#experience');
  const sourceStatus = document.querySelector('#status');
  const replyCard = document.querySelector('#rsvp-face');
  const lookbook = document.querySelector('#lookbook');
  const agenda = document.querySelector('#agenda');
  const views = [lookbook, agenda];
  const overlay = document.querySelector('#event-effects');
  const effectCanvas = document.querySelector('#event-sparks');
  const output = document.querySelector('#event-status');
  const errorOutput = document.querySelector('#event-error');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const duration = 3600;
  let renderer = null;
  let running = false;
  let requestId = 0;
  let elapsedTime = 0;
  let previousTime = null;
  let onFinished = null;

  function stopEffect() {
    cancelAnimationFrame(requestId);
    requestId = 0;
    running = false;
    renderer?.reset();
    overlay.hidden = true;
    document.body.classList.remove('is-transitioning');
  }

  function finishAcceptance() {
    const callback = onFinished;
    onFinished = null;
    callback?.();
  }

  function show(view) {
    stopEffect();
    views.forEach(element => {
      element.hidden = element !== view;
      element.inert = element !== view;
      element.setAttribute('aria-hidden', String(element !== view));
      element.classList.remove('is-staged');
    });
    source.hidden = !!view;
    source.inert = !!view;
    sourceStatus.hidden = !!view;
    source.setAttribute('aria-hidden', String(!!view));
    scrollTo(0, 0);
    if (view) {
      view.querySelector('h1').focus({ preventScroll: true });
      output.textContent = view === lookbook
        ? 'The dress code: all-black outfits. Pants required. No dresses. No strict formality.'
        : 'The evening agenda. Arrive in Kirkland by 4 pm. Photos until 5:30 pm. Dinner afterward at Happy Lamb Hotpot Bellevue.';
    } else {
      resize();
      syncCardRoute(false);
      output.textContent = '';
    }
    finishAcceptance();
  }

  function complete() {
    history.pushState(null, '', '#lookbook');
    show(lookbook);
  }

  function fail(error) {
    console.error('The RSVP was received, but its transition could not play:', error);
    errorOutput.textContent = 'Your RSVP was received. The transition could not play, so your dress code is shown without motion.';
    errorOutput.hidden = false;
    complete();
  }

  function frame(now) {
    requestId = 0;
    if (!running || document.hidden) return;
    const delta = previousTime === null ? 0 : Math.min(now - previousTime, 100);
    previousTime = now;
    elapsedTime = Math.min(duration, elapsedTime + delta);
    renderer.draw(elapsedTime / duration);
    if (!running) return;
    if (elapsedTime === duration) complete();
    else requestId = requestAnimationFrame(frame);
  }

  function reveal(callback) {
    onFinished = callback;
    document.querySelector('#event-details-link').hidden = false;
    document.querySelector('#event-receipt').textContent = 'Your reply, received';
    errorOutput.hidden = true;
    if (motion.matches) { complete(); return; }
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    source.hidden = false;
    turnCard(true, { updateHistory: false, animate: false });
    finishCardFlip();
    source.inert = true;
    source.setAttribute('aria-hidden', 'true');
    sourceStatus.hidden = true;
    agenda.hidden = true;
    agenda.inert = true;
    agenda.setAttribute('aria-hidden', 'true');
    lookbook.hidden = false;
    lookbook.inert = true;
    lookbook.setAttribute('aria-hidden', 'true');
    lookbook.classList.add('is-staged');
    overlay.hidden = false;
    document.body.classList.add('is-transitioning');
    try {
      if (!renderer) {
        const context = effectCanvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D is unavailable for Gold dust.');
        renderer = new GoldenSparkTransition(effectCanvas, source, replyCard, context, duration, fail);
        renderer.setMotion('dust');
      }
      renderer.reset();
      renderer.resize();
      elapsedTime = 0;
      previousTime = null;
      running = true;
      renderer.draw(0);
      if (!running) return;
      output.textContent = 'Your RSVP was received. Gold dust is revealing the dress code.';
      requestId = requestAnimationFrame(frame);
    } catch (error) {
      fail(error);
    }
  }

  function route() {
    const name = location.hash.slice(1);
    if (name === 'lookbook') show(lookbook);
    else if (name === 'agenda') show(agenda);
    else if (['', 'invitation', 'rsvp'].includes(name)) show(null);
    else {
      errorOutput.textContent = 'This invitation section could not be found. Open the invitation to continue.';
      errorOutput.hidden = false;
      console.error('Unknown invitation section:', name);
      show(null);
    }
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('resize', () => {
    if (!running) return;
    renderer.resize();
    renderer.draw(elapsedTime / duration);
  });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(requestId);
    requestId = 0;
    previousTime = null;
    if (!document.hidden && running) requestId = requestAnimationFrame(frame);
  });
  motion.addEventListener('change', () => {
    if (motion.matches && running) complete();
  });
  route();
  return Object.freeze({ reveal });
})();
