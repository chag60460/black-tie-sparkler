class GoldenSparkTransition {
  static motions = {
    dust: {
      label: 'Gold dust',
      description: 'Dense flecks drift and tumble independently, like gold dust suspended in the air.'
    },
    blooms: {
      label: 'Spark blooms',
      description: 'Small bursts appear at scattered points, overlap, and soften into drifting specks.'
    },
    gusts: {
      label: 'Windblown shimmer',
      description: 'Uneven gusts carry the specks in shifting directions, without a shared circular centre.'
    },
    swirl: {
      label: 'Original swirl',
      description: 'The previous coordinated clockwise motion, kept here for comparison.'
    }
  };

  constructor(canvas, source, card, context, duration, onError) {
    if (!card) throw new Error('The RSVP card is unavailable for the spark transition.');
    this.canvas = canvas;
    this.source = source;
    this.card = card;
    this.context = context;
    this.duration = duration / 1000;
    this.onError = onError;
    this.motion = 'dust';
    this.particles = [];
    this.prepareGlow();
    this.resize();
    this.reset();
  }

  random() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  smooth(value) {
    const progress = Math.min(1, Math.max(0, value));
    return progress * progress * (3 - 2 * progress);
  }

  setMotion(motion) {
    if (!Object.hasOwn(GoldenSparkTransition.motions, motion)) {
      throw new Error(`Unknown golden-spark motion: ${motion}`);
    }
    this.motion = motion;
    this.reset();
  }

  prepareGlow() {
    this.glow = document.createElement('canvas');
    this.glow.width = 48;
    this.glow.height = 48;
    const context = this.glow.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable for the golden-spark glow.');
    const gradient = context.createRadialGradient(24, 24, 0, 24, 24, 24);
    gradient.addColorStop(0, 'rgba(255, 239, 178, .95)');
    gradient.addColorStop(.08, 'rgba(255, 225, 140, .8)');
    gradient.addColorStop(.22, 'rgba(238, 181, 64, .28)');
    gradient.addColorStop(.7, 'rgba(218, 150, 38, .06)');
    gradient.addColorStop(1, 'rgba(218, 150, 38, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 48, 48);
  }

  resize() {
    this.width = this.canvas.parentElement.clientWidth;
    this.height = this.canvas.parentElement.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clearParticles() {
    this.particles.length = 0;
    this.seed = 1279;
    this.elapsed = 0;
    this.nextBirth = this.duration * .02;
    this.blooms = this.motion === 'blooms'
      ? Array.from({ length: 24 }, () => ({ x: .1 + this.random() * .8, y: .1 + this.random() * .8 }))
      : [];
  }

  reset() {
    this.clearParticles();
    this.context.clearRect(0, 0, this.width, this.height);
    this.canvas.hidden = true;
    this.source.style.removeProperty('opacity');
    this.card.style.removeProperty('opacity');
  }

  position(particle, bounds, time) {
    const age = Math.max(0, time - particle.born);
    if (this.motion !== 'swirl') return this.fleckPosition(particle, bounds, time, age);
    const tightening = 1 - .18 * this.smooth(age / particle.life);
    const dispersal = .22 * this.smooth((time / this.duration - .68) / .32);
    const radius = particle.radius * tightening + dispersal;
    const angle = particle.phase + time * (2.6 + .8 * (1 - particle.radius)) + age * .3;
    return {
      x: bounds.left + bounds.width * .5 + Math.cos(angle) * radius * bounds.width * .56,
      y: bounds.top + bounds.height * .5 + Math.sin(angle) * radius * bounds.height * .56
    };
  }

  fleckPosition(particle, bounds, time, age) {
    const scale = Math.min(bounds.width, bounds.height);
    const dispersal = this.smooth((time / this.duration - .68) / .32);
    const x = bounds.left + bounds.width * particle.x;
    const y = bounds.top + bounds.height * particle.y;
    let dx;
    let dy;
    if (this.motion === 'blooms') {
      const radius = scale * particle.reach * (1 - Math.exp(-age * 3.1));
      const curl = Math.sin(age * particle.frequency) * scale * .012;
      dx = Math.cos(particle.heading) * radius - Math.sin(particle.heading) * curl;
      dy = Math.sin(particle.heading) * radius + Math.cos(particle.heading) * curl - scale * .025 * age * age;
    } else if (this.motion === 'gusts') {
      const row = particle.y * 5.2;
      const gust = .11 * (Math.sin(time * 2.2) - Math.sin(particle.born * 2.2))
        + .055 * (Math.sin(time * 4.1 + .8) - Math.sin(particle.born * 4.1 + .8));
      const lift = .055 * (Math.cos(time * 1.7 + .2) - Math.cos(particle.born * 1.7 + .2)) - age * .018;
      const ripple = .025 * (Math.sin(time * 3.3 + row) - Math.sin(particle.born * 3.3 + row));
      const tumble = .012 * (Math.cos(time * 3.7 + particle.heading) - Math.cos(particle.born * 3.7 + particle.heading));
      const response = .75 + particle.reach;
      dx = scale * (gust * response + ripple + particle.vx * age * .25);
      dy = scale * (lift * response + ripple * .5 + tumble);
    } else {
      dx = scale * (
        particle.vx * age
        + .025 * (Math.sin(particle.heading + age * particle.frequency) - Math.sin(particle.heading))
      );
      dy = scale * (
        particle.vy * age
        + .022 * (Math.cos(particle.tumble + age * particle.frequency * .73) - Math.cos(particle.tumble))
      );
    }
    return {
      x: x + dx + dispersal * (particle.x - .5) * scale * .18,
      y: y + dy - dispersal * scale * (.06 + particle.reach * .15)
    };
  }

  emitUntil(elapsed) {
    this.particles = this.particles.filter(particle => elapsed - particle.born < particle.life);
    while (this.nextBirth <= elapsed && this.nextBirth < this.duration * .76) {
      const progress = this.nextBirth / this.duration;
      const targetRadius = .07 + .95 * Math.sqrt(this.random());
      const radius = 1.03 + (targetRadius - 1.03) * this.smooth(progress / .22);
      const particle = {
        born: this.nextBirth,
        life: 1 + this.random() * .35,
        radius,
        phase: Math.floor(this.random() * 5) * Math.PI * 2 / 5 + radius * 4.8 + (this.random() - .5) * .32,
        width: .65 + this.random() * .95,
        bright: this.random() > (this.motion === 'swirl' ? .74 : .58),
        glint: this.random() > .985,
        tone: this.random()
      };
      if (this.motion !== 'swirl') {
        particle.x = .035 + this.random() * .93;
        particle.y = .035 + this.random() * .93;
        particle.vx = (this.random() - .5) * .075;
        particle.vy = (this.random() - .6) * .06;
        particle.heading = this.random() * Math.PI * 2;
        particle.tumble = this.random() * Math.PI * 2;
        particle.frequency = 1.4 + this.random() * 3.4;
        particle.reach = .06 + this.random() * .28;
        particle.width *= 1.35;
        if (this.motion === 'blooms') {
          const bloom = this.blooms[Math.min(this.blooms.length - 1, Math.floor(progress / .034))];
          particle.x = bloom.x + (this.random() - .5) * .04;
          particle.y = bloom.y + (this.random() - .5) * .04;
        }
      }
      if (elapsed - particle.born < particle.life) {
        if (this.particles.length >= 2800) this.particles.shift();
        this.particles.push(particle);
      }
      const rate = 24 + (600 + 1800 * this.smooth(progress / .18)) * (1 - this.smooth((progress - .58) / .18));
      this.nextBirth += 1 / rate;
    }
  }

  draw(progress) {
    const bounds = this.card.getBoundingClientRect();
    if (!bounds.width || !bounds.height) {
      this.onError(new Error('The RSVP card is not visible, so the sparks cannot be positioned.'));
      return;
    }
    const elapsed = progress * this.duration;
    if (elapsed < this.elapsed) this.clearParticles();
    this.elapsed = elapsed;
    this.emitUntil(elapsed);
    this.card.style.opacity = String(1 - this.smooth((progress - .06) / .62));
    this.source.style.opacity = String(1 - this.smooth((progress - .4) / .6));
    const release = 1 - this.smooth((progress - .8) / .2);
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    this.canvas.hidden = false;
    context.save();
    context.globalCompositeOperation = 'lighter';
    context.lineCap = 'round';
    const trails = Array.from({ length: 48 }, () => new Path2D());
    const cores = Array.from({ length: 8 }, () => new Path2D());

    for (const particle of this.particles) {
      const age = elapsed - particle.born;
      const tailDuration = this.motion === 'swirl'
        ? (particle.bright ? .075 : .04)
        : (particle.bright ? .014 : .008);
      const tailTime = Math.max(particle.born, elapsed - tailDuration);
      const point = this.position(particle, bounds, elapsed);
      const tail = this.position(particle, bounds, tailTime);
      const middle = this.position(particle, bounds, (elapsed + tailTime) / 2);
      const alpha = Math.pow(Math.sin(Math.PI * age / particle.life), .55) * release;
      if (alpha < .025) continue;
      if (particle.bright) {
        const size = 26 + particle.width * 8;
        context.globalAlpha = alpha;
        context.drawImage(this.glow, point.x - size / 2, point.y - size / 2, size, size);
      }
      const opacity = Math.min(7, Math.floor(alpha * 8));
      const tone = Math.min(2, Math.floor(particle.tone * 3));
      const trail = trails[((particle.bright ? 3 : 0) + tone) * 8 + opacity];
      trail.moveTo(tail.x, tail.y);
      trail.quadraticCurveTo(2 * middle.x - (tail.x + point.x) / 2, 2 * middle.y - (tail.y + point.y) / 2, point.x, point.y);
      if (particle.bright || this.motion !== 'swirl') {
        const core = cores[opacity];
        const rotation = this.motion === 'swirl' ? 0 : particle.tumble + age * particle.frequency;
        const length = this.motion === 'swirl' ? .6 : particle.width * .55;
        const dx = Math.cos(rotation) * length;
        const dy = Math.sin(rotation) * length;
        core.moveTo(point.x - dx, point.y - dy);
        core.lineTo(point.x + dx, point.y + dy);
        if (particle.glint && alpha > .5) {
          core.moveTo(point.x - 2.4, point.y);
          core.lineTo(point.x + 2.4, point.y);
          core.moveTo(point.x, point.y - 2.4);
          core.lineTo(point.x, point.y + 2.4);
        }
      }
    }
    // Batch trails by tone and opacity instead of issuing thousands of separate strokes.
    context.globalAlpha = 1;
    for (let i = 0; i < trails.length; i++) {
      const tone = (Math.floor(i / 8) % 3 + .5) / 3;
      const alpha = (i % 8 + .5) / 8;
      context.lineWidth = i >= 24 ? 1.8 : 1.1;
      context.strokeStyle = `rgba(255, ${Math.round(170 + tone * 65)}, ${Math.round(62 + tone * 94)}, ${alpha * .9})`;
      context.stroke(trails[i]);
    }
    context.lineWidth = 1.5;
    for (let i = 0; i < cores.length; i++) {
      context.strokeStyle = `rgba(255, 238, 188, ${(i + .5) / 8 * .85})`;
      context.stroke(cores[i]);
    }
    context.restore();
  }
}
