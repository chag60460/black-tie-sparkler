const root = document.documentElement;
const experience = document.querySelector('#experience');
const canvas = document.querySelector('#sparkler-effects');
const ctx = canvas.getContext('2d');
const seal = document.querySelector('#seal');
const replay = document.querySelector('#replay');
const skip = document.querySelector('#skip');
const invitation = document.querySelector('#invitation');
const card = document.querySelector('#invitation-card');
const cardTurn = document.querySelector('#card-turn');
const rsvpFace = document.querySelector('#rsvp-face');
const rsvpOpen = document.querySelector('#rsvp-open');
const rsvpHeading = document.querySelector('#rsvp-title');
const footer = document.querySelector('.footer');
const assembly = document.querySelector('#assembly');
const back = document.querySelector('#envelope-back');
const front = document.querySelector('#envelope-front');
const flap = document.querySelector('#envelope-flap');
const letterWindow = document.querySelector('#letter-window');
const ink = [...document.querySelectorAll('[data-ink]')];
const status = document.querySelector('#status');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const particles = [];
const heatTrail = [];
const cuts = { release: .34, flap: .76, emerge: 1.8, ignite: 2.1, sear: 4.55, ready: 6.2, settle: 7.3 };
const path = [
  [[567, 156], [540, 190], [232, 173], [196, 243]],
  [[196, 243], [162, 312], [550, 287], [551, 363]],
  [[551, 363], [540, 432], [194, 406], [196, 476]],
  [[196, 476], [207, 525], [440, 551], [523, 541]]
];
let loaded = false;
let playing = false;
let elapsed = 0;
let lastNow = 0;
let frameId = 0;
let flipTimer = 0;
let sparkBudget = 0;
let ignitionDone = false;
let currentPhase = 'loading';
let seed = 1279;
let dpr = 1;

