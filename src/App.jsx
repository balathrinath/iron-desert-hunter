import React, { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';

// --- WEB AUDIO API ENGINE ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
const actx = new AudioContext();

const playSound = (type) => {
  if (actx.state === 'suspended') actx.resume();
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.connect(gain);
  gain.connect(actx.destination);
  const now = actx.currentTime;
  
  if (type === 'shoot') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(10, now + 0.1);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
  } else if (type === 'hit') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.setValueAtTime(800, now + 0.05);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.15);
    osc.start(now); osc.stop(now + 0.15);
  } else if (type === 'miss') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.linearRampToValueAtTime(50, now + 0.3);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);
    osc.start(now); osc.stop(now + 0.3);
  } else if (type === 'round_start') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.setValueAtTime(400, now + 0.1);
    osc.frequency.setValueAtTime(500, now + 0.2);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.4);
    osc.start(now); osc.stop(now + 0.4);
  } else if (type === 'laugh') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(150, now + 0.2);
    osc.frequency.setValueAtTime(280, now + 0.25);
    osc.frequency.linearRampToValueAtTime(130, now + 0.45);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.6);
    osc.start(now); osc.stop(now + 0.6);
  }
};

// --- SPRITES ---
const CELL = 3;
// Iron Man flying sideways — slim build, 8 cols wide
const ACROBAT_SWING = [
  "..GGGG..",   // helmet gold top
  ".RRGGRR.",   // helmet sides + gold visor
  ".RGWGRR.",   // visor with white eye
  "..RRRR..",   // neck/chin
  ".RYRYRR.",   // chest arc reactor
  "GRYWYRG.",   // torso gold shoulders + reactor
  ".RRRRRR.",   // hip
  ".RRRRRR.",   // upper legs
  ".GRRRRG.",   // knee gold
  "..RR.RR."    // boots
];

// Iron Man standing (mascot) — slimmer front view
const VIGILANTE_STAND = [
  "....GGGG....",
  "...RRGGRR...",
  "...RGWGRR...",
  "...RRRRRR...",
  "..RRYWYRR...",
  ".GRRYYYYRRG.",
  ".GRRYYYYRRG.",
  "..RRRRRRRR..",
  "...RRRRRR...",
  "...GRRRRG..."
];

const DRONE_SPRITE = [
  "..K......K..",
  ".K.KKKKKK.K.",
  "K..KRRRRK..K",
  "KKKKRWWKKKKK",
  "...KKKKKK..."
];

const PALETTES = {
  acrobat:   { R: '#c0392b', G: '#d4a017', W: '#a8e6ff', Y: '#f1c40f' },
  vigilante: { R: '#c0392b', G: '#d4a017', W: '#a8e6ff', Y: '#f1c40f' },
  drone:     { K: '#222222', R: '#ff3333', W: '#ffff00' }
};

const drawGrid = (ctx, x, y, grid, palette, flip=false, scale=1) => {
  const H = grid.length, W = grid[0].length;
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.translate(-(W*CELL*scale)/2, -(H*CELL*scale)/2); 
  for (let r=0; r<H; r++) {
    for (let c=0; c<W; c++) {
      const ch = grid[r][c];
      if (ch !== '.') {
        ctx.fillStyle = palette[ch];
        ctx.fillRect(c*CELL*scale, r*CELL*scale, CELL*scale, CELL*scale);
      }
    }
  }
  ctx.restore();
};

const MISS_TAUNTS = [
  "CANT YOU DO IT MAN?",
  "A 3 YEAR OLD COULD HAVE PLAYED BETTER!",
  "STORMTRUPER AIM!",
  "WAS THAT A WARNING SHOT?",
  "IS YOUR MOUSE BROKEN?",
  "OPEN YOUR EYES, MAN!",
  "EVEN JARVIS COULD AIM BETTER!",
  "MY GRANDMA AIMS BETTER!",
  "ARE YOU PLAYING WITH YOUR FEET?",
  "WAKE UP, HERO!",
  "I'VE SEEN BETTER AIM FROM A TOASTER.",
  "YOU'RE SHOOTING BLANKS!",
  "PACIFIST RUN?",
  "YOU CALL THAT A REPULSOR BLAST?"
];

