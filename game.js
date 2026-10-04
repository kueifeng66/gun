/**
 * AEROBUNCE - Modern Retro-Arcade Game Engine
 * Features:
 * - Pure Newtonian physics with frictionless energy conservation (infinite bounce)
 * - Upward-only arrow gun mechanics (+y direction)
 * - Multi-tier ball splitting (Large -> 2 Medium -> 2 Small -> disappear)
 * - Full responsive canvas scaling for desktop, tablet, and mobile
 * - Multi-touch, keyboard, and mouse controls
 * - Procedural Web Audio API sound synthesizer
 * - High-DPI Retina support and particle effects
 */

(function () {
  'use strict';

  // =========================================================
  // CONSTANTS & GAME CONFIGURATION
  // =========================================================
  const VIRTUAL_WIDTH = 1000;
  const VIRTUAL_HEIGHT = 700;
  const GROUND_Y = 640;
  const GRAVITY = 1100; // Newtonian gravitational acceleration px/s^2

  // Ball size specifications
  const BALL_CONFIG = {
    3: { // Large
      radius: 42,
      color: '#ff2a6d',
      glow: 'rgba(255, 42, 109, 0.75)',
      points: 100,
      apexMin: 100,
      apexMax: 220,
      speedMin: 120,
      speedMax: 180,
      label: 'LARGE'
    },
    2: { // Medium
      radius: 26,
      color: '#05d9e8',
      glow: 'rgba(5, 217, 232, 0.75)',
      points: 200,
      apexMin: 180,
      apexMax: 300,
      speedMin: 160,
      speedMax: 240,
      label: 'MEDIUM'
    },
    1: { // Small
      radius: 15,
      color: '#00ff87',
      glow: 'rgba(0, 255, 135, 0.75)',
      points: 400,
      apexMin: 280,
      apexMax: 400,
      speedMin: 200,
      speedMax: 290,
      label: 'SMALL'
    }
  };

  // =========================================================
  // AUDIO SYNTHESIZER (Web Audio API)
  // =========================================================
  class SoundSynth {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.initialized = false;
    }

    init() {
      if (this.initialized) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
          this.initialized = true;
        }
      } catch (e) {
        console.warn('Web Audio not supported:', e);
      }
    }

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    toggleMute() {
      this.muted = !this.muted;
      return this.muted;
    }

    playShoot() {
      if (this.muted || !this.ctx) return;
      this.resume();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.16);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.16);
    }

    playPop(tier) {
      if (this.muted || !this.ctx) return;
      this.resume();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // Pitch depends on ball size: small = high pitch, large = punchy low pitch
      const freq = tier === 1 ? 520 : tier === 2 ? 300 : 160;
      const duration = tier === 1 ? 0.12 : 0.18;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * 1.5, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.4, now + duration);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    }

    playBounce() {
      if (this.muted || !this.ctx) return;
      this.resume();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.06);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.06);
    }

    playLevelClear() {
      if (this.muted || !this.ctx) return;
      this.resume();
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      const now = this.ctx.currentTime;
      notes.forEach((freq, index) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const noteStart = now + index * 0.1;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, noteStart);

        gain.gain.setValueAtTime(0.22, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.28);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(noteStart);
        osc.stop(noteStart + 0.3);
      });
    }

    playGameOver() {
      if (this.muted || !this.ctx) return;
      this.resume();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.65);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.65);
    }
  }

  // =========================================================
  // PARTICLE SYSTEM
  // =========================================================
  class Particle {
    constructor(x, y, color, vx, vy, size, life) {
      this.x = x;
      this.y = y;
      this.color = color;
      this.vx = vx;
      this.vy = vy;
      this.size = size;
      this.maxLife = life;
      this.life = life;
    }

    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += GRAVITY * 0.35 * dt; // Subtle gravity on particles
      this.life -= dt;
      return this.life > 0;
    }

    draw(ctx) {
      const alpha = Math.max(0, this.life / this.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class ScorePopup {
    constructor(x, y, text, color) {
      this.x = x;
      this.y = y;
      this.text = text;
      this.color = color;
      this.life = 0.8;
      this.maxLife = 0.8;
    }

    update(dt) {
      this.y -= 40 * dt;
      this.life -= dt;
      return this.life > 0;
    }

    draw(ctx) {
      const alpha = Math.max(0, this.life / this.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 20px Orbitron, sans-serif';
      ctx.fillStyle = this.color;
      ctx.textAlign = 'center';
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 8;
      ctx.fillText(this.text, this.x, this.y);
      ctx.restore();
    }
  }

  // =========================================================
  // ARROW ENTITY (Shoots ONLY upward in +y direction)
  // =========================================================
  class Arrow {
    constructor(x, startY) {
      this.x = x;
      this.startY = startY;
      this.length = 76; // Length of the arrow projectile
      this.tipY = startY;
      this.tailY = startY + this.length;
      this.speed = 920; // Fast upward velocity (+y direction in physics)
      this.isAlive = true;
      this.width = 4;
      this.headSize = 15;
    }

    update(dt, particles) {
      this.tipY -= this.speed * dt;
      this.tailY = this.tipY + this.length;

      // Small trailing energy particles behind the arrow fletching
      if (Math.random() < 0.65 && particles) {
        particles.push(new Particle(
          this.x + (Math.random() * 4 - 2),
          this.tailY + Math.random() * 6,
          Math.random() < 0.5 ? '#00f2fe' : '#ffffff',
          (Math.random() - 0.5) * 30,
          40 + Math.random() * 60,
          1.5 + Math.random() * 2,
          0.22
        ));
      }

      // Reached the ceiling
      if (this.tipY <= 20) {
        this.isAlive = false;
        // Spark on ceiling hit
        if (particles) {
          for (let i = 0; i < 6; i++) {
            particles.push(new Particle(
              this.x,
              22,
              '#00f2fe',
              (Math.random() - 0.5) * 120,
              Math.random() * 60 + 20,
              2,
              0.25
            ));
          }
        }
      }
    }

    draw(ctx) {
      ctx.save();

      // Glowing vertical energy arrow shaft
      const shaftGrad = ctx.createLinearGradient(0, this.tailY, 0, this.tipY);
      shaftGrad.addColorStop(0, 'rgba(0, 242, 254, 0.1)');
      shaftGrad.addColorStop(0.3, 'rgba(0, 242, 254, 0.7)');
      shaftGrad.addColorStop(1, '#ffffff');

      ctx.strokeStyle = shaftGrad;
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#00f2fe';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(this.x, this.tailY);
      ctx.lineTo(this.x, this.tipY);
      ctx.stroke();

      // Sharp Arrowhead pointing strictly upward (+y direction)
      ctx.fillStyle = '#ff2a85';
      ctx.shadowColor = '#ff2a85';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(this.x, this.tipY - this.headSize);
      ctx.lineTo(this.x - 7, this.tipY);
      ctx.lineTo(this.x - 2, this.tipY - 3);
      ctx.lineTo(this.x, this.tipY - 1);
      ctx.lineTo(this.x + 2, this.tipY - 3);
      ctx.lineTo(this.x + 7, this.tipY);
      ctx.closePath();
      ctx.fill();

      // Fletching fins at the tail
      ctx.fillStyle = '#00f2fe';
      ctx.beginPath();
      ctx.moveTo(this.x, this.tailY - 10);
      ctx.lineTo(this.x - 6, this.tailY);
      ctx.lineTo(this.x, this.tailY - 4);
      ctx.lineTo(this.x + 6, this.tailY);
      ctx.closePath();
      ctx.fill();

      // Intense tip glow
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.x, this.tipY - this.headSize, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  // =========================================================
  // BOUNCING BALL ENTITY (Newtonian Physics & Energy Conserved)
  // =========================================================
  class Ball {
    constructor(x, y, tier, vx, customApexY = null) {
      this.tier = tier; // 3 = Large, 2 = Medium, 1 = Small
      const config = BALL_CONFIG[tier];
      this.radius = config.radius;
      this.color = config.color;
      this.glow = config.glow;
      this.points = config.points;

      this.x = x;
      this.y = y;

      // Frictionless energy conservation:
      // A ball with apex height apexY will always bounce back to apexY!
      if (customApexY !== null) {
        this.apexY = Math.max(30, Math.min(customApexY, GROUND_Y - this.radius - 60));
      } else {
        // Initial random apex height
        this.apexY = Math.max(30, Math.min(y, GROUND_Y - this.radius - 80));
      }

      this.vx = vx;
      this.vy = 0; // Initial vertical velocity is 0
    }

    update(dt, soundSynth) {
      // 1. Newtonian vertical motion under gravity
      this.vy += GRAVITY * dt;
      this.y += this.vy * dt;

      // 2. Ground collision with Frictionless Energy Conservation
      const groundContactY = GROUND_Y - this.radius;
      if (this.y >= groundContactY) {
        this.y = groundContactY;
        // Exact vertical velocity needed to reach back up to apexY:
        // v = sqrt(2 * g * h)
        const bounceHeight = Math.max(20, groundContactY - this.apexY);
        this.vy = -Math.sqrt(2 * GRAVITY * bounceHeight);
        soundSynth.playBounce();
      }

      // 3. Ceiling collision (safety clamp)
      if (this.y - this.radius <= 20) {
        this.y = 20 + this.radius;
        if (this.vy < 0) this.vy = -this.vy;
      }

      // 4. Horizontal motion and wall bounce (elastic, frictionless)
      this.x += this.vx * dt;

      if (this.x - this.radius <= 16) {
        this.x = 16 + this.radius;
        this.vx = Math.abs(this.vx);
        soundSynth.playBounce();
      } else if (this.x + this.radius >= VIRTUAL_WIDTH - 16) {
        this.x = VIRTUAL_WIDTH - 16 - this.radius;
        this.vx = -Math.abs(this.vx);
        soundSynth.playBounce();
      }
    }

    draw(ctx) {
      ctx.save();

      // Ground Drop Shadow (size & opacity depend on height above ground)
      const distAboveGround = GROUND_Y - (this.y + this.radius);
      const maxShadowHeight = GROUND_Y - this.apexY;
      const heightRatio = Math.max(0, Math.min(1, distAboveGround / maxShadowHeight));
      const shadowRadiusX = this.radius * (1.2 - heightRatio * 0.5);
      const shadowRadiusY = this.radius * 0.25 * (1 - heightRatio * 0.4);
      const shadowAlpha = 0.5 * (1 - heightRatio * 0.7);

      ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
      ctx.beginPath();
      ctx.ellipse(this.x, GROUND_Y + 2, shadowRadiusX, shadowRadiusY, 0, 0, Math.PI * 2);
      ctx.fill();

      // Ball Outer Glow
      ctx.shadowColor = this.glow;
      ctx.shadowBlur = 18;

      // Ball Sphere Radial Gradient (3D look)
      const grad = ctx.createRadialGradient(
        this.x - this.radius * 0.35,
        this.y - this.radius * 0.35,
        this.radius * 0.1,
        this.x,
        this.y,
        this.radius
      );

      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.25, this.color);
      grad.addColorStop(1, '#080c18');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();

      // Specular highlight crescent
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.beginPath();
      ctx.ellipse(
        this.x - this.radius * 0.32,
        this.y - this.radius * 0.35,
        this.radius * 0.35,
        this.radius * 0.2,
        Math.PI / 4,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.restore();
    }
  }

  // =========================================================
  // PLAYER ENTITY (Arcade Hero Person moving along X-axis, shooting upward)
  // =========================================================
  class Player {
    constructor() {
      this.width = 40;
      this.height = 62;
      this.x = VIRTUAL_WIDTH / 2;
      this.y = GROUND_Y - this.height / 2;
      this.speed = 420; // Movement speed px/s
      this.vx = 0;
      this.facing = 1; // 1 = right, -1 = left
      this.recoil = 0;
      this.moveAnimTimer = 0;
    }

    reset() {
      this.x = VIRTUAL_WIDTH / 2;
      this.y = GROUND_Y - this.height / 2;
      this.vx = 0;
      this.recoil = 0;
      this.moveAnimTimer = 0;
    }

    update(dt, input) {
      let moveDir = 0;
      if (input.left) moveDir -= 1;
      if (input.right) moveDir += 1;

      if (moveDir !== 0) {
        this.facing = moveDir;
        this.vx = moveDir * this.speed;
        this.moveAnimTimer += dt * 14;
      } else {
        this.vx = 0;
      }

      this.x += this.vx * dt;

      // Keep within arena walls
      const halfW = this.width / 2;
      if (this.x - halfW < 24) this.x = 24 + halfW;
      if (this.x + halfW > VIRTUAL_WIDTH - 24) this.x = VIRTUAL_WIDTH - 24 - halfW;

      // Recoil recovery
      if (this.recoil > 0) {
        this.recoil = Math.max(0, this.recoil - dt * 8);
      }
    }

    triggerRecoil() {
      this.recoil = 1;
    }

    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);

      // Ground shadow (drawn unscaled for symmetry)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(0, this.height / 2 + 1, 20, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Mirror horizontally based on facing direction
      ctx.scale(this.facing, 1);

      const isRunning = this.vx !== 0;
      const legSwing = isRunning ? Math.sin(this.moveAnimTimer) * 11 : 0;
      const torsoBob = isRunning ? Math.abs(Math.sin(this.moveAnimTimer)) * 2 : 0;
      const recoilOffset = this.recoil * 6;

      // -------------------------------------------------------
      // 1. BACK LEG & BOOT
      // -------------------------------------------------------
      ctx.fillStyle = '#161c2e'; // Dark combat pants
      ctx.beginPath();
      ctx.moveTo(-4, 6 - torsoBob);
      ctx.lineTo(-7 - legSwing * 0.7, 18);
      ctx.lineTo(-8 - legSwing, this.height / 2 - 4);
      ctx.lineTo(-3 - legSwing, this.height / 2 - 4);
      ctx.lineTo(-1, 6 - torsoBob);
      ctx.closePath();
      ctx.fill();

      // Back Boot
      ctx.fillStyle = '#0f1322';
      ctx.beginPath();
      ctx.roundRect(-10 - legSwing, this.height / 2 - 6, 12, 6, 2);
      ctx.fill();
      ctx.fillStyle = '#00f2fe'; // Neon cyan sole
      ctx.fillRect(-10 - legSwing, this.height / 2 - 2, 12, 2);

      // -------------------------------------------------------
      // 2. FRONT LEG & BOOT
      // -------------------------------------------------------
      ctx.fillStyle = '#1e263d'; // Front leg pants
      ctx.beginPath();
      ctx.moveTo(1, 6 - torsoBob);
      ctx.lineTo(5 + legSwing * 0.7, 18);
      ctx.lineTo(6 + legSwing, this.height / 2 - 4);
      ctx.lineTo(11 + legSwing, this.height / 2 - 4);
      ctx.lineTo(6, 6 - torsoBob);
      ctx.closePath();
      ctx.fill();

      // Front Boot
      ctx.fillStyle = '#11172a';
      ctx.beginPath();
      ctx.roundRect(4 + legSwing, this.height / 2 - 6, 13, 6, 2);
      ctx.fill();
      ctx.fillStyle = '#00f2fe'; // Neon cyan sole
      ctx.fillRect(4 + legSwing, this.height / 2 - 2, 13, 2);

      // -------------------------------------------------------
      // 3. TORSO & HERO JACKET
      // -------------------------------------------------------
      const torsoY = -12 - torsoBob;

      // Utility Belt
      ctx.fillStyle = '#2a324b';
      ctx.fillRect(-8, 3 - torsoBob, 16, 5);
      ctx.fillStyle = '#ffc107'; // Golden belt buckle
      ctx.fillRect(-2, 3 - torsoBob, 5, 5);

      // Jacket Body
      ctx.fillStyle = '#13182b';
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(0, 242, 254, 0.4)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(-9, torsoY, 18, 16, 4);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Jacket Chest Armor Plates / Stripes
      ctx.fillStyle = '#1e263e';
      ctx.fillRect(-6, torsoY + 3, 12, 9);
      ctx.fillStyle = '#00f2fe'; // Neon piping stripe
      ctx.fillRect(-5, torsoY + 4, 2, 7);
      ctx.fillRect(3, torsoY + 4, 2, 7);

      // -------------------------------------------------------
      // 4. HEAD, FACE, HAIR & BANDANA
      // -------------------------------------------------------
      const headY = -23 - torsoBob;

      // Neck
      ctx.fillStyle = '#ffd5b5';
      ctx.fillRect(-2, headY + 7, 5, 4);

      // Fluttering Bandana Tails (behind the head)
      const flutter = Math.sin(this.moveAnimTimer * 1.4) * (isRunning ? 5 : 2);
      ctx.fillStyle = '#ff2a85';
      ctx.shadowColor = '#ff2a85';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(-7, headY - 1);
      ctx.quadraticCurveTo(-14, headY - 2 + flutter, -22, headY + 3 + flutter);
      ctx.lineTo(-20, headY + 6 + flutter);
      ctx.quadraticCurveTo(-13, headY + 1 + flutter, -7, headY + 2);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      // Head Base (Face)
      ctx.fillStyle = '#ffd5b5'; // Warm skin tone
      ctx.beginPath();
      ctx.arc(0, headY, 8, 0, Math.PI * 2);
      ctx.fill();

      // Eye (Looking in facing direction)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(2, headY - 2, 4, 3);
      ctx.fillStyle = '#00f2fe'; // Cyan eye pupil
      ctx.fillRect(3.5, headY - 2, 2, 3);

      // Headband
      ctx.fillStyle = '#ff2a85';
      ctx.beginPath();
      ctx.roundRect(-8, headY - 4, 15, 4, 1);
      ctx.fill();

      // Hair (Arcade Spiky Hero Hair)
      ctx.fillStyle = '#181f33';
      ctx.beginPath();
      ctx.moveTo(-8, headY - 2);
      ctx.lineTo(-10, headY - 8);
      ctx.lineTo(-5, headY - 6);
      ctx.lineTo(-2, headY - 11);
      ctx.lineTo(2, headY - 7);
      ctx.lineTo(6, headY - 10);
      ctx.lineTo(7, headY - 4);
      ctx.lineTo(2, headY - 4);
      ctx.closePath();
      ctx.fill();

      // Hair highlight streak
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-3, headY - 9);
      ctx.lineTo(1, headY - 6);
      ctx.stroke();

      // -------------------------------------------------------
      // 5. VERTICAL ARROW GUN (Points straight up +y)
      // -------------------------------------------------------
      const gunX = 7;
      const gunY = -this.height / 2 - 12 + recoilOffset;
      const gunBottomY = 4 - torsoBob;

      // Launcher Rail / Barrel (Pointing Upward)
      ctx.fillStyle = '#00f2fe';
      ctx.shadowColor = '#00f2fe';
      ctx.shadowBlur = 10;
      ctx.fillRect(gunX - 2, gunY, 5, gunBottomY - gunY);

      // Launcher Nozzle & Crossbow Limbs at Top
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(gunX - 4, gunY, 9, 3); // Nozzle collar

      // Crossbow Wings / Emitters (angled upward/outward)
      ctx.fillStyle = '#ff2a85';
      ctx.shadowColor = '#ff2a85';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(gunX - 9, gunY + 7);
      ctx.lineTo(gunX - 3, gunY + 2);
      ctx.lineTo(gunX + 4, gunY + 2);
      ctx.lineTo(gunX + 10, gunY + 7);
      ctx.lineTo(gunX + 6, gunY + 10);
      ctx.lineTo(gunX + 1, gunY + 4);
      ctx.lineTo(gunX - 5, gunY + 10);
      ctx.closePath();
      ctx.fill();

      // Loaded Arrow Tip protruding from top
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(gunX + 0.5, gunY - 7);
      ctx.lineTo(gunX - 3, gunY);
      ctx.lineTo(gunX + 4, gunY);
      ctx.closePath();
      ctx.fill();

      // Recoil Muzzle Flash
      if (this.recoil > 0.4) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#00f2fe';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(gunX + 0.5, gunY - 6, 6 * this.recoil, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // -------------------------------------------------------
      // 6. ARMS & HANDS (Holding the Arrow Gun)
      // -------------------------------------------------------
      // Back Arm (holding lower grip)
      ctx.strokeStyle = '#1a2238';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-5, torsoY + 4);
      ctx.lineTo(gunX - 1, 0 - torsoBob);
      ctx.stroke();

      // Front Arm (holding upper barrel grip)
      ctx.strokeStyle = '#263354';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(2, torsoY + 4);
      ctx.lineTo(gunX - 1, torsoY + 2);
      ctx.stroke();

      // Gloved Hands gripping weapon
      ctx.fillStyle = '#00f2fe';
      ctx.beginPath();
      ctx.arc(gunX - 1, torsoY + 2, 2.5, 0, Math.PI * 2);
      ctx.arc(gunX - 1, 0 - torsoBob, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    getHitbox() {
      // Return capsule/circle parameters for precise fair dodging
      return {
        x: this.x,
        y: this.y,
        radius: this.width * 0.44
      };
    }
  }

  // =========================================================
  // MAIN GAME ENGINE
  // =========================================================
  class Game {
    constructor() {
      this.canvas = document.getElementById('game-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.sound = new SoundSynth();

      // Game state
      this.state = 'START'; // 'START', 'PLAYING', 'LEVEL_CLEARED', 'GAMEOVER', 'PAUSED'
      this.level = 1;
      this.score = 0;
      this.hiscore = parseInt(localStorage.getItem('aerobounce_hiscore') || '0', 10);
      this.ballsPopped = 0;
      this.levelStartScore = 0;
      this.levelStartBallsPopped = 0;

      // Entities
      this.player = new Player();
      this.balls = [];
      this.arrows = [];
      this.particles = [];
      this.popups = [];

      // Shooting configuration
      this.maxConcurrentArrows = 2; // Allows 2 active arrows on screen for fluid combat
      this.shootCooldown = 0;

      // Inputs
      this.input = {
        left: false,
        right: false,
        shoot: false
      };

      // Responsive display metrics
      this.viewportScale = 1;
      this.viewportOffsetX = 0;
      this.viewportOffsetY = 0;

      // Cache DOM Elements
      this.hudScore = document.getElementById('hud-score');
      this.hudLevel = document.getElementById('hud-level');
      this.hudBalls = document.getElementById('hud-balls');
      this.hudHiscore = document.getElementById('hud-hiscore');

      this.startModal = document.getElementById('start-modal');
      this.levelModal = document.getElementById('level-modal');
      this.gameoverModal = document.getElementById('gameover-modal');
      this.pauseModal = document.getElementById('pause-modal');

      this.clearedLevelNum = document.getElementById('cleared-level-num');
      this.levelBonusVal = document.getElementById('level-bonus-val');
      this.nextLevelBalls = document.getElementById('next-level-balls');

      this.finalScore = document.getElementById('final-score');
      this.finalHiscore = document.getElementById('final-hiscore');
      this.finalLevel = document.getElementById('final-level');
      this.finalBallsPopped = document.getElementById('final-balls-popped');

      this.btnRestart = document.getElementById('btn-restart');
      this.btnSound = document.getElementById('btn-sound');
      this.btnPause = document.getElementById('btn-pause');

      // Bind events
      this.initEvents();
      this.resize();

      // Update HUD
      this.hudHiscore.textContent = this.hiscore.toLocaleString();

      // Start game animation loop
      this.lastTime = performance.now();
      requestAnimationFrame(this.loop.bind(this));
    }

    // =========================================================
    // EVENT HANDLING & INPUTS
    // =========================================================
    initEvents() {
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 150));

      // Keyboard Controls
      window.addEventListener('keydown', (e) => {
        this.sound.init();
		
		if (e.code === 'Enter' && this.state === 'GAMEOVER') {
				this.gameoverModal.classList.remove('active');
				this.startLevel(this.level, true);
				e.preventDefault();
			return;
		}

		if (e.code === 'Enter' && this.state === 'LEVEL_CLEARED') {
				this.levelModal.classList.remove('active');
				this.startLevel(this.level + 1);
				e.preventDefault();
			return;
		}
		
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          this.input.left = true;
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          this.input.right = true;
        } else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
          this.input.shoot = true;
          this.tryShoot();
          e.preventDefault();
        } else if (e.code === 'KeyP' || e.code === 'Escape') {
          this.togglePause();
        }
      });

      window.addEventListener('keyup', (e) => {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          this.input.left = false;
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          this.input.right = false;
        } else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
          this.input.shoot = false;
        }
      });

      // Touch Buttons
      const btnLeft = document.getElementById('btn-left');
      const btnRight = document.getElementById('btn-right');
      const btnShoot = document.getElementById('btn-shoot');

      const setupTouchBtn = (el, onStart, onEnd) => {
        const startHandler = (e) => {
          e.preventDefault();
          this.sound.init();
          el.classList.add('active');
          onStart();
        };
        const endHandler = (e) => {
          e.preventDefault();
          el.classList.remove('active');
          onEnd();
        };
        el.addEventListener('pointerdown', startHandler);
        el.addEventListener('pointerup', endHandler);
        el.addEventListener('pointercancel', endHandler);
        el.addEventListener('pointerleave', endHandler);
      };

      setupTouchBtn(btnLeft, () => { this.input.left = true; }, () => { this.input.left = false; });
      setupTouchBtn(btnRight, () => { this.input.right = true; }, () => { this.input.right = false; });
      setupTouchBtn(btnShoot, () => {
        this.input.shoot = true;
        this.tryShoot();
      }, () => {
        this.input.shoot = false;
      });

      // Canvas Direct Touch / Drag Support
      let isPointerMoving = false;
      this.canvas.addEventListener('pointerdown', (e) => {
        this.sound.init();
        if (this.state !== 'PLAYING') return;

        const worldPos = this.screenToWorld(e.clientX, e.clientY);
        // If clicking/tapping upper area, fire!
        if (worldPos.y < GROUND_Y - 90) {
          this.tryShoot();
        } else {
          // If touching near the ground, move player toward touch position
          isPointerMoving = true;
          this.updatePointerMove(worldPos.x);
        }
      });

      this.canvas.addEventListener('pointermove', (e) => {
        if (isPointerMoving && this.state === 'PLAYING') {
          const worldPos = this.screenToWorld(e.clientX, e.clientY);
          this.updatePointerMove(worldPos.x);
        }
      });

      const stopPointer = () => {
        if (isPointerMoving) {
          isPointerMoving = false;
          this.input.left = false;
          this.input.right = false;
        }
      };
      this.canvas.addEventListener('pointerup', stopPointer);
      this.canvas.addEventListener('pointercancel', stopPointer);

      // UI Buttons
      document.getElementById('btn-start').addEventListener('click', () => {
        this.sound.init();
        this.startModal.classList.remove('active');
        this.score = 0;
        this.ballsPopped = 0;
        this.startLevel(1);
      });

      document.getElementById('btn-next-level').addEventListener('click', () => {
        this.sound.init();
        this.levelModal.classList.remove('active');
        this.startLevel(this.level + 1);
      });

      this.btnRestart.addEventListener('click', () => {
        this.sound.init();
        this.gameoverModal.classList.remove('active');
        this.startLevel(this.level, true);
      });

      document.getElementById('btn-resume').addEventListener('click', () => {
        this.togglePause();
      });

      this.btnPause.addEventListener('click', () => {
        this.togglePause();
      });

      this.btnSound.addEventListener('click', () => {
        this.sound.init();
        const muted = this.sound.toggleMute();
        this.btnSound.textContent = muted ? '🔇' : '🔊';
      });
    }

    updatePointerMove(targetWorldX) {
      const diff = targetWorldX - this.player.x;
      if (Math.abs(diff) > 16) {
        this.input.left = diff < 0;
        this.input.right = diff > 0;
      } else {
        this.input.left = false;
        this.input.right = false;
      }
    }

    screenToWorld(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const x = (clientX - rect.left - this.viewportOffsetX) / this.viewportScale;
      const y = (clientY - rect.top - this.viewportOffsetY) / this.viewportScale;
      return { x, y };
    }

    // =========================================================
    // RESPONSIVE VIEWPORT RESIZING
    // =========================================================
    resize() {
      const container = document.getElementById('canvas-container');
      const w = container.clientWidth;
      const h = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;

      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';

      // Calculate scale to fit VIRTUAL_WIDTH x VIRTUAL_HEIGHT with aspect ratio preserved
      const scaleX = w / VIRTUAL_WIDTH;
      const scaleY = h / VIRTUAL_HEIGHT;
      this.viewportScale = Math.min(scaleX, scaleY);

      this.viewportOffsetX = (w - VIRTUAL_WIDTH * this.viewportScale) / 2;
      this.viewportOffsetY = (h - VIRTUAL_HEIGHT * this.viewportScale) / 2;
    }

    // =========================================================
    // LEVEL SETUP & INITIALIZATION
    // =========================================================
    startLevel(levelNum, isRetry = false) {
      this.level = levelNum;
      this.state = 'PLAYING';

      if (!isRetry) {
        this.levelStartScore = this.score;
        this.levelStartBallsPopped = this.ballsPopped;
      } else {
        this.score = this.levelStartScore;
        this.ballsPopped = this.levelStartBallsPopped;
      }

      this.input.left = false;
      this.input.right = false;
      this.input.shoot = false;
      this.shootCooldown = 0;

      this.player.reset();
      this.arrows = [];
      this.particles = [];
      this.popups = [];
      this.balls = [];

      // The game starts with 2 balls, and the number of balls increases with each level cleared.
      const initialBallCount = this.level;

      // Spawn initial balls
      for (let i = 0; i < initialBallCount; i++) {
        this.spawnInitialBall(i, initialBallCount);
      }

      this.updateHUD();
    }

    spawnInitialBall(index, total) {
      // Random starting height (initial vertical velocity is 0)
      // Height between 100px and 260px from the top
      const startY = 110 + Math.random() * 150;

      // Evenly distribute horizontal spawn positions across the arena
      const segmentWidth = (VIRTUAL_WIDTH - 200) / total;
      const startX = 100 + segmentWidth * (index + 0.5) + (Math.random() * 40 - 20);

      // Random direction (-1 or +1)
      const dir = Math.random() < 0.5 ? -1 : 1;

      // Random horizontal speed
      const baseSpeed = 130 + Math.random() * 60;
      const vx = dir * baseSpeed;

      // Game starts with tier 3 (Large) balls
      this.balls.push(new Ball(startX, startY, 3, vx, startY));
    }

    // =========================================================
    // SHOOTING & COMBAT LOGIC
    // =========================================================
    tryShoot() {
      if (this.state !== 'PLAYING') return;
      if (this.shootCooldown > 0) return;
      if (this.arrows.length >= this.maxConcurrentArrows) return;

      // Spawn arrow at player weapon muzzle, pointing straight up
      const arrowX = this.player.x + this.player.facing * 7;
      const arrowY = this.player.y - this.player.height / 2 - 12;

      this.arrows.push(new Arrow(arrowX, arrowY));
      this.player.triggerRecoil();
      this.sound.playShoot();
      this.shootCooldown = 0.22; // Quick cooldown to prevent accidental doubles
    }

    // =========================================================
    // BALL SPLITTING & POPPING
    // =========================================================
    splitBall(ball, arrowX, arrowY) {
      const tier = ball.tier;
      this.ballsPopped++;
      this.sound.playPop(tier);

      // Add score and floating score popup
      this.score += ball.points;
      this.popups.push(new ScorePopup(ball.x, ball.y, `+${ball.points}`, ball.color));

      // Visual particle explosion
      this.createPopParticles(ball.x, ball.y, ball.color, tier);

      // Split mechanics:
      // Large (3) -> 2 Medium (2)
      // Medium (2) -> 2 Small (1)
      // Small (1) -> disappears
      if (tier > 1) {
        const nextTier = tier - 1;
        const config = BALL_CONFIG[nextTier];

        // "immediately splits into 2 smaller balls that separate left and right
        // from the point of impact and fall toward the ground."
        const speed = config.speedMin + Math.random() * (config.speedMax - config.speedMin);

        // Apex height for child balls ensures balanced bouncy gameplay
        const childApex = nextTier === 2
          ? Math.min(ball.y, 220 + Math.random() * 60)
          : Math.min(ball.y, 300 + Math.random() * 60);

        // Left child ball (falls toward ground with vx < 0)
        const leftBall = new Ball(ball.x - 8, ball.y, nextTier, -Math.abs(speed), childApex);
        leftBall.vy = 20; // Falling toward ground!

        // Right child ball (falls toward ground with vx > 0)
        const rightBall = new Ball(ball.x + 8, ball.y, nextTier, Math.abs(speed), childApex);
        rightBall.vy = 20; // Falling toward ground!

        this.balls.push(leftBall, rightBall);
      }

      this.updateHUD();

      // Check level clear win condition
      if (this.balls.length === 0) {
        this.triggerLevelClear();
      }
    }

    createPopParticles(x, y, color, tier) {
      const count = tier === 3 ? 30 : tier === 2 ? 22 : 14;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 120 + Math.random() * 260;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const size = 2 + Math.random() * 4;
        const life = 0.4 + Math.random() * 0.4;
        this.particles.push(new Particle(x, y, color, vx, vy, size, life));
      }
    }

    // =========================================================
    // WIN & LOSE CONDITIONS
    // =========================================================
    triggerLevelClear() {
      this.state = 'LEVEL_CLEARED';
      this.sound.playLevelClear();

      const clearBonus = this.level * 1000;
      this.score += clearBonus;
      this.updateHUD();

      // Update Level Modal
      this.clearedLevelNum.textContent = this.level;
      this.levelBonusVal.textContent = `+${clearBonus.toLocaleString()}`;
      this.nextLevelBalls.textContent = this.level + 2; // Next level starts with (level + 1) + 1 balls

      setTimeout(() => {
        this.levelModal.classList.add('active');
      }, 400);
    }

    triggerGameOver() {
      this.state = 'GAMEOVER';
      this.sound.playGameOver();

      // Update High Score
      if (this.score > this.hiscore) {
        this.hiscore = this.score;
        localStorage.setItem('aerobounce_hiscore', this.hiscore.toString());
      }

      // Death explosion at player
      for (let i = 0; i < 45; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 100 + Math.random() * 320;
        this.particles.push(new Particle(
          this.player.x,
          this.player.y,
          Math.random() < 0.5 ? '#ff2a85' : '#00f2fe',
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          3 + Math.random() * 4,
          0.6 + Math.random() * 0.5
        ));
      }

      // Update Game Over Modal
      this.finalScore.textContent = this.score.toLocaleString();
      this.finalHiscore.textContent = this.hiscore.toLocaleString();
      this.finalLevel.textContent = this.level;
      this.finalBallsPopped.textContent = this.ballsPopped;

      if (this.btnRestart) {
        this.btnRestart.textContent = `RETRY LEVEL ${this.level} ↺`;
      }

      setTimeout(() => {
        this.gameoverModal.classList.add('active');
      }, 500);
    }

    togglePause() {
      if (this.state === 'PLAYING') {
        this.state = 'PAUSED';
        this.pauseModal.classList.add('active');
        this.btnPause.textContent = '▶';
      } else if (this.state === 'PAUSED') {
        this.state = 'PLAYING';
        this.pauseModal.classList.remove('active');
        this.btnPause.textContent = '⏸';
      }
    }

    updateHUD() {
      this.hudScore.textContent = this.score.toLocaleString();
      this.hudLevel.textContent = this.level;
      this.hudBalls.textContent = this.balls.length;
      this.hudHiscore.textContent = Math.max(this.score, this.hiscore).toLocaleString();
    }

    // =========================================================
    // GAME LOOP & PHYSICS UPDATE
    // =========================================================
    loop(currentTime) {
      let dt = (currentTime - this.lastTime) / 1000;
      this.lastTime = currentTime;

      // Clamp large delta times (e.g. background tab or frame drops)
      if (dt > 0.05) dt = 0.05;

      if (this.state === 'PLAYING') {
        this.update(dt);
      }

      this.render();

      requestAnimationFrame(this.loop.bind(this));
    }

    update(dt) {
      // Cooldown timer
      if (this.shootCooldown > 0) {
        this.shootCooldown -= dt;
      }

      // Update Player
      this.player.update(dt, this.input);

      // Update Arrows
      for (let i = this.arrows.length - 1; i >= 0; i--) {
        const arrow = this.arrows[i];
        arrow.update(dt, this.particles);
        if (!arrow.isAlive) {
          this.arrows.splice(i, 1);
        }
      }

      // Update Balls & Collision
      const playerHitbox = this.player.getHitbox();

      for (let i = this.balls.length - 1; i >= 0; i--) {
        const ball = this.balls[i];
        ball.update(dt, this.sound);

        // 1. Check Collision: Ball vs Player (Instant Defeat)
        const dx = ball.x - playerHitbox.x;
        const dy = ball.y - playerHitbox.y;
        const distSq = dx * dx + dy * dy;
        const hitDist = ball.radius + playerHitbox.radius;

        if (distSq <= hitDist * hitDist) {
          this.triggerGameOver();
          return;
        }

        // 2. Check Collision: Ball vs Arrows (Exact segment to circle)
        for (let j = this.arrows.length - 1; j >= 0; j--) {
          const arrow = this.arrows[j];
          const closestY = Math.max(arrow.tipY - arrow.headSize, Math.min(ball.y, arrow.tailY));
          const adx = ball.x - arrow.x;
          const ady = ball.y - closestY;
          const hitRadius = ball.radius + arrow.width * 1.5;

          if (adx * adx + ady * ady <= hitRadius * hitRadius) {
            // Ball Hit! Split ball and remove arrow
            this.arrows.splice(j, 1);
            this.balls.splice(i, 1);
            this.splitBall(ball, arrow.x, ball.y);
            break;
          }
        }
      }

      // Update Particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        if (!this.particles[i].update(dt)) {
          this.particles.splice(i, 1);
        }
      }

      // Update Popups
      for (let i = this.popups.length - 1; i >= 0; i--) {
        if (!this.popups[i].update(dt)) {
          this.popups.splice(i, 1);
        }
      }
    }

    // =========================================================
    // RENDERING
    // =========================================================
    render() {
      const ctx = this.ctx;
      const dpr = window.devicePixelRatio || 1;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // Apply device pixel ratio and centered viewport scale
      ctx.scale(dpr, dpr);
      ctx.translate(this.viewportOffsetX, this.viewportOffsetY);
      ctx.scale(this.viewportScale, this.viewportScale);

      // Draw Arena Background & Futuristic Grid
      this.drawArena(ctx);

      // Draw Arrows
      this.arrows.forEach(arrow => arrow.draw(ctx));

      // Draw Balls
      this.balls.forEach(ball => ball.draw(ctx));

      // Draw Player (if alive)
      if (this.state !== 'GAMEOVER') {
        this.player.draw(ctx);
      }

      // Draw Particles
      this.particles.forEach(p => p.draw(ctx));

      // Draw Floating Popups
      this.popups.forEach(popup => popup.draw(ctx));

      ctx.restore();
    }

    drawArena(ctx) {
      // Arena bounds: 0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT
      // Ground plane gradient
      const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, VIRTUAL_HEIGHT);
      groundGrad.addColorStop(0, '#151b36');
      groundGrad.addColorStop(1, '#0b0d1a');

      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, GROUND_Y, VIRTUAL_WIDTH, VIRTUAL_HEIGHT - GROUND_Y);

      // Glowing Ground Line
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#00f2fe';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(VIRTUAL_WIDTH, GROUND_Y);
      ctx.stroke();

      // Ground Perspective Grid Lines
      ctx.strokeStyle = 'rgba(0, 242, 254, 0.15)';
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;

      for (let x = 0; x <= VIRTUAL_WIDTH; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y);
        ctx.lineTo(x + (x - VIRTUAL_WIDTH / 2) * 0.35, VIRTUAL_HEIGHT);
        ctx.stroke();
      }

      for (let y = GROUND_Y + 18; y < VIRTUAL_HEIGHT; y += 22) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(VIRTUAL_WIDTH, y);
        ctx.stroke();
      }

      // Side Wall Borders
      ctx.strokeStyle = 'rgba(255, 42, 133, 0.4)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ff2a85';
      ctx.shadowBlur = 8;

      // Left Wall
      ctx.beginPath();
      ctx.moveTo(16, 16);
      ctx.lineTo(16, GROUND_Y);
      ctx.stroke();

      // Right Wall
      ctx.beginPath();
      ctx.moveTo(VIRTUAL_WIDTH - 16, 16);
      ctx.lineTo(VIRTUAL_WIDTH - 16, GROUND_Y);
      ctx.stroke();

      // Ceiling line
      ctx.strokeStyle = 'rgba(0, 242, 254, 0.25)';
      ctx.beginPath();
      ctx.moveTo(16, 16);
      ctx.lineTo(VIRTUAL_WIDTH - 16, 16);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  // Launch game once DOM is loaded
  window.addEventListener('DOMContentLoaded', () => {
    window.gameInstance = new Game();
  });
})();