function clamp(value, min = 0, max = 1) { return Math.min(max, Math.max(min, value)); }
function progress(value, start, end) { return clamp((value - start) / (end - start)); }
function smooth(value, start, end) { const p = progress(value, start, end); return p * p * (3 - 2 * p); }
function easeOut(value, start, end) { return 1 - Math.pow(1 - progress(value, start, end), 3); }
function lerp(a, b, amount) { return a + (b - a) * amount; }
function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
function phaseAt(t) {
  if (t <= 0) return 'closed';
  if (t < cuts.release) return 'releasing';
  if (t < cuts.flap) return 'opening';
  if (t < cuts.emerge) return 'emerging';
  if (t < cuts.ignite) return 'igniting';
  if (t < cuts.sear) return 'searing';
  if (t < cuts.ready) return 'lettering';
  return 'ready';
}
function setPhase(phase) {
  if (currentPhase === phase) return;
  currentPhase = phase;
  root.dataset.phase = phase;
  if (phase === 'ready') {
    invitation.inert = false;
    invitation.setAttribute('aria-hidden', 'false');
    invitation.focus({ preventScroll: true });
    skip.disabled = true;
    status.textContent = 'Your invitation is ready. Grace: the birthday party. Date to follow. Use the sparkling RSVP button on the card to turn it over. Opening or turning the invitation does not send a response.';
  }
}
function pose(t) {
  const rise = easeOut(t, .7, cuts.emerge);
  const envelopeY = lerp(330, 530, rise);
  const cardY = lerp(330, 56, rise);
  const sealRelease = easeOut(t, .12, .7);
  const flip = smooth(t, .24, .95);
  assembly.style.transform = `rotate(${root.dataset.side === 'rsvp' ? 0 : lerp(-8, -2, rise)}deg)`;
  back.style.top = `${envelopeY}px`;
  front.style.top = `${envelopeY}px`;
  flap.style.top = `${envelopeY}px`;
  flap.style.transform = `perspective(900px) rotateX(${-178 * flip}deg)`;
  flap.style.zIndex = flip > .5 ? '0' : '5';
  letterWindow.style.height = `${envelopeY + 350}px`;
  letterWindow.style.opacity = String(smooth(t, .53, .78));
  card.style.setProperty('--card-y', `${cardY}px`);
  seal.style.top = `${envelopeY + 158}px`;
  seal.style.transform = `translate(${-96 * sealRelease}px, ${52 * sealRelease}px) rotate(${-18 * sealRelease}deg) scale(${lerp(1, .84, sealRelease)})`;
  ink.forEach((element, index) => {
    const start = cuts.sear + .09 + index * .13;
    const p = smooth(t, start, start + .66);
    const heat = Math.sin(p * Math.PI) * (1 - smooth(t, 5.85, cuts.ready));
    element.style.opacity = String(p);
    element.style.clipPath = `inset(-25px ${lerp(108, -8, easeOut(t, start, start + .66))}% -25px -8%)`;
    element.style.filter = p === 1 ? 'none' : `brightness(${1 + heat * 1.5}) blur(${(1 - p) * 2.8}px) drop-shadow(0 0 ${heat * 12}px rgba(255, 170, 61, ${heat * .85}))`;
  });
  root.dataset.elapsed = t.toFixed(3);
  setPhase(phaseAt(t));
}
function finishCardFlip() {
  if (root.dataset.flipping !== 'true') return;
  clearTimeout(flipTimer);
  flipTimer = 0;
  const showingRsvp = root.dataset.side === 'rsvp';
  root.dataset.flipping = 'false';
  invitation.inert = showingRsvp;
  invitation.setAttribute('aria-hidden', String(showingRsvp));
  rsvpFace.inert = !showingRsvp;
  rsvpFace.setAttribute('aria-hidden', String(!showingRsvp));
  footer.inert = showingRsvp;
  if (showingRsvp) {
    const confirmationHeading = rsvpFace.querySelector('#rsvp-confirmation:not([hidden]) h1');
    const errorMessage = rsvpFace.querySelector('#rsvp-feedback:not([hidden])');
    (confirmationHeading || errorMessage || rsvpHeading).focus();
    status.textContent = 'The RSVP is on the back of your invitation. Your reply is sent only when you submit the form.';
  } else {
    rsvpOpen.focus({ preventScroll: true });
    status.textContent = 'Your invitation. Use RSVP to turn it over again; any unfinished reply is still there.';
  }
}
function turnCard(showRsvp, { updateHistory = true, animate = true } = {}) {
  if (!loaded || currentPhase !== 'ready') return;
  if (showRsvp === (root.dataset.side === 'rsvp')) return;
  if (playing) finishImmediately();
  clearTimeout(flipTimer);
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  invitation.inert = true;
  invitation.setAttribute('aria-hidden', 'true');
  rsvpFace.inert = true;
  rsvpFace.setAttribute('aria-hidden', 'true');
  footer.inert = true;
  if (!animate) root.classList.add('instant-card');
  root.dataset.flipping = 'true';
  root.dataset.side = showRsvp ? 'rsvp' : 'invitation';
  status.textContent = showRsvp ? 'Turning your invitation over to the RSVP.' : 'Turning back to your invitation.';
  pose(elapsed);
  resize();
  if (updateHistory) history.pushState(null, '', showRsvp ? '#rsvp' : '#invitation');
  const duration = Number.parseFloat(getComputedStyle(cardTurn).transitionDuration) * 1000;
  if (!animate || reduced.matches || duration === 0) {
    // Commit direct-link poses before re-enabling transitions.
    cardTurn.getBoundingClientRect();
    root.classList.remove('instant-card');
    finishCardFlip();
  } else {
    flipTimer = setTimeout(finishCardFlip, duration + 50);
  }
}
function syncCardRoute(animate = true) {
  if (!['', '#invitation', '#rsvp'].includes(location.hash)) return;
  if (!loaded) return;
  if ((location.hash === '#rsvp' || location.hash === '#invitation') && (currentPhase !== 'ready' || playing)) finishImmediately();
  if (currentPhase === 'ready') {
    turnCard(location.hash === '#rsvp', { updateHistory: false, animate });
  }
}
function bezier(points, t) {
  const u = 1 - t;
  return {
    x: u * u * u * points[0][0] + 3 * u * u * t * points[1][0] + 3 * u * t * t * points[2][0] + t * t * t * points[3][0],
    y: u * u * u * points[0][1] + 3 * u * u * t * points[1][1] + 3 * u * t * t * points[2][1] + t * t * t * points[3][1]
  };
}
function sparklerPose(t) {
  if (t < .67) return null;
  if (t < cuts.emerge) {
    const p = easeOut(t, .67, cuts.emerge);
    return { x: lerp(560, 567, p), y: lerp(430, 156, p), angle: .17, alpha: smooth(t, .67, .95) };
  }
  if (t < cuts.ignite) return { x: 567, y: 156, angle: .17, alpha: 1 };
  if (t < cuts.sear) {
    const p = progress(t, cuts.ignite, cuts.sear) * path.length;
    const segment = Math.min(path.length - 1, Math.floor(p));
    const point = bezier(path[segment], p - segment);
    return { ...point, angle: .22 + Math.sin(p * 1.8) * .12, alpha: 1 };
  }
  const out = easeOut(t, cuts.sear, 5.35);
  return { x: lerp(523, 612, out), y: lerp(541, 342, out), angle: lerp(.22, .39, out), alpha: 1 };
}
function emissionAt(t) {
  if (t < cuts.emerge || t > 5.65) return 0;
  if (t < cuts.ignite) return lerp(100, 260, progress(t, cuts.emerge, cuts.ignite));
  if (t < cuts.sear) return 240;
  return 170 * (1 - smooth(t, cuts.sear, 5.65));
}
function emit(point, count, burst = false) {
  for (let i = 0; i < count; i++) {
    if (particles.length >= 320) particles.shift();
    const angle = random() * Math.PI * 2;
    const speed = burst ? 95 + random() * 210 : 30 + random() * 170;
    const life = .24 + random() * (burst ? 1 : .75);
    particles.push({
      x: point.x, y: point.y,
      lastX: point.x, lastY: point.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 32,
      life, duration: life,
      width: .65 + random() * .95,
      bright: random() > .83,
      tone: random()
    });
  }
}
function drawStem(point, heat) {
  if (!point) return;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(-point.angle);
  ctx.globalAlpha = point.alpha;
  const shadow = ctx.createLinearGradient(-3, 0, 3, 0);
  shadow.addColorStop(0, '#151511');
  shadow.addColorStop(.4, '#a3997c');
  shadow.addColorStop(.6, '#514f41');
  shadow.addColorStop(1, '#201f19');
  ctx.fillStyle = shadow;
  ctx.fillRect(-.9, 47, 1.8, 193);
  const coating = ctx.createLinearGradient(-3, 0, 3, 0);
  coating.addColorStop(0, '#28261e');
  coating.addColorStop(.4, '#827761');
  coating.addColorStop(.7, '#49473a');
  coating.addColorStop(1, '#1b1b16');
  ctx.fillStyle = coating;
  ctx.beginPath(); ctx.roundRect(-2.6, -2, 5.2, 72, 2.5); ctx.fill();
  ctx.fillStyle = '#b7a17940';
  for (let y = 5; y < 68; y += 6) ctx.fillRect(-1.5 + (y % 3) * .7, y, 1, 1.8);
  if (heat > .01) {
    ctx.fillStyle = `rgba(255, 191, 93, ${heat})`;
    ctx.beginPath(); ctx.ellipse(0, 0, 2.3, 4, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function drawCore(point, intensity, t) {
  if (!point || intensity <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, 62);
  glow.addColorStop(0, `rgba(255, 230, 160, ${.44 * intensity})`);
  glow.addColorStop(.16, `rgba(255, 176, 60, ${.27 * intensity})`);
  glow.addColorStop(.5, `rgba(221, 130, 25, ${.08 * intensity})`);
  glow.addColorStop(1, 'rgba(190, 100, 10, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(point.x - 63, point.y - 63, 126, 126);
  ctx.strokeStyle = `rgba(255, 230, 170, ${.8 * intensity})`;
  ctx.lineWidth = .65;
  const rays = 15;
  for (let i = 0; i < rays; i++) {
    const angle = i * Math.PI * 2 / rays + t * .6;
    const length = (8 + (Math.sin(t * 12 + i * 7) + 1) * 13) * intensity;
    ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineTo(point.x + Math.cos(angle) * length, point.y + Math.sin(angle) * length); ctx.stroke();
  }
  ctx.fillStyle = `rgba(255, 249, 218, ${intensity})`;
  ctx.beginPath(); ctx.arc(point.x, point.y, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawEffects(t, dt, advancing) {
  ctx.clearRect(0, 0, 720, 880);
  if (reduced.matches || t <= 0) return;
  const point = sparklerPose(t);
  const emission = emissionAt(t);
  const heat = clamp(emission / 220);
  if (advancing && point) {
    if (!ignitionDone && t >= cuts.emerge) {
      ignitionDone = true;
      emit(point, 46, true);
    }
    sparkBudget += emission * dt;
    const count = Math.floor(sparkBudget);
    if (count > 0) { emit(point, count); sparkBudget -= count; }
    if (t >= cuts.ignite && t < cuts.sear) heatTrail.push({ x: point.x, y: point.y, born: t });
  }
  while (heatTrail.length && t - heatTrail[0].born > .65) heatTrail.shift();
  if (point && heat > 0) {
    const cast = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, 145);
    cast.addColorStop(0, `rgba(231, 153, 64, ${heat * .09})`);
    cast.addColorStop(1, 'rgba(231, 153, 64, 0)');
    ctx.fillStyle = cast;
    ctx.fillRect(point.x - 145, point.y - 145, 290, 290);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 1; i < heatTrail.length; i++) {
    const start = heatTrail[i - 1];
    const end = heatTrail[i];
    const alpha = Math.pow(1 - clamp((t - end.born) / .65), 2);
    ctx.strokeStyle = `rgba(214, 125, 29, ${alpha * .12})`;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    ctx.strokeStyle = `rgba(255, 193, 105, ${alpha * .45})`;
    ctx.lineWidth = .7;
    ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
  }
  ctx.restore();
  drawStem(point, heat);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (advancing) {
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.lastX = p.x;
      p.lastY = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-1.6 * dt);
      p.vy = p.vy * Math.exp(-1.1 * dt) + 83 * dt;
    }
    const alpha = Math.pow(clamp(p.life / p.duration), .7);
    const length = p.bright ? .12 : .045;
    const tailX = p.x - p.vx * length;
    const tailY = p.y - p.vy * length;
    ctx.strokeStyle = `rgba(255, ${Math.round(170 + p.tone * 65)}, ${Math.round(62 + p.tone * 94)}, ${alpha * .9})`;
    ctx.lineWidth = p.width;
    ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(p.x, p.y); ctx.stroke();
    if (p.bright && alpha > .25) {
      ctx.fillStyle = `rgba(255, 238, 188, ${alpha * .8})`;
      ctx.fillRect(p.x - .7, p.y - .7, 1.4, 1.4);
      if (i % 7 === 0 && alpha > .5) {
        ctx.fillRect(p.x - 2.4, p.y - .35, 4.8, .7);
        ctx.fillRect(p.x - .35, p.y - 2.4, .7, 4.8);
      }
    }
  }
  drawCore(point, heat, t);
  root.dataset.particles = String(particles.length);
  root.dataset.sparklerLit = String(emission > 0);
}
function frame(now) {
  frameId = 0;
  if (!playing || !loaded || document.hidden) return;
  const delta = lastNow ? Math.min((now - lastNow) / 1000, .35) : 0;
  lastNow = now;
  elapsed += delta;
  pose(elapsed);
  drawEffects(elapsed, Math.min(delta, .04), true);
  if (elapsed < cuts.settle) frameId = requestAnimationFrame(frame);
  else {
    playing = false;
    particles.length = 0;
    heatTrail.length = 0;
    drawEffects(cuts.settle, 0, false);
  }
}
function start() {
  if (!loaded || currentPhase !== 'closed') return;
  if (reduced.matches) { finishImmediately(); return; }
  seal.disabled = true;
  seal.setAttribute('aria-expanded', 'true');
  replay.disabled = false;
  skip.textContent = 'Skip animation';
  status.textContent = 'Opening your invitation. The blank card and sparkler will emerge, the sparkler will sweep across the paper, and then the gold lettering will appear.';
  elapsed = .001;
  playing = true;
  lastNow = 0;
  pose(elapsed);
  frameId = requestAnimationFrame(frame);
}
function finishImmediately() {
  if (!loaded) return;
  cancelAnimationFrame(frameId);
  frameId = 0;
  playing = false;
  elapsed = cuts.settle;
  particles.length = 0;
  heatTrail.length = 0;
  seal.disabled = true;
  seal.setAttribute('aria-expanded', 'true');
  replay.disabled = false;
  skip.disabled = true;
  const alreadyInstant = root.classList.contains('instant-card');
  root.classList.add('instant-card');
  pose(elapsed);
  ctx.clearRect(0, 0, 720, 880);
  root.dataset.particles = '0';
  root.dataset.sparklerLit = 'false';
  card.getBoundingClientRect();
  if (!alreadyInstant) root.classList.remove('instant-card');
}
function reset() {
  if (!loaded) return;
  cancelAnimationFrame(frameId);
  clearTimeout(flipTimer);
  flipTimer = 0;
  root.dataset.side = 'invitation';
  root.dataset.flipping = 'false';
  rsvpFace.inert = true;
  rsvpFace.setAttribute('aria-hidden', 'true');
  footer.inert = false;
  frameId = 0;
  playing = false;
  elapsed = 0;
  lastNow = 0;
  sparkBudget = 0;
  ignitionDone = false;
  seed = 1279;
  particles.length = 0;
  heatTrail.length = 0;
  invitation.inert = true;
  invitation.setAttribute('aria-hidden', 'true');
  seal.disabled = false;
  seal.setAttribute('aria-expanded', 'false');
  replay.disabled = true;
  skip.disabled = false;
  skip.textContent = 'Open without motion';
  pose(0);
  ctx.clearRect(0, 0, 720, 880);
  root.dataset.particles = '0';
  root.dataset.sparklerLit = 'false';
}
function resize() {
  const scale = Math.min((experience.clientWidth - 46) / 406, (experience.clientHeight - 108) / 880, 1.04);
  root.style.setProperty('--scale', String(Math.max(.45, scale)));
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(720 * dpr);
  canvas.height = Math.round(880 * dpr);
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (loaded) drawEffects(elapsed, 0, false);
  }
}
function showError(error) {
  const output = document.querySelector('#error');
  output.textContent = `The invitation could not load: ${error.message}. Keep the assets folder next to this page and reload.`;
  output.hidden = false;
  root.dataset.phase = 'error';
  seal.disabled = true;
  replay.disabled = true;
  skip.disabled = true;
  console.error(error);
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Missing artwork: ${src}`));
    image.src = src;
  });
}
seal.addEventListener('click', start);
replay.addEventListener('click', () => {
  reset();
  history.replaceState(null, '', location.href.split('#')[0]);
  seal.focus({ preventScroll: true });
  status.textContent = 'The invitation is sealed again. Press the seal to replay.';
});
skip.addEventListener('click', finishImmediately);
rsvpOpen.addEventListener('click', event => {
  event.preventDefault();
  turnCard(true);
});
document.querySelectorAll('[data-flip-back]').forEach(link => {
  link.addEventListener('click', event => {
    event.preventDefault();
    turnCard(false);
  });
});
cardTurn.addEventListener('transitionend', event => {
  if (event.target === cardTurn && event.propertyName === 'transform') finishCardFlip();
});
window.addEventListener('hashchange', () => syncCardRoute());
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(frameId);
    frameId = 0;
  } else if (playing) {
    lastNow = 0;
    frameId = requestAnimationFrame(frame);
  }
});
reduced.addEventListener('change', () => {
  if (reduced.matches && playing) finishImmediately();
  if (reduced.matches) finishCardFlip();
});
resize();
if (!ctx) {
  showError(new Error('Canvas 2D is unavailable in this browser'));
} else {
  Promise.all([
    './assets/black-paper.webp',
    './assets/black-velvet.webp',
    './assets/gold-seal.png',
    './assets/gold-corner.png',
    './assets/gold-crest.png',
    './assets/gold-name.png'
  ].map(loadImage)).then(() => {
    loaded = true;
    reset();
    if (location.hash === '#invitation' || location.hash === '#rsvp') {
      syncCardRoute(false);
    } else {
      status.textContent = 'A sealed invitation. Press the gold seal, or choose Open without motion.';
    }
  }).catch(showError);
}