const GAME_OVER_TAUNTS = [
  "IRON MAN FLEW AWAY AND YOU COULDN'T STOP HIM!",
  "WITH GREAT TECH COMES TERRIBLE AIM.",
  "THE REAL PUNISHMENT IS YOUR SCORE.",
  "STARK: 1, YOU: 0.",
  "DONT QUIT YOUR DAY JOB.",
  "THE DESERT IS DOOMED THANKS TO YOU.",
  "BACK TO TRAINING WHEELS FOR YOU.",
  "MAYBE TRY MINESWEEPER INSTEAD?",
  "EVEN PEPPER POTTS IS DISAPPOINTED.",
  "YOU LET HIM GET AWAY! THE INFINITY STONES ARE STILL OUT THERE!"
];

// --- GAME LOGIC ENGINE ---
class GameEngine {
  constructor(canvas, updateReactState) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.updateReactState = updateReactState;
    
    // Internal logical resolution (16:9)
    this.W = 800; this.H = 450;
    this.canvas.width = this.W; this.canvas.height = this.H;
    
    this.state = 'MENU'; 
    this.mode = 1; // 1=EASY, 2=MEDIUM, 3=HARD
    
    this.score = 0;
    this.hiScore = parseInt(localStorage.getItem('retroweb_hi')) || 0;
    this.round = 1;
    this.ammo = 5;
    this.maxAmmo = 5;
    
    this.targets = [];
    this.particles = [];
    this.floatingTexts = []; 
    this.history = new Array(10).fill('empty');
    this.targetsSpawned = 0;
    this.shotsFired = 0;
    this.currentCombo = 0; 
    this.gameOverTaunt = "";
    
    this.mascot = { active: false, y: this.H, type: 'laugh', timer: 0 };
    
