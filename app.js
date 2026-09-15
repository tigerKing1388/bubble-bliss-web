(function () {
  const RULESET_ID = "bubble-bliss-v1.0";
  const LS_SCORE = "bubble-bliss-highscore";
  const LS_ACH = "bubble-bliss-achs";
  const LS_STAGE = "bubble-bliss-best-stage";
  const COLORS = [
    { name: "coral", fill: "#ff8fab", shine: "#fff1f5" },
    { name: "peach", fill: "#ffb347", shine: "#fff3dc" },
    { name: "lemon", fill: "#ffe066", shine: "#fffbeb" },
    { name: "mint", fill: "#7ddea0", shine: "#e9fff2" },
    { name: "sky", fill: "#74c0fc", shine: "#e7f5ff" },
    { name: "taro", fill: "#b197fc", shine: "#f3edff" },
    { name: "berry", fill: "#fa5252", shine: "#ffe3e3" }
  ];
  const GOLD = { name: "gold", fill: "#ffd43b", shine: "#fff8d6" };
  const DEFAULTS = {
    spawnInterval: 0.42,
    spawnMin: 0.18,
    comboWindow: 5,
    comboMultPer: 0.1,
    feverThreshold: 12
  };

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const hud = document.getElementById("hud");
  const hudScore = document.getElementById("hudScore");
  const hudCombo = document.getElementById("hudCombo");
  const hudRight = document.getElementById("hudRight");
  const hudRightLabel = document.getElementById("hudRightLabel");
  const feverBar = document.getElementById("feverBar");
  const feverFill = document.getElementById("feverFill");
  const tutorial = document.getElementById("tutorial");
  const comboBanner = document.getElementById("comboBanner");
  const toasts = document.getElementById("toasts");
  const menuOverlay = document.getElementById("menuOverlay");
  const resultOverlay = document.getElementById("resultOverlay");
  const resultStats = document.getElementById("resultStats");
  const resultAchs = document.getElementById("resultAchs");
  const params = { ...DEFAULTS };

  let W = 0, H = 0, dpr = 1, shake = 0, shakeKind = 0;
  let flash = 0, zoom = 1, hitStop = 0, bannerT = 0, bannerText = "";
  let state = "menu";
  let mode = "zen";
  let lastTs = 0;
  let audioCtx = null;
  let feverPad = null;
  let masterGain = null, sfxBus = null, musicGain = null;
  let musicOn = true;
  let sfxOn = true;
  let nextNote = 0, musicStep = 0, bgmReady = false;

  const bubbles = [];
  const particles = [];
  const ripples = [];
  const floats = [];
  const fogs = [];
  const shocks = [];

  const game = {
    time: 0,
    spawnAcc: 0,
    score: 0,
    scoreDisplay: 0,
    combo: 0,
    lastPopTime: -999,
    pops: 0,
    misses: 0,
    comboPeak: 0,
    feverLeft: 0,
    feverActive: false,
    climaxT: 0,
    lastClimaxAt: -99,
    challengeLeft: 60,
    tutorialT: 0,
    zenClean: 0,
    stage: 1,
    stagePops: 0,
    lives: 3,
    bestStage: Number(localStorage.getItem("bubble-bliss-best-stage") || 0),
    high: Number(localStorage.getItem(LS_SCORE) || 0)
  };

  const ACH_DEFS = [
    { id: "first", name: "初啵", desc: "点破第 1 颗" },
    { id: "c10", name: "连击十连", desc: "连击达到 10" },
    { id: "c30", name: "连击三十", desc: "连击达到 30" },
    { id: "chain", name: "首次连锁", desc: "触发连锁爆破" },
    { id: "chain5", name: "五连爆破", desc: "单次连锁 ≥ 5 颗" },
    { id: "fever", name: "黄金时刻", desc: "首次进入 Fever" },
    { id: "pop100", name: "爆泡高手", desc: "单局爆泡 100 颗" },
    { id: "score3k", name: "三千小目标", desc: "单局 3000 分" },
    { id: "zen60", name: "禅意达人", desc: "禅意模式连续 60 秒无漏泡" }
  ];
  let achs = {};
  try { achs = JSON.parse(localStorage.getItem(LS_ACH) || "{}"); } catch (e) { achs = {}; }

  function log(msg) {}

  function comboMul() {
    if (game.combo <= 0) return 1;
    return 1 + Math.min(game.combo, 40) * params.comboMultPer;
  }

  function resize() {
    dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function applyMute() {
    document.getElementById("btnMusic").textContent = musicOn ? "音乐开" : "音乐关";
    document.getElementById("btnSfx").textContent = sfxOn ? "音效开" : "音效关";
    document.getElementById("btnMusic").classList.toggle("off", !musicOn);
    document.getElementById("btnSfx").classList.toggle("off", !sfxOn);
    if (window.GameAudio) {
      GameAudio.setMusic(musicOn);
      GameAudio.setSfx(sfxOn);
    }
  }

  function ensureAudio() {
    if (window.GameAudio) GameAudio.unlock();
    applyMute();
  }

  function sfxPop() { if (window.GameAudio) GameAudio.pop(); }
  function sfxMiss() { if (window.GameAudio) GameAudio.miss(); }
  function sfxChain() { if (window.GameAudio) GameAudio.chain(); }
  function sfxAch() { if (window.GameAudio) GameAudio.ach(); }
  function sfxFever() { if (window.GameAudio) GameAudio.fever(); }
  function sfxStreak() { if (window.GameAudio) GameAudio.streak(); }
  function startFeverPad() { if (window.GameAudio) GameAudio.setFever(true); }
  function stopFeverPad() { if (window.GameAudio) GameAudio.setFever(false); }
  function scheduleBgm() {}

  function toast(text) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    toasts.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  function unlock(id) {
    if (achs[id]) return;
    const def = ACH_DEFS.find((a) => a.id === id);
    if (!def) return;
    achs[id] = true;
    localStorage.setItem(LS_ACH, JSON.stringify(achs));
    toast("成就 · " + def.name);
    sfxAch();
    log("成就 " + def.name);
  }

  function checkAchs() {
    if (game.pops >= 1) unlock("first");
    if (game.combo >= 10) unlock("c10");
    if (game.combo >= 30) unlock("c30");
    if (game.pops >= 100) unlock("pop100");
    if (game.score >= 3000) unlock("score3k");
  }

  function showBanner(text, hold) {
    bannerText = text;
    bannerT = hold || 0.7;
    comboBanner.textContent = text;
    comboBanner.classList.toggle("climax", /高潮|黄金|闯关/.test(text));
  }

  function heat() {
    return Math.min(1, game.combo / 24 + (game.feverActive ? 0.22 : 0) + (game.climaxT > 0 ? 0.4 : 0));
  }

  function triggerClimax(label) {
    if (game.time - game.lastClimaxAt < 1.1) {
      game.climaxT = Math.max(game.climaxT, 2.2);
      return;
    }
    game.lastClimaxAt = game.time;
    game.climaxT = 3.6;
    showBanner(label || "高潮爆发", 1.15);
    toast("高潮来了！");
    hitStop = Math.max(hitStop, 0.2);
    flash = 1;
    zoom = 1.24;
    addShake("climax");
    if (window.GameAudio) {
      GameAudio.fever();
      GameAudio.setHeat(1.5);
    }
    var i;
    for (i = 0; i < 8; i++) {
      spawnBurst(W * Math.random(), H * (0.15 + Math.random() * 0.55), GOLD, 36, true);
    }
  }

  function addShake(kind) {
    const map = { pop: 3.2, combo: 7.5, chain: 14, fever: 20, climax: 26 };
    const v = map[kind] || 3.2;
    if (v >= shake) { shake = v; shakeKind = v; }
  }

  function overlap(x, y, r) {
    for (const b of bubbles) {
      const dx = b.x - x, dy = b.y - y;
      if (dx * dx + dy * dy < (b.r + r + 6) * (b.r + r + 6)) return true;
    }
    return false;
  }

  function spawnBubble() {
    if (bubbles.length >= 22) return;
    const r = (40 + Math.random() * 52) / 2;
    let x = r + 8 + Math.random() * Math.max(8, W - 2 * r - 16);
    let tries = 0;
    while (overlap(x, H + r - 4, r) && tries++ < 18) {
      x = r + 8 + Math.random() * Math.max(8, W - 2 * r - 16);
    }
    const color = (game.feverActive ? GOLD : COLORS[Math.floor(Math.random() * COLORS.length)]);
    const haste = 1 + Math.min(0.85, game.time / 50) + (mode === "endless" ? (game.stage - 1) * 0.14 : 0);
    bubbles.push({
      x, baseX: x, y: H + r - 2, r,
      vy: (48 + Math.random() * 42) * haste,
      phase: Math.random() * Math.PI * 2,
      color,
      born: game.time
    });
  }

  function spawnBurst(x, y, color, n, goldRain) {
    const count = Math.min(110, (goldRain ? n + 28 : n) + Math.floor(heat() * 28));
    for (let i = 0; i < count; i++) {
      if (particles.length >= 600) particles.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = 90 + Math.random() * 320;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 90,
        life: 0.35 + Math.random() * 0.45,
        t: 0,
        r: goldRain ? 3 + Math.random() * 4 : 2.5 + Math.random() * 5,
        color: goldRain && i % 2 ? "#fff3bf" : color.fill,
        star: i % 3 === 0,
        spark: i % 5 === 0
      });
    }
  }

  function addRipple(x, y, strong) {
    ripples.push({ x, y, t: 0, life: strong ? 0.55 : 0.32, strong: !!strong });
  }

  function addShock(x, y, power) {
    shocks.push({ x, y, t: 0, life: 0.42, power: power || 1 });
  }

  function popScore(r, chainCount) {
    const base = Math.round((r * 2) / 4);
    const mul = comboMul();
    const chain = 1 + chainCount;
    const fever = game.feverActive ? 3 : 1;
    return Math.round(base * mul * chain * fever);
  }

  function explodeOne(b, chainCount, fromChain) {
    const s = popScore(b.r, chainCount);
    game.score += s;
    game.pops += 1;
    const big = s >= 80 || fromChain || game.feverActive;
    floats.push({
      x: b.x, y: b.y, t: 0,
      text: "+" + s,
      life: big ? 1.05 : 0.7,
      big: big,
      color: game.feverActive ? "#fff3bf" : (fromChain ? "#ff6b6b" : "#3b2330")
    });
    spawnBurst(b.x, b.y, b.color, fromChain ? 36 : 26, game.feverActive || game.climaxT > 0);
    addRipple(b.x, b.y, true);
    return s;
  }

  function collectChain(seed, maxN) {
    const set = new Set([seed]);
    const q = [seed];
    while (q.length && set.size < maxN) {
      const cur = q.shift();
      const rad = cur.r * 2 * 1.6;
      for (const o of bubbles) {
        if (set.has(o) || set.size >= maxN) continue;
        if (o.color.name !== cur.color.name) continue;
        const dx = o.x - cur.x, dy = o.y - cur.y;
        if (dx * dx + dy * dy <= rad * rad) {
          set.add(o);
          q.push(o);
        }
      }
    }
    return [...set];
  }

  function popBubble(b) {
    const now = game.time;
    if (now - game.lastPopTime <= params.comboWindow && game.combo > 0) game.combo += 1;
    else game.combo = 1;
    game.lastPopTime = now;
    game.comboPeak = Math.max(game.comboPeak, game.combo);

    let group = [b];
    let chainCount = 0;
    const chainTrigger = game.combo > 0 && game.combo % 5 === 0;
    if (chainTrigger) {
      group = collectChain(b, 12);
      chainCount = Math.max(0, group.length - 1);
      if (chainCount > 0) {
        unlock("chain");
        if (group.length >= 5) unlock("chain5");
        sfxChain(group.length);
        addShake("chain");
        hitStop = Math.max(hitStop, 0.07);
        flash = Math.max(flash, 0.45);
        zoom = 1.08;
        addShock(b.x, b.y, 1.4);
        showBanner("连锁 x" + group.length, 0.85);
        if (group.length >= 5) triggerClimax("连锁高潮");
        log("连锁 x" + group.length + " 连击=" + game.combo);
      }
    }

    for (const g of group) {
      explodeOne(g, chainCount, g !== b);
      const i = bubbles.indexOf(g);
      if (i >= 0) bubbles.splice(i, 1);
    }

    sfxPop();
    if (game.combo === 8) toast("热起来了");
    if (game.combo === 10 || game.combo === 15) {
      sfxStreak(game.combo);
      showBanner(game.combo + " 连击蓄力", 0.8);
    }
    if (game.combo === 18 || game.combo === 25 || game.combo === 40) {
      sfxStreak(game.combo);
      triggerClimax(game.combo + " 连高潮");
    }
    addShake(game.combo >= 12 ? "combo" : (game.combo >= 6 ? "combo" : "pop"));
    flash = Math.max(flash, 0.18 + heat() * 0.45);
    zoom = Math.max(zoom, 1.02 + heat() * 0.08);
    addShock(b.x, b.y, 0.8 + heat() * 1.4);

    if (!game.feverActive && game.combo >= params.feverThreshold) {
      game.feverActive = true;
      game.feverLeft = 15;
      unlock("fever");
      sfxFever();
      startFeverPad();
      triggerClimax("黄金高潮");
    }

    checkAchs();
    if (mode === "endless") {
      game.stagePops += group.length;
      if (game.stagePops >= 10 + game.stage * 4) {
        game.stage += 1;
        game.stagePops = 0;
        showBanner("第 " + game.stage + " 关", 0.9);
        toast("关卡 " + game.stage + " · 速度提升");
        triggerClimax("闯关高潮");
      }
    }
  }

  function missBubble(b) {
    fogs.push({ x: b.x, y: b.y, r: b.r, t: 0, color: b.color });
    spawnBurst(b.x, b.y, b.color, 8, false);
    game.misses += 1;
    game.combo = 0;
    game.zenClean = 0;
    game.climaxT = 0;
    if (window.GameAudio) GameAudio.setHeat(1);
    sfxMiss();
    log("漏泡 连击归零 Fever剩余=" + game.feverLeft.toFixed(2));
    const i = bubbles.indexOf(b);
    if (i >= 0) bubbles.splice(i, 1);
    if (mode === "endless") {
      game.lives -= 1;
      toast("剩余生命 " + Math.max(0, game.lives));
      if (game.lives <= 0) enterResult();
    }
  }

  function hitTest(x, y) {
    const hits = [];
    for (const b of bubbles) {
      const dx = x - b.x, dy = y - b.y;
      if (dx * dx + dy * dy <= (b.r + 18) * (b.r + 18)) hits.push(b);
    }
    if (!hits.length) return null;
    hits.sort((a, b) => a.y - b.y);
    return hits[0];
  }

  function resetRun(keepMode) {
    bubbles.length = 0;
    particles.length = 0;
    ripples.length = 0;
    floats.length = 0;
    fogs.length = 0;
    shocks.length = 0;
    flash = 0; zoom = 1; hitStop = 0; bannerT = 0;
    game.climaxT = 0;
    game.lastClimaxAt = -99;
    game.time = 0;
    game.spawnAcc = params.spawnInterval * 3;
    game.score = 0;
    game.scoreDisplay = 0;
    game.combo = 0;
    game.lastPopTime = -999;
    game.pops = 0;
    game.misses = 0;
    game.comboPeak = 0;
    game.feverLeft = 0;
    game.feverActive = false;
    game.challengeLeft = 60;
    game.tutorialT = 3.2;
    game.zenClean = 0;
    game.stage = 1;
    game.stagePops = 0;
    game.lives = 3;
    stopFeverPad();
    if (!keepMode) mode = "zen";
  }

  function enterMenu() {
    state = "menu";
    resetRun(false);
    menuOverlay.classList.remove("hidden");
    resultOverlay.classList.add("hidden");
    hud.style.display = "none";
    tutorial.style.opacity = "0";
  }

  function enterPlay(m) {
    ensureAudio();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    mode = m;
    resetRun(true);
    state = "playing";
    menuOverlay.classList.add("hidden");
    resultOverlay.classList.add("hidden");
    hud.style.display = "block";
    tutorial.style.opacity = "1";
    hudRightLabel.textContent = mode === "challenge" ? "剩余" : (mode === "endless" ? "关卡 / 生命" : "最高分");
    comboBanner.style.opacity = "0";
    tutorial.textContent = mode === "endless" ? "漏泡会掉生命，过关会越来越快" : "点破上升的泡泡，保持连击";
    for (let i = 0; i < 3; i++) spawnBubble();
    log("开局 mode=" + mode);
  }

  function enterResult() {
    state = "result";
    stopFeverPad();
    if (mode === "challenge" || mode === "endless") {
      if (game.score > game.high) {
        game.high = game.score;
        localStorage.setItem(LS_SCORE, String(game.high));
      }
    }
    if (mode === "endless" && game.stage > game.bestStage) {
      game.bestStage = game.stage;
      localStorage.setItem(LS_STAGE, String(game.bestStage));
    }
    menuOverlay.classList.add("hidden");
    resultOverlay.classList.remove("hidden");
    hud.style.display = "none";
    tutorial.style.opacity = "0";
    resultStats.textContent = "";
    const lines = [
      "得分 " + game.score,
      "最高分 " + game.high,
      "连击峰值 " + game.comboPeak,
      "爆泡 " + game.pops + " · 漏泡 " + game.misses
    ];
    if (mode === "endless") lines.splice(1, 0, "到达关卡 " + game.stage + " · 最高关卡 " + game.bestStage);
    lines.forEach(function (line) {
      const p = document.createElement("div");
      p.textContent = line;
      resultStats.appendChild(p);
    });
    resultAchs.textContent = "";
    ACH_DEFS.forEach((a) => {
      const s = document.createElement("span");
      s.className = "ach" + (achs[a.id] ? " on" : "");
      s.textContent = a.name;
      resultAchs.appendChild(s);
    });
    log("结算 score=" + game.score);
  }

  function pointer(e) {
    ensureAudio();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    if (state !== "playing") return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const b = hitTest(x, y);
    if (b) popBubble(b);
    else addRipple(x, y);
  }

  function intervalNow() {
    const steps = Math.floor(game.time / 12);
    const extra = mode === "endless" ? (game.stage - 1) * 0.04 : 0;
    return Math.max(0.16, params.spawnMin, params.spawnInterval - steps * 0.04 - extra);
  }

  function tick(dt) {
    if (state !== "playing") return;
    if (hitStop > 0) {
      hitStop -= dt;
      dt *= 0.12;
    }
    game.time += dt;
    if (mode === "challenge") {
      game.challengeLeft -= dt;
      if (game.challengeLeft <= 0) {
        game.challengeLeft = 0;
        enterResult();
        return;
      }
    } else if (mode === "zen") {
      game.zenClean += dt;
      if (game.zenClean >= 60) unlock("zen60");
    }

    if (game.feverActive) {
      game.feverLeft -= dt;
      if (game.feverLeft <= 0) {
        game.feverActive = false;
        game.feverLeft = 0;
        stopFeverPad();
        log("Fever 结束");
      }
    }

    game.spawnAcc += dt;
    const iv = intervalNow();
    while (game.spawnAcc >= iv) {
      game.spawnAcc -= iv;
      spawnBubble();
    }

    const leakY = 70;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.y -= b.vy * dt;
      b.phase += Math.PI * 2 * 0.5 * dt;
      b.x = b.baseX + Math.sin(b.phase) * 8;
      b.x = Math.max(b.r + 2, Math.min(W - b.r - 2, b.x));
      if (b.y < leakY) {
        missBubble(b);
        if (state !== "playing") return;
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 380 * dt;
      if (p.t >= p.life) particles.splice(i, 1);
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].t += dt;
      if (ripples[i].t >= ripples[i].life) ripples.splice(i, 1);
    }
    for (let i = shocks.length - 1; i >= 0; i--) {
      shocks[i].t += dt;
      if (shocks[i].t >= shocks[i].life) shocks.splice(i, 1);
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      floats[i].t += dt;
      floats[i].y -= (floats[i].big ? 70 : 48) * dt;
      if (floats[i].t >= floats[i].life) floats.splice(i, 1);
    }
    for (let i = fogs.length - 1; i >= 0; i--) {
      fogs[i].t += dt;
      if (fogs[i].t >= 0.7) fogs.splice(i, 1);
    }

    if (game.tutorialT > 0) {
      game.tutorialT -= dt;
      tutorial.style.opacity = String(Math.max(0, game.tutorialT / 0.8));
    }

    game.scoreDisplay += (game.score - game.scoreDisplay) * Math.min(1, dt * 14);
    hudScore.textContent = String(Math.round(game.scoreDisplay));
    hudCombo.textContent = game.combo + " · " + comboMul().toFixed(1) + "x";
    hudCombo.className = "value" + (game.climaxT > 0 || game.combo >= 18 ? " blaze" : game.combo >= 8 ? " hot" : "");
    if (mode === "challenge") hudRight.textContent = Math.ceil(game.challengeLeft) + "s";
    else if (mode === "endless") hudRight.textContent = game.stage + " · " + "♥".repeat(Math.max(0, game.lives));
    else hudRight.textContent = String(game.high);
    var hv = heat();
    feverBar.style.display = "block";
    feverFill.style.width = ((game.feverActive ? game.feverLeft / 15 : hv) * 100) + "%";
    feverBar.classList.toggle("climax", game.climaxT > 0);

    if (game.climaxT > 0) {
      game.climaxT = Math.max(0, game.climaxT - dt);
      if (particles.length < 500 && Math.random() < 0.5) spawnBurst(Math.random() * W, 8 + Math.random() * 40, GOLD, 7, true);
      if (game.climaxT <= 0 && window.GameAudio) GameAudio.setHeat(game.feverActive ? 1.22 : 1);
    } else if (window.GameAudio) {
      GameAudio.setHeat(1 + hv * 0.48);
    }

    if (shake > 0) shake = Math.max(0, shake - dt * (game.climaxT > 0 ? 5 : 11));
    if (flash > 0) flash = Math.max(0, flash - dt * 3.2);
    zoom += (1 - zoom) * Math.min(1, dt * 10);
    if (bannerT > 0) {
      bannerT -= dt;
      comboBanner.style.opacity = String(Math.max(0, Math.min(1, bannerT * 1.6)));
      comboBanner.style.transform = "translate(-50%, -50%) scale(" + (1.05 + heat() * 0.25) + ")";
    } else comboBanner.style.opacity = "0";
  }

  function drawBg() {
    const pulse = game.feverActive ? 0.5 + 0.5 * Math.sin(game.time * 10) : 0;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (game.climaxT > 0) {
      g.addColorStop(0, "#fff3bf");
      g.addColorStop(0.45, "#ff6b6b");
      g.addColorStop(1, "#be4bdb");
    } else if (game.feverActive) {
      g.addColorStop(0, pulse > 0.6 ? "#ffd43b" : "#ff922b");
      g.addColorStop(1, "#fa5252");
    } else if (game.combo >= 8) {
      g.addColorStop(0, "#b8c0ff");
      g.addColorStop(1, "#ffc9de");
    } else {
      g.addColorStop(0, "#d0e8f8");
      g.addColorStop(1, "#f8d5e4");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(W * 0.2, H * 0.18, 180, 70, 0, 0, Math.PI * 2);
    ctx.ellipse(W * 0.72, H * 0.12, 160, 54, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = (game.climaxT > 0 || game.feverActive) ? "rgba(255,80,80,0.55)" : "rgba(255,255,255,0.28)";
    ctx.setLineDash([6, 10]);
    ctx.beginPath();
    ctx.moveTo(0, 70);
    ctx.lineTo(W, 70);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawBubble(b) {
    const danger = b.y < 160;
    const pop = 1 + Math.sin(game.time * 14 + b.phase) * (danger ? 0.08 : 0.02);
    const rr = b.r * pop;
    if (danger) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, rr + 8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 50, 80, " + (0.35 + 0.25 * Math.sin(game.time * 16)) + ")";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    const grd = ctx.createRadialGradient(b.x - rr * 0.3, b.y - rr * 0.35, rr * 0.1, b.x, b.y, rr);
    grd.addColorStop(0, b.color.shine);
    grd.addColorStop(0.4, b.color.fill);
    grd.addColorStop(1, "#ffffff22");
    ctx.beginPath();
    ctx.arc(b.x, b.y, rr, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(b.x - rr * 0.28, b.y - rr * 0.32, rr * 0.3, rr * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);
    if (shake > 0) {
      const mag = shakeKind * (game.climaxT > 0 ? 3.4 : 2.4);
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }
    drawBg();
    for (const s of shocks) {
      const k = s.t / s.life;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 10 + k * 140 * s.power, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255," + (0.7 * (1 - k)) + ")";
      ctx.lineWidth = 10 * (1 - k) * s.power;
      ctx.stroke();
    }
    for (const r of ripples) {
      const k = r.t / r.life;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 8 + k * (r.strong ? 90 : 46), 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255," + ((r.strong ? 0.8 : 0.5) * (1 - k)) + ")";
      ctx.lineWidth = r.strong ? 4 : 2;
      ctx.stroke();
    }
    for (const b of bubbles) drawBubble(b);
    for (const f of fogs) {
      const k = f.t / 0.7;
      ctx.globalAlpha = 0.35 * (1 - k);
      ctx.beginPath();
      ctx.arc(f.x, f.y - k * 20, f.r * (1 + k * 0.6), 0, Math.PI * 2);
      ctx.fillStyle = "#eef2f6";
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const p of particles) {
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = k;
      ctx.fillStyle = p.spark ? "#fff" : p.color;
      ctx.beginPath();
      if (p.star) {
        ctx.rect(p.x - p.r, p.y - p.r * 0.3, p.r * 2, p.r * 0.6);
        ctx.rect(p.x - p.r * 0.3, p.y - p.r, p.r * 0.6, p.r * 2);
      } else {
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of floats) {
      const k = 1 - f.t / f.life;
      ctx.globalAlpha = Math.min(1, k * 1.4);
      ctx.font = "900 " + (f.big ? 34 : 22) + "px PingFang SC, Microsoft YaHei, sans-serif";
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 5;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
    if (flash > 0) {
      ctx.fillStyle = (game.climaxT > 0 || game.feverActive)
        ? "rgba(255, 170, 40, " + (flash * 0.42) + ")"
        : "rgba(255, 255, 255, " + (flash * 0.28) + ")";
      ctx.fillRect(0, 0, W, H);
    }
    if (heat() > 0.2) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(80,0,40," + (0.12 + heat() * 0.32) + ")");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  function loop(ts) {
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05;
    tick(dt);
    scheduleBgm();
    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => { lastTs = 0; });
  canvas.addEventListener("pointerdown", pointer);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (state !== "playing" || !bubbles.length) return;
      let top = bubbles[0];
      for (const b of bubbles) if (b.y < top.y) top = b;
      popBubble(top);
    }
  });

  function onTap(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  }
  onTap("btnMusic", function () {
    ensureAudio();
    musicOn = !musicOn;
    localStorage.setItem("bubble-bliss-music", musicOn ? "1" : "0");
    applyMute();
  });
  onTap("btnSfx", function () {
    ensureAudio();
    sfxOn = !sfxOn;
    localStorage.setItem("bubble-bliss-sfx", sfxOn ? "1" : "0");
    applyMute();
  });
  onTap("btnZen", function () { enterPlay("zen"); });
  onTap("btnChallenge", function () { enterPlay("challenge"); });
  onTap("btnEndless", function () { enterPlay("endless"); });
  onTap("btnReplay", function () { enterPlay(mode); });
  onTap("btnMenu", function () { enterMenu(); });

  document.addEventListener("pointerdown", function () {
    if (window.GameAudio) GameAudio.unlock();
  }, true);
  resize();
  enterMenu();
  applyMute();
  requestAnimationFrame(loop);
})();