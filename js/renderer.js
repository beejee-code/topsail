(function (global) {
  "use strict";

  var DEG = Math.PI / 180;
  var TAU = Math.PI * 2;
  var BOAT_SCALE = 9;

  function createRenderer(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = 1;
    var width = 0;
    var height = 0;
    var scale = 26;
    var cam = { x: 0, y: 0, sx: 0, sy: 0 };
    var waves = [];
    var streaks = [];
    var wake = [];
    var time = 0;

    function resize() {
      dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function screenToWorld(sx, sy) {
      return { x: (sx - width / 2) / scale + cam.sx, y: (sy - height / 2) / scale + cam.sy };
    }

    function worldToScreen(wx, wy) {
      return { x: (wx - cam.sx) * scale + width / 2, y: (wy - cam.sy) * scale + height / 2 };
    }

    function inView(wx, wy, margin) {
      var p = worldToScreen(wx, wy);
      return p.x > -margin && p.x < width + margin && p.y > -margin && p.y < height + margin;
    }

    function initWaveMarks() {
      waves = [];
      for (var i = 0; i < 900; i++) waves.push(newWaveMark());
    }

    function newWaveMark() {
      return { x: 0, y: 0, s: 0, a: 0, init: false };
    }

    function placeWave(w) {
      var sx = (Math.random() * (width + 300)) - 150;
      var sy = (Math.random() * (height + 300)) - 150;
      var p = screenToWorld(sx, sy);
      w.x = p.x;
      w.y = p.y;
      w.s = 0.4 + Math.random() * 1.4;
      w.a = 0.04 + Math.random() * 0.09;
      w.init = true;
    }

    function initStreaks() {
      streaks = [];
      for (var i = 0; i < 16; i++) streaks.push({ x: 0, y: 0, init: false });
    }

    function placeStreak(s) {
      var sx = Math.random() * width;
      var sy = Math.random() * height;
      var p = screenToWorld(sx, sy);
      s.x = p.x;
      s.y = p.y;
      s.init = true;
    }

    function drawWater() {
      var g = ctx.createLinearGradient(0, 0, 0, height);
      g.addColorStop(0, "#0e2e4e");
      g.addColorStop(0.5, "#0b2946");
      g.addColorStop(1, "#092341");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);

      for (var i = 0; i < waves.length; i++) {
        var w = waves[i];
        if (!w.init || !inView(w.x, w.y, 200)) {
          placeWave(w);
          continue;
        }
        var p = worldToScreen(w.x, w.y);
        var a = 0.12 + 0.14 * Math.min(1, w.s / 1.4);
        ctx.strokeStyle = "rgba(195,232,255," + a.toFixed(3) + ")";
        ctx.lineWidth = 0.8 + w.s * 0.5;
        ctx.beginPath();
        ctx.moveTo(p.x - w.s * scale * 0.38, p.y);
        ctx.quadraticCurveTo(p.x, p.y - w.s * scale * 0.2, p.x + w.s * scale * 0.38, p.y);
        ctx.stroke();
      }
    }

    function drawWindStreaks(wind, dt) {
      var wx = Math.cos(wind.direction) * wind.speed;
      var wy = Math.sin(wind.direction) * wind.speed;
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1.5;
      for (var i = 0; i < streaks.length; i++) {
        var s = streaks[i];
        if (!s.init || !inView(s.x, s.y, 400)) {
          placeStreak(s);
          continue;
        }
        var len = 18 + wind.speed * 4;
        var ex = s.x + wx * 0.7;
        var ey = s.y + wy * 0.7;
        var p1 = worldToScreen(s.x, s.y);
        var p2 = worldToScreen(ex, ey);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        var ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        var ah = 5;
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p2.x - ah * Math.cos(ang - 0.5), p2.y - ah * Math.sin(ang - 0.5));
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p2.x - ah * Math.cos(ang + 0.5), p2.y - ah * Math.sin(ang + 0.5));
        ctx.stroke();
        s.x += wx * dt * 1.2;
        s.y += wy * dt * 1.2;
      }
    }

    function drawNoGoWedge(state, wind) {
      var p = worldToScreen(state.x, state.y);
      var upwind = wind.direction + Math.PI;
      var half = 45 * DEG;
      var tip = 4.6 * scale * BOAT_SCALE;
      ctx.fillStyle = "rgba(255,80,80,0.10)";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + tip * Math.cos(upwind - half), p.y + tip * Math.sin(upwind - half));
      ctx.arc(p.x, p.y, tip, upwind - half, upwind + half);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,80,80,0.22)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    function spawnWake(state) {
      var fwdX = Math.cos(state.heading);
      var fwdY = Math.sin(state.heading);
      var vf = state.vx * fwdX + state.vy * fwdY;
      if (vf < 0.1) return;
      var n = Math.min(3, Math.max(1, Math.round(vf * 2)));
      for (var i = 0; i < n; i++) {
        var spread = (Math.random() - 0.5) * 0.9;
        var stern = 3.2;
        var sx = state.x - fwdX * stern - fwdY * spread;
        var sy = state.y - fwdY * stern + fwdX * spread;
        wake.push({
          x: sx,
          y: sy,
          vx: -fwdX * 0.15 + (Math.random() - 0.5) * 0.1,
          vy: -fwdY * 0.15 + (Math.random() - 0.5) * 0.1,
          life: 1,
          r: 0.15 + Math.random() * 0.2
        });
      }
      if (wake.length > 500) wake.splice(0, wake.length - 500);
    }

    function drawWake(dt) {
      for (var i = wake.length - 1; i >= 0; i--) {
        var w = wake[i];
        w.life -= dt * 0.9;
        if (w.life <= 0) {
          wake.splice(i, 1);
          continue;
        }
        w.x += w.vx * dt;
        w.y += w.vy * dt;
        var p = worldToScreen(w.x, w.y);
        var r = w.r * scale * (1.4 - w.life * 0.6) * 1.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.fillStyle = "rgba(230,245,255," + (0.18 * w.life).toFixed(3) + ")";
        ctx.fill();
      }
    }

    function drawBoat(state) {
      var p = worldToScreen(state.x, state.y);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(state.heading);
      var iw = 1 / BOAT_SCALE;
      ctx.scale(BOAT_SCALE, BOAT_SCALE);

      ctx.beginPath();
      ctx.ellipse(0, 0, 5.4, 2.6, 0, 0, TAU);
      ctx.fillStyle = "rgba(190, 235, 255, 0.10)";
      ctx.fill();
      ctx.strokeStyle = "rgba(210, 245, 255, 0.22)";
      ctx.lineWidth = 1.4 * iw;
      ctx.stroke();

      ctx.fillStyle = "#e8e2d4";
      ctx.strokeStyle = "#3a4a5c";
      ctx.lineWidth = 2 * iw;
      ctx.beginPath();
      ctx.moveTo(3.6, 0);
      ctx.quadraticCurveTo(2.6, 0.62, 1.0, 0.78);
      ctx.lineTo(-2.2, 0.82);
      ctx.lineTo(-3.3, 0.6);
      ctx.lineTo(-3.3, -0.6);
      ctx.lineTo(-2.2, -0.82);
      ctx.lineTo(1.0, -0.78);
      ctx.quadraticCurveTo(2.6, -0.62, 3.6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = "#2c3949";
      ctx.lineWidth = 1.2 * iw;
      ctx.beginPath();
      ctx.moveTo(-3.2, 0);
      ctx.lineTo(2.6, 0);
      ctx.stroke();

      ctx.fillStyle = "#eef2f7";
      ctx.strokeStyle = "#9aa7b5";
      ctx.lineWidth = 1 * iw;

      var sailLen = 3.3;
      var sail = state.sail;
      var tipX = -Math.cos(sail) * sailLen;
      var tipY = Math.sin(sail) * sailLen;
      ctx.beginPath();
      ctx.moveTo(0.1, 0);
      ctx.quadraticCurveTo(tipX * 0.6 + 0.35, tipY * 0.6, tipX, tipY);
      ctx.lineTo(-0.7, -0.28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#24313f";
      ctx.beginPath();
      ctx.arc(0, 0, 0.16, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = "#5a6875";
      ctx.lineWidth = 1.5 * iw;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();

      ctx.restore();
    }

    function render(state, wind, dt) {
      time += dt;
      cam.x += (state.x - cam.x) * Math.min(1, dt * 4);
      cam.y += (state.y - cam.y) * Math.min(1, dt * 4);
      cam.sx = cam.x;
      cam.sy = cam.y;

      spawnWake(state);
      drawWater();
      drawNoGoWedge(state, wind);
      drawWake(dt);
      drawBoat(state);
      drawWindStreaks(wind, dt);
    }

    window.addEventListener("resize", resize);
    resize();
    initWaveMarks();
    initStreaks();

    return {
      render: render,
      resize: resize,
      screenToWorld: screenToWorld,
      worldToScreen: worldToScreen,
      get scale() { return scale; }
    };
  }

  global.Renderer = { create: createRenderer };
})(typeof window !== "undefined" ? window : globalThis);