    this.lastTime = performance.now();
    this.reqId = requestAnimationFrame((t) => this.loop(t));
  }

  startGame(mode) {
    this.mode = mode;
    this.score = 0;
    this.round = 1;
    this.currentCombo = 0;
    this.gameOverTaunt = "";
    
    // Determine Max Ammo based on Difficulty Level
    if (this.mode === 1) this.maxAmmo = 5; // Easy
    else if (this.mode === 2) this.maxAmmo = 4; // Medium
    else this.maxAmmo = 3; // Hard
    
    this.startRound();
  }

  startRound() {
    this.history = new Array(10).fill('empty');
    this.targetsSpawned = 0;
    this.targets = [];
    this.particles = [];
    this.floatingTexts = [];
    this.state = 'ROUND_START';
    this.syncState();
    playSound('round_start');
    
    setTimeout(() => {
      if (this.state === 'ROUND_START') {
        this.state = 'PLAYING';
        this.spawnWave();
      }
    }, 1500);
  }

  spawnWave() {
    this.ammo = this.maxAmmo;
    this.targets = [];
    
    // Targets per wave based on Difficulty Level
    let count = 1;
    if (this.mode === 2) count = 2; // Medium: 2 acrobats
    if (this.mode === 3) count = 2; // Hard: acrobat + drone mix
    
    for (let i=0; i<count; i++) {
      if (this.mode === 3 && i === 1) {
        this.targets.push(this.createDrone());
      } else {
        this.targets.push(this.createAcrobat());
      }
    }
    this.targetsSpawned += count;
    this.syncState();
  }

  // --- ENTITY CREATION ---
  createAcrobat() {
    let speed = 120 + (this.round * 12);
    if (this.mode === 2) speed = 150 + (this.round * 15);
    if (this.mode === 3) speed = 190 + (this.round * 20);

    // Start somewhere in the upper two-thirds of the play area (above the pyramids)
    const margin = 60;
    const startX = margin + Math.random() * (this.W - margin * 2);
    const startY = margin + Math.random() * (this.H * 0.55);

    // Random direction — always moving both horizontally AND vertically
    const angle = (Math.random() * Math.PI * 0.5) + Math.PI * 0.1; // 18°–108°
    const quadrant = Math.floor(Math.random() * 4);
    const signX = quadrant < 2 ? 1 : -1;
    const signY = quadrant % 2 === 0 ? 1 : -1;

    return {
      type: 'acrobat',
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed * signX,
      vy: Math.sin(angle) * speed * signY,
      dead: false,
      escaped: false,
      escapeTimer: 0,
      speedGlitched: false,
      freezeTimer: 0,
      freezeCount: 0,
      // Only time-escape after a generous window — no off-screen escape
      maxTime: this.mode === 1 ? 10.0 : this.mode === 2 ? 8.0 : 6.0
    };
  }

  createDrone() {
    let speedMult = 1.0 + (this.round * 0.1);
    const dir = Math.random() > 0.5 ? 1 : -1;
    return {
      type: 'drone',
      x: dir === 1 ? -40 : this.W + 40,
      y: this.H * 0.5 + (Math.random() * 120 - 60), 
      vx: (160 + Math.random() * 60) * speedMult * dir,
      vy: (-20 - Math.random() * 30) * speedMult,
      scale: 2.5,
      dead: false,
      escaped: false,
      escapeTimer: 0,
      speedGlitched: false,
      freezeTimer: 0,
      freezeCount: 0,
      maxTime: Math.max(1.5, 3.5 - (this.round * 0.15))
    };
  }

  // --- INPUT ---
  shoot(x, y) {
    if (this.state !== 'PLAYING') return;
    if (this.ammo <= 0) return;
    
    this.ammo--;
    this.shotsFired++;
    playSound('shoot');
    
    const flashEl = document.getElementById('screen-flash');
    if (flashEl) {
      flashEl.style.opacity = '0.4';
      setTimeout(() => flashEl.style.opacity = '0', 50);
    }

    let hitAnything = false;

    // Difficulty based hit boxes
    let radiusMult = 1.0;
    if (this.mode === 1) radiusMult = 1.5; // Huge hit boxes for Easy
    if (this.mode === 3) radiusMult = 0.8; // Small hit boxes for Hard

    for (let i = this.targets.length - 1; i >= 0; i--) {
      const t = this.targets[i];
      if (t.dead || t.escaped) continue;
      
      const baseRadius = t.type === 'drone' ? 24 * t.scale : 32; 
      const radius = baseRadius * radiusMult;
      const dist = Math.hypot(t.x - x, t.y - y);
      
      if (dist < radius) {
        t.dead = true;
        hitAnything = true;
        this.currentCombo++;
        playSound('hit');
        
        const basePts = (t.type === 'drone' ? 1000 : 500) + (this.round * 100);
        const comboMult = this.currentCombo > 1 ? this.currentCombo : 1;
        const totalPts = basePts * comboMult;
        
        this.score += totalPts;
        if (this.score > this.hiScore) {
          this.hiScore = this.score;
          localStorage.setItem('retroweb_hi', this.hiScore);
        }
        
        this.floatingTexts.push({ x: t.x, y: t.y - 30, text: `+${totalPts}`, color: '#f1c40f', life: 1.2, isTaunt: false });
        if (this.currentCombo > 1) {
            this.floatingTexts.push({ x: t.x, y: t.y - 50, text: `${this.currentCombo}X COMBO!`, color: '#e23636', life: 1.5, isTaunt: false });
        }

        this.spawnExplosion(t.x, t.y, t.type === 'drone' ? '#ff3333' : '#e23636');
        
        const idx = this.targetsSpawned - this.targets.length + i;
        if (idx < 10) this.history[idx] = 'hit';
        break; 
      }
    }

    if (!hitAnything) {
        playSound('miss');
        this.currentCombo = 0; 
        
        // Clear previous taunts to prevent unreadable overlaps
        this.floatingTexts = this.floatingTexts.filter(ft => !ft.isTaunt);
        const taunt = MISS_TAUNTS[Math.floor(Math.random() * MISS_TAUNTS.length)];
        
        // Spawn taunt in the upper center of the screen
        this.floatingTexts.push({
          x: this.W / 2, y: this.H / 3, text: taunt, color: '#ff6b6b', life: 2.5, isTaunt: true
        });
    }
    
    this.checkWaveEnd();
    this.syncState();
  }

  checkWaveEnd() {
    const allDead = this.targets.every(t => t.dead);
    const allEscaped = this.targets.every(t => t.escaped || t.dead);
    
    if ((this.ammo === 0 && allEscaped) || allEscaped || allDead) {
      setTimeout(() => this.endWave(), 600);
    }
  }

  endWave() {
    if (this.state !== 'PLAYING') return;
    
    let caughtCount = this.targets.filter(t => t.dead).length;
    
    if (this.targets.length > 0 && this.targets.some(t => t.escaped && !t.dead)) {
       this.currentCombo = 0; 
       this.targets.forEach((t, i) => {
         if (t.escaped && !t.dead) {
           const idx = this.targetsSpawned - this.targets.length + i;
           if (idx < 10) this.history[idx] = 'miss';
         }
       });
    }

    this.state = 'END_ANIM';
    this.mascot.active = true;
    this.mascot.y = this.H;
    this.mascot.timer = 0;
    
    if (caughtCount > 0) {
      this.mascot.type = 'stand';
    } else {
      this.mascot.type = 'laugh';
      playSound('laugh');
    }
    this.syncState();
  }

  spawnExplosion(x, y, color) {
    for(let i=0; i<30; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random()-0.5)*350,
        vy: (Math.random()-0.5)*350,
        life: 1.0,
        color: Math.random()>0.5 ? color : '#ffffff'
      });
    }
  }

  // --- LOOP & RENDERING ---
  loop(now) {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    
    this.update(dt);
    this.draw();
    
    this.reqId = requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    if (this.state === 'PLAYING') {
      let activeCount = 0;
      
      this.targets.forEach(t => {
        if (t.dead) {
          t.y += 500 * dt; 
          return;
        }
        if (t.escaped) return;
        
        t.escapeTimer += dt;
        // Acrobats bounce — only escape via maxTime, never by leaving screen
        if (t.type === 'acrobat') {
          if (t.escapeTimer > t.maxTime) {
            t.escaped = true;
            this.checkWaveEnd();
          }
        } else {
          if (t.escapeTimer > t.maxTime || t.x < -150 || t.x > this.W + 150 || t.y < -150) {
            t.escaped = true;
            this.checkWaveEnd();
          }
        }

        // Smooth speed scaling — no sudden mid-flight acceleration
        if (!t.speedGlitched && t.escapeTimer > 1.0) {
          t.speedGlitched = true;
        }

        // Freeze removed — targets move smoothly without pausing

        if (t.type === 'acrobat') {
          // Bounce off left/right walls
          const marginX = 30;
          if (t.x <= marginX && t.vx < 0)        t.vx *= -1;
          if (t.x >= this.W - marginX && t.vx > 0) t.vx *= -1;

          // Bounce off top and above-pyramid ceiling
          const ceilY  = 30;
          const floorY = this.H - 95; // stay above the sand/pyramid base
          if (t.y <= ceilY  && t.vy < 0) t.vy *= -1;
          if (t.y >= floorY && t.vy > 0) t.vy *= -1;

          t.x += t.vx * dt;
          t.y += t.vy * dt;

          // Clamp so he can never clip fully off screen
          t.x = Math.max(marginX, Math.min(this.W - marginX, t.x));
          t.y = Math.max(ceilY,   Math.min(floorY, t.y));
        } else if (t.type === 'drone') {
          t.x += t.vx * dt;
          t.y += t.vy * dt;
          t.scale = Math.max(0.5, t.scale - 0.5 * dt);
        }
        activeCount++;
      });
      
      if (this.ammo === 0 && activeCount > 0) {
        // Speed up the escape clock when ammo is empty
        this.targets.forEach(t => { if (!t.dead) t.escapeTimer += dt * 3; });
      }
    }

    if (this.state === 'END_ANIM') {
      this.mascot.timer += dt;
      if (this.mascot.timer < 0.5) this.mascot.y -= 150 * dt; 
      else if (this.mascot.timer > 2.0) this.mascot.y += 150 * dt; 
      
      if (this.mascot.timer > 2.5) {
        this.mascot.active = false;
        if (this.targetsSpawned >= 10) this.checkRoundClear();
        else { this.state = 'PLAYING'; this.spawnWave(); }
      }
    }

    this.particles.forEach(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 1.5;
    });
    this.particles = this.particles.filter(p => p.life > 0);

    this.floatingTexts.forEach(ft => {
      ft.y -= (ft.isTaunt ? 5 : 45) * dt;
      ft.life -= dt;
    });
    this.floatingTexts = this.floatingTexts.filter(ft => ft.life > 0);
  }

  checkRoundClear() {
    const hits = this.history.filter(h => h === 'hit').length;
    // Progression requirements scaled by difficulty
    let required = 5 + Math.floor(this.round / 2);
    if (this.mode === 1) required -= 1; // Easier to pass on easy mode
    required = Math.min(required, 10);
    
    if (hits >= required) {
      this.round++;
      this.startRound();
    } else {
      this.state = 'GAME_OVER';
      this.gameOverTaunt = GAME_OVER_TAUNTS[Math.floor(Math.random() * GAME_OVER_TAUNTS.length)];
      this.syncState();
    }
  }

  draw() {
    const ctx = this.ctx;

    // ── PYRAMID DESERT BACKGROUND ──────────────────────────────────────────

    // Sky: bright sunny day gradient — vivid blue top to warm golden horizon
    const skyGrad = ctx.createLinearGradient(0, 0, 0, this.H);
    skyGrad.addColorStop(0,   '#0a6ebd');   // deep sky blue top
    skyGrad.addColorStop(0.5, '#3aaee0');   // bright mid blue
    skyGrad.addColorStop(0.85,'#f7c96e');   // warm golden horizon glow
    skyGrad.addColorStop(1,   '#f0a500');   // rich amber at ground
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, this.W, this.H);

    // Sun glow halo (drawn first so rays go behind the disc)
    const sunX = 120, sunY = 70, sunR = 34;
    const halo = ctx.createRadialGradient(sunX, sunY, sunR * 0.5, sunX, sunY, sunR * 4);
    halo.addColorStop(0,   'rgba(255, 240, 100, 0.55)');
    halo.addColorStop(0.4, 'rgba(255, 200, 50,  0.25)');
    halo.addColorStop(1,   'rgba(255, 180, 0,   0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 4, 0, Math.PI * 2);
    ctx.fill();

    // Sun rays
    ctx.strokeStyle = 'rgba(255, 230, 80, 0.45)';
    for (let r = 0; r < 12; r++) {
      const angle = (r / 12) * Math.PI * 2;
      const inner = sunR + 6;
      const outer = sunR + 28 + (r % 2 === 0 ? 10 : 0);
      ctx.lineWidth = r % 2 === 0 ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(sunX + Math.cos(angle) * inner, sunY + Math.sin(angle) * inner);
      ctx.lineTo(sunX + Math.cos(angle) * outer, sunY + Math.sin(angle) * outer);
      ctx.stroke();
    }

    // Sun disc
    ctx.fillStyle = '#ffe033';
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill();
    // Bright white hot centre
    const sunCore = ctx.createRadialGradient(sunX - 6, sunY - 6, 2, sunX, sunY, sunR);
    sunCore.addColorStop(0,   'rgba(255,255,255,0.9)');
    sunCore.addColorStop(0.4, 'rgba(255,240, 80,0.5)');
    sunCore.addColorStop(1,   'rgba(255,200,  0,0)');
    ctx.fillStyle = sunCore;
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill();

    // Wispy clouds
    const drawCloud = (cx, cy, scale) => {
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      [[0,0,28],[30,-10,22],[-28,-8,20],[52,2,18],[-50,4,16]].forEach(([ox,oy,r]) => {
        ctx.beginPath();
        ctx.arc(cx + ox * scale, cy + oy * scale, r * scale, 0, Math.PI * 2);
        ctx.fill();
      });
    };
    drawCloud(280, 55,  1.0);
    drawCloud(530, 40,  0.75);
    drawCloud(680, 80,  0.6);

    // Distant sand dunes (far layer) — brighter warm tan in daylight
    ctx.fillStyle = '#d4870e';
    ctx.beginPath();
    ctx.moveTo(0, this.H - 100);
    ctx.quadraticCurveTo(120, this.H - 155, 260, this.H - 100);
    ctx.quadraticCurveTo(400, this.H - 60,  540, this.H - 120);
    ctx.quadraticCurveTo(680, this.H - 160, this.W, this.H - 100);
    ctx.lineTo(this.W, this.H); ctx.lineTo(0, this.H);
    ctx.closePath(); ctx.fill();

    // ── HELPER: draw pyramids (reused for layering) ────────────────────────
    const pyramids = [
      { cx: 130, base: this.H - 72, w: 210, h: 175 },
      { cx: 400, base: this.H - 72, w: 280, h: 230 },
      { cx: 660, base: this.H - 72, w: 190, h: 155 },
      { cx: 790, base: this.H - 72, w: 120, h: 100 },
    ];

    const drawPyramids = () => {
      pyramids.forEach(p => {
        // Sunlit left face — bright warm gold
        const litGrad = ctx.createLinearGradient(p.cx - p.w / 2, 0, p.cx, 0);
        litGrad.addColorStop(0, '#f0b429');
        litGrad.addColorStop(1, '#e8960a');
        ctx.fillStyle = litGrad;
        ctx.beginPath();
        ctx.moveTo(p.cx, p.base - p.h);
        ctx.lineTo(p.cx - p.w / 2, p.base);
        ctx.lineTo(p.cx + p.w / 2, p.base);
        ctx.closePath(); ctx.fill();

        // Shadow right face — deeper amber
        const shadowGrad = ctx.createLinearGradient(p.cx, 0, p.cx + p.w / 2, 0);
        shadowGrad.addColorStop(0, '#e8960a');
        shadowGrad.addColorStop(1, '#7a4200');
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.moveTo(p.cx, p.base - p.h);
        ctx.lineTo(p.cx, p.base);
        ctx.lineTo(p.cx + p.w / 2, p.base);
        ctx.closePath(); ctx.fill();

        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1;
        const steps = 8;
        for (let s = 1; s < steps; s++) {
          const frac = s / steps;
          const lx = p.cx - (p.w / 2) * frac;
          const rx = p.cx + (p.w / 2) * frac;
          const ly = p.base - p.h * (1 - frac);
          ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(rx, ly); ctx.stroke();
        }

        if (p.w > 220) {
          const doorBase = p.base - 4;
          const doorH = 28;
          ctx.fillStyle = '#3a1a00';
          ctx.beginPath();
          ctx.moveTo(p.cx - 14, doorBase);
          ctx.lineTo(p.cx + 14, doorBase);
          ctx.lineTo(p.cx + 9,  doorBase - doorH);
          ctx.lineTo(p.cx - 9,  doorBase - doorH);
          ctx.closePath(); ctx.fill();
        }
      });
    };

    // ── HELPER: draw sand ground + ripples (reused for layering) ──────────
    const drawSand = () => {
      const sandGrad = ctx.createLinearGradient(0, this.H - 72, 0, this.H);
      sandGrad.addColorStop(0, '#f0b429');
      sandGrad.addColorStop(1, '#c8720a');
      ctx.fillStyle = sandGrad;
      ctx.fillRect(0, this.H - 72, this.W, 72);

      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      for (let r = 0; r < 5; r++) {
        const ry = this.H - 60 + r * 12;
        ctx.beginPath();
        ctx.moveTo(0, ry);
        for (let xr = 0; xr <= this.W; xr += 40) {
          ctx.quadraticCurveTo(xr + 20, ry - 3, xr + 40, ry);
        }
        ctx.stroke();
      }
    };

    // ── LAYER 1: pyramids behind targets ──────────────────────────────────
    drawPyramids();

    // ── LAYER 2: TARGETS (drawn between pyramids and ground) ───────────────
    // Iron Man is clipped by the sand layer drawn on top next, so he
    // naturally disappears behind the pyramids and ground as he flies low.
    this.targets.forEach(t => {
      if (t.escaped && !t.dead) return;
      if (t.type === 'acrobat') {
        const trailDir = t.vx > 0 ? -1 : 1;
        for (let s = 1; s <= 5; s++) {
          const alpha = 0.35 - s * 0.06;
          const size  = (6 - s) * 2;
          ctx.fillStyle = `rgba(168, 230, 255, ${alpha})`;
          ctx.beginPath();
          ctx.arc(
            t.x + trailDir * s * 13,
            t.y + 16,
            size, 0, Math.PI * 2
          );
          ctx.fill();
        }
        if (!t.dead) drawGrid(ctx, t.x, t.y, ACROBAT_SWING, PALETTES.acrobat, t.vx > 0, 1.4);
      } else if (t.type === 'drone') {
        if (!t.dead) drawGrid(ctx, t.x, t.y, DRONE_SPRITE, PALETTES.drone, false, t.scale);
      }
    });

    // ── PARTICLES (behind the foreground sand) ────────────────────────────
    this.particles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillRect(p.x, p.y, 5, 5);
    });
    ctx.globalAlpha = 1.0;

    // ── LAYER 3: sand ground drawn ON TOP — occludes Iron Man near ground ─
    drawSand();

    // ── LAYER 4: pyramids redrawn ON TOP — occludes Iron Man behind them ──
    drawPyramids();

    // ── MASCOT (above the sand) ────────────────────────────────────────────
    if (this.mascot.active) {
      const mY = Math.max(this.mascot.y, this.H - 120);
      drawGrid(ctx, this.W / 2, mY, VIGILANTE_STAND, PALETTES.vigilante, false, 2.5);
      if (this.mascot.type === 'laugh') {
        const bob = Math.sin(this.mascot.timer * 20) * 5;
        drawGrid(ctx, this.W / 2, mY + bob, VIGILANTE_STAND, PALETTES.vigilante, false, 2.5);
      }
    }

    // ── FLOATING TEXTS ─────────────────────────────────────────────────────
    ctx.textAlign = 'center';
    this.floatingTexts.forEach(ft => {
      ctx.font = ft.isTaunt
        ? 'bold 18px "Press Start 2P", monospace, sans-serif'
        : '14px "Press Start 2P", monospace, sans-serif';
      ctx.globalAlpha = Math.max(0, Math.min(1, ft.life * 1.5));

      const textWidth = ctx.measureText(ft.text).width;
      const drawX = Math.max(textWidth / 2 + 20, Math.min(this.W - textWidth / 2 - 20, ft.x));

      if (ft.isTaunt) {
        ctx.fillStyle = 'rgba(10, 5, 0, 0.88)';
        ctx.fillRect(drawX - textWidth / 2 - 20, ft.y - 24, textWidth + 40, 36);
        ctx.strokeStyle = '#d4a017';
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX - textWidth / 2 - 20, ft.y - 24, textWidth + 40, 36);
      }

      ctx.fillStyle = ft.color;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      ctx.strokeText(ft.text, drawX, ft.y);
      ctx.fillText(ft.text, drawX, ft.y);
    });
    ctx.globalAlpha = 1.0;
  }

  syncState() {
    if (this.updateReactState) {
      this.updateReactState({
        state: this.state,
        score: this.score,
        hiScore: this.hiScore,
        round: this.round,
        ammo: this.ammo,
        maxAmmo: this.maxAmmo,
        history: [...this.history],
        mode: this.mode,
        gameOverTaunt: this.gameOverTaunt
      });
    }
  }

  destroy() {
    cancelAnimationFrame(this.reqId);
  }
}

// --- REACT APP COMPONENT ---
const App = () => {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  
  const [gameState, setGameState] = useState({
    state: 'MENU',
    score: 0,
    hiScore: parseInt(localStorage.getItem('retroweb_hi')) || 0,
    round: 1,
    ammo: 5,
    maxAmmo: 5,
    history: new Array(10).fill('empty'),
    mode: 1,
    gameOverTaunt: ""
  });

  const initEngine = useCallback(() => {
    if (engineRef.current) engineRef.current.destroy();
    engineRef.current = new GameEngine(canvasRef.current, setGameState);
    setGameState(prev => ({...prev, hiScore: engineRef.current.hiScore}));
  }, []);

  useEffect(() => {
    initEngine();
    return () => { if (engineRef.current) engineRef.current.destroy(); };
  }, [initEngine]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const eng = engineRef.current;
      if (!eng) return;
      
      switch(e.key.toLowerCase()) {
        case '1': if(eng.state === 'MENU') eng.startGame(1); break;
        case '2': if(eng.state === 'MENU') eng.startGame(2); break;
        case '3': if(eng.state === 'MENU') eng.startGame(3); break;
        case 'r': eng.startGame(eng.mode); break;
        case 'escape': 
          eng.state = 'MENU';
          eng.syncState();
          break;
        case ' ': 
          if (eng.state === 'PLAYING') eng.shoot(400, 225); // Shoot center
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCanvasClick = (e) => {
    const eng = engineRef.current;
    if (!eng || eng.state !== 'PLAYING') return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    eng.shoot(x, y);
  };

  const modeNames = { 1: "LEVEL 1: EASY", 2: "LEVEL 2: MEDIUM", 3: "LEVEL 3: VERY HARD" };

  return (
    <div className="game-area">
      <canvas ref={canvasRef} onClick={handleCanvasClick} />
      <div className="crt-overlay"></div>
      <div id="screen-flash" className="flash"></div>

      {/* Top HUD Controls overlay over canvas directly */}
      {(gameState.state !== 'MENU') && (
        <div className="hud-top">
           <div></div>
           <div>
              <button className="btn" onClick={() => engineRef.current && engineRef.current.startGame(engineRef.current.mode)}>RESTART (R)</button>
              <button className="btn" onClick={() => {if(engineRef.current) {engineRef.current.state = 'MENU'; engineRef.current.syncState();}}}>MENU (ESC)</button>
           </div>
        </div>
      )}

      {gameState.state === 'MENU' && (
        <div className="overlay-screen ironman-menu">
          {/* Iron Man helmet silhouette top decoration */}
          <div className="im-helmet">
            <div className="im-helmet-top" />
            <div className="im-helmet-eyes">
              <div className="im-eye" />
              <div className="im-eye" />
            </div>
          </div>
          <h2 className="title im-title">IRON DESERT HUNTER</h2>
          <p className="subtitle im-subtitle">Aim with mouse/finger · Click/Space to shoot</p>
          <div className="menu-opts">
            <div className="menu-opt im-opt" onClick={() => engineRef.current.startGame(1)}>⚡ LEVEL 1: EASY (Press 1)</div>
            <div className="menu-opt im-opt" onClick={() => engineRef.current.startGame(2)}>🔥 LEVEL 2: MEDIUM (Press 2)</div>
            <div className="menu-opt im-opt" onClick={() => engineRef.current.startGame(3)}>💥 LEVEL 3: VERY HARD (Press 3)</div>
          </div>
          <p className="im-footer">— STARK INDUSTRIES —</p>
        </div>
      )}

      {gameState.state === 'ROUND_START' && (
        <div className="overlay-screen" style={{background: 'rgba(5,3,10,0.6)'}}>
          <h2 className="title" style={{fontSize: '3vmin'}}>WAVE {gameState.round}</h2>
        </div>
      )}

      {gameState.state === 'GAME_OVER' && (
        <div className="overlay-screen">
          <h2 className="title" style={{color: 'var(--neon-red)'}}>GAME OVER</h2>
          <p style={{fontSize: '1.5vmin', marginBottom: '16px'}}>SCORE: {gameState.score}</p>
          <p style={{fontSize: '1.5vmin', color: '#f39c12', marginBottom: '32px', maxWidth: '80%', lineHeight: '1.6'}}>
            "{gameState.gameOverTaunt}"
          </p>
          <div className="menu-opt" onClick={() => engineRef.current.startGame(gameState.mode)}>TRY AGAIN (R)</div>
          <div className="menu-opt" style={{marginTop: '10px'}} onClick={() => {engineRef.current.state = 'MENU'; engineRef.current.syncState();}}>MENU (ESC)</div>
        </div>
      )}

      {(gameState.state !== 'MENU') && (
        <div className="hud-bottom">
          <div className="hud-left">
            <div><span className="text-highlight">WAVE {gameState.round}</span></div>
            <div style={{color: '#8ab4f8'}}>{modeNames[gameState.mode]}</div>
          </div>
          
          <div className="hud-center">
            {gameState.history.map((res, i) => (
              <div key={i} className={`hit-box ${res === 'hit' ? 'hit' : res === 'miss' ? 'miss' : ''}`} />
            ))}
          </div>

          <div className="hud-right" style={{textAlign: 'right'}}>
            <div>SCORE <span className="text-highlight">{gameState.score.toString().padStart(6, '0')}</span></div>
            <div>HI <span className="text-highlight">{gameState.hiScore.toString().padStart(6, '0')}</span></div>
          </div>

          <div className="ammo-container">
            {Array.from({length: gameState.maxAmmo}).map((_, i) => (
              <div key={i} className={`bullet-icon ${i >= gameState.ammo ? 'spent' : ''}`} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
