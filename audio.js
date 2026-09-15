(function (global) {
  var SR = 22050;
  var urls = {};
  var ready = false;
  var unlocked = false;
  var musicOn = true;
  var sfxOn = true;
  var bgmEl = null;

  function pcm(seconds, fn) {
    var n = Math.floor(SR * seconds);
    var samples = new Int16Array(n);
    var i, v;
    for (i = 0; i < n; i++) {
      v = fn(i / SR);
      if (v > 1) v = 1;
      else if (v < -1) v = -1;
      samples[i] = (v * 26000) | 0;
    }
    return samples;
  }

  function wavDataUri(samples) {
    var n = samples.length;
    var buf = new ArrayBuffer(44 + n * 2);
    var view = new DataView(buf);
    function ws(o, s) {
      var i;
      for (i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
    }
    ws(0, "RIFF");
    view.setUint32(4, 36 + n * 2, true);
    ws(8, "WAVE");
    ws(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, SR, true);
    view.setUint32(28, SR * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    ws(36, "data");
    view.setUint32(40, n * 2, true);
    var o = 44;
    var i;
    for (i = 0; i < n; i++, o += 2) view.setInt16(o, samples[i], true);
    var bytes = new Uint8Array(buf);
    var bin = "";
    for (i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return "data:audio/wav;base64," + btoa(bin);
  }

  function build() {
    urls.silent = wavDataUri(pcm(0.06, function () { return 0; }));
    urls.pop = wavDataUri(pcm(0.18, function (t) {
      return Math.sin(2 * Math.PI * 640 * Math.pow(2, -t * 3) * t) * Math.exp(-t * 14) +
        (Math.random() * 2 - 1) * 0.22 * Math.exp(-t * 28);
    }));
    urls.miss = wavDataUri(pcm(0.22, function (t) {
      return Math.sin(2 * Math.PI * (90 - t * 120) * t) * Math.exp(-t * 8) * 0.8;
    }));
    urls.chain = wavDataUri(pcm(0.42, function (t) {
      var n = 1 + Math.floor(t / 0.07);
      return Math.sin(2 * Math.PI * (420 + n * 90) * t) * Math.exp(-(t % 0.07) * 22) * 0.7;
    }));
    urls.fever = wavDataUri(pcm(0.45, function (t) {
      return (Math.sin(2 * Math.PI * 392 * t) + Math.sin(2 * Math.PI * 523 * t) + Math.sin(2 * Math.PI * 659 * t)) *
        0.28 * Math.exp(-t * 4);
    }));
    urls.ach = wavDataUri(pcm(0.28, function (t) {
      var f = t < 0.12 ? 740 : 980;
      return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 7) * 0.7;
    }));
    urls.bgm = wavDataUri(pcm(6.4, function (t) {
      var chords = [
        [261.63, 329.63, 392.00],
        [220.00, 261.63, 329.63],
        [174.61, 220.00, 261.63],
        [196.00, 246.94, 293.66]
      ];
      var ch = chords[Math.floor(t / 1.6) % 4];
      var mel = [523.25, 659.25, 783.99, 659.25][Math.floor(t * 5) % 4];
      var e = 0.55 + 0.45 * Math.sin(t * 3);
      return (
        Math.sin(2 * Math.PI * (ch[0] / 2) * t) * 0.28 +
        Math.sin(2 * Math.PI * ch[0] * t) * 0.16 +
        Math.sin(2 * Math.PI * ch[1] * t) * 0.12 +
        Math.sin(2 * Math.PI * ch[2] * t) * 0.10 +
        Math.sin(2 * Math.PI * mel * t) * 0.14 * e
      );
    }));
  }

  function playUrl(src, volume, loop) {
    var a = new Audio();
    a.src = src;
    a.volume = volume;
    a.loop = !!loop;
    var p = a.play();
    if (p && p.catch) p.catch(function () {});
    return a;
  }

  function startBgm() {
    if (!musicOn || !urls.bgm) return;
    if (bgmEl) {
      try { bgmEl.pause(); } catch (e) {}
    }
    bgmEl = playUrl(urls.bgm, 0.48, true);
  }

  function unlock() {
    if (!ready) {
      build();
      ready = true;
    }
    if (!unlocked) {
      unlocked = true;
      playUrl(urls.silent, 0.01, false);
    }
    if (musicOn && (!bgmEl || bgmEl.paused)) startBgm();
  }

  global.GameAudio = {
    unlock: unlock,
    setMusic: function (on) {
      musicOn = !!on;
      if (!musicOn) {
        if (bgmEl) {
          try { bgmEl.pause(); } catch (e) {}
        }
      } else if (unlocked) {
        startBgm();
      }
    },
    setSfx: function (on) { sfxOn = !!on; },
    pop: function () { if (sfxOn && urls.pop) playUrl(urls.pop, 0.82, false); },
    miss: function () { if (sfxOn && urls.miss) playUrl(urls.miss, 0.7, false); },
    chain: function () { if (sfxOn && urls.chain) playUrl(urls.chain, 0.8, false); },
    fever: function () { if (sfxOn && urls.fever) playUrl(urls.fever, 0.85, false); },
    ach: function () { if (sfxOn && urls.ach) playUrl(urls.ach, 0.75, false); },
    streak: function () { if (sfxOn && urls.fever) playUrl(urls.fever, 0.6, false); },
    setFever: function (on) {
      if (bgmEl) bgmEl.playbackRate = on ? 1.22 : 1;
    },
    setHeat: function (r) {
      if (bgmEl) {
        try { bgmEl.playbackRate = Math.max(0.95, Math.min(1.55, r || 1)); } catch (e) {}
      }
    },
    tick: function () {}
  };
})(window);
