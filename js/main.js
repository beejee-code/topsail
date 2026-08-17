(function () {
  "use strict";

  var DEG = Math.PI / 180;
  var S = window.Sailing;

  var canvas = document.getElementById("sea");
  var renderer = window.Renderer.create(canvas);
  var input = window.Input.create();
  var config = S.defaultConfig();

  var INITIAL = { x: 0, y: 0, heading: -90 * DEG, sail: 18 * DEG };
  var wind = { direction: 180 * DEG, speed: S.knotsToMs(12) };
  var state = S.createState(INITIAL);
  var paused = false;
  var mouseSteer = false;
  var mouse = { x: 0, y: 0 };

  var POINTS_OF_SAIL = {
    "no-go": "In irons",
    "close-hauled": "Close-hauled",
    "beam-reach": "Beam reach",
    "broad-reach": "Broad reach",
    "running": "Running"
  };

  function bearing(rad) {
    var deg = (rad / DEG + 90) % 360;
    if (deg < 0) deg += 360;
    return deg;
  }

  function compassLabel(deg) {
    var names = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return names[Math.round(deg / 22.5) % 16];
  }

  function headingLabel(h) {
    var deg = bearing(h);
    return deg.toFixed(0) + "\u00B0 " + compassLabel(deg);
  }

  function appWindLabel(deg) {
    var a = deg;
    var side = a >= 0 ? "port" : "stbd";
    return Math.abs(a).toFixed(0) + "\u00B0 " + side;
  }

  var el = {};
  ["speed", "heading", "pos", "sail", "appwind", "airflow", "leeway", "hint", "message"].forEach(function (id) {
    el[id] = document.getElementById("stat-" + id) || document.getElementById(id);
  });

  var flowFill = document.getElementById("flow-fill");

  var windArrow = document.getElementById("wind-arrow");
  var windSpeedEl = document.getElementById("wind-speed");
  var windDirEl = document.getElementById("wind-dir");

  var wspeedSlider = document.getElementById("ctrl-wspeed");
  var wspeedVal = document.getElementById("ctrl-wspeed-val");
  var wdirSlider = document.getElementById("ctrl-wdir");
  var wdirVal = document.getElementById("ctrl-wdir-val");
  var mouseCheck = document.getElementById("ctrl-mouse");
  var btnTack = document.getElementById("btn-tack");
  var btnReset = document.getElementById("btn-reset");
  var btnPause = document.getElementById("btn-pause");

  var msgTimer = null;

  var rotateOverlay = document.getElementById("rotate-overlay");
  var portraitMq = window.matchMedia ? window.matchMedia("(orientation: portrait)") : null;

  function isMobileDevice() {
    var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    var touch = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
    return !!coarse && !!touch;
  }

  function updateRotateOverlay() {
    if (!rotateOverlay) return;
    var show = isMobileDevice() && (!portraitMq || portraitMq.matches);
    rotateOverlay.classList.toggle("show", show);
  }

  if (portraitMq && portraitMq.addEventListener) portraitMq.addEventListener("change", updateRotateOverlay);
  window.addEventListener("resize", updateRotateOverlay);
  window.addEventListener("orientationchange", updateRotateOverlay);
  updateRotateOverlay();

  function showMessage(text, ms) {
    el.message.textContent = text;
    el.message.classList.add("show");
    if (msgTimer) clearTimeout(msgTimer);
    msgTimer = setTimeout(function () { el.message.classList.remove("show"); }, ms || 1600);
  }

  function tack() {
    state.sail = -state.sail;
    showMessage("Tack!", 900);
  }

  function reset() {
    state = S.createState(INITIAL);
    showMessage("Reset", 800);
  }

  function updateWind() {
    var deg = parseFloat(wdirSlider.value);
    wind.direction = (deg + 90) * DEG;
    wind.speed = S.knotsToMs(parseFloat(wspeedSlider.value));
    windDirEl.textContent = compassLabel(deg) + " (" + deg + "\u00B0)";
    windSpeedEl.textContent = wspeedSlider.value + " kn";
    wspeedVal.textContent = wspeedSlider.value + " kn";
    wdirVal.textContent = compassLabel(deg);
  }

  function steeringToMouse() {
    if (!mouseSteer) return 0;
    var w = renderer.screenToWorld(mouse.x, mouse.y);
    var target = Math.atan2(w.y - state.y, w.x - state.x);
    var diff = S.normalizeAngle(target - state.heading);
    var rudder = Math.max(-1, Math.min(1, diff * 2.2));
    return rudder;
  }

  function updateHud() {
    var info = S.analyze(state, wind, config);
    el.speed.textContent = info.speedKn.toFixed(1) + " kn";
    el.heading.textContent = headingLabel(state.heading);
    el.pos.textContent = POINTS_OF_SAIL[info.pointOfSail] || info.pointOfSail;
    el.sail.textContent = Math.abs(info.sailDeg).toFixed(0) + "\u00B0 " + (info.sailDeg >= 0 ? "stbd" : "port");
    el.appwind.textContent = appWindLabel(info.apparentDeg) + " \u00B7 " + info.apparentSpeedKn.toFixed(1) + " kn";
    el.leeway.textContent = (Math.abs(info.leewayDeg) < 0.05 ? "0" : info.leewayDeg.toFixed(1)) + "\u00B0";

    var hint = coachingHint(info);
    el.hint.textContent = hint;

    var flow = airflowQuality(info);
    el.airflow.textContent = flow.text;
    el.airflow.className = "flow-" + flow.cls;
    flowFill.style.width = flow.pct + "%";
    flowFill.className = "flowfill flow-" + flow.cls;

    var targetRot = bearing(wind.direction);
    windArrow.style.transform = "rotate(" + targetRot + "deg)";
  }

  function airflowQuality(info) {
    if (info.apparentSpeedKn < 0.4) return { text: "Calm", cls: "calm", pct: 0 };
    var a = Math.abs(info.attackDeg);
    var pct = Math.round(Math.abs(Math.sin(2 * info.attackDeg * DEG)) * 100);
    if (a < 15) return { text: "Luffing", cls: "bad", pct: pct };
    if (a > 100) return { text: "Backwinded", cls: "bad", pct: pct };
    if (a >= 80) return { text: "Stalled", cls: "bad", pct: pct };
    if (pct >= 50) return { text: "Flowing", cls: "good", pct: pct };
    return { text: "Luffing", cls: "bad", pct: pct };
  }

  function coachingHint(info) {
    if (paused) return "";
    if (info.speedKn < 0.6) {
      return info.pointOfSail === "no-go" ? "In irons \u2014 bear away" : "Trim the sail to the wind";
    }
    var sail = Math.abs(info.sailDeg);
    var want = info.pointOfSail === "close-hauled" ? 25 : info.pointOfSail === "running" ? 75 : 45;
    if (sail < want - 12) return "Ease the sheets \u2014 sail out";
    if (sail > want + 18) return "Sheet in \u2014 sail is stalled";
    return "";
  }

  var last = performance.now();
  var acc = 0;
  var STEP = 1 / 60;

  function loop(now) {
    requestAnimationFrame(loop);
    var dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.1);

    if (input.consume("tack")) tack();
    if (input.consume("reset")) reset();
    if (input.consume("pause")) {
      paused = !paused;
      btnPause.textContent = paused ? "Resume (P)" : "Pause (P)";
    }
    if (input.consume("mouse")) {
      mouseSteer = !mouseSteer;
      mouseCheck.checked = mouseSteer;
    }

    if (paused) {
      renderer.render(state, wind, 0);
      updateHud();
      return;
    }

    acc += dt;
    while (acc >= STEP) {
      var c = input.controls();
      var m = steeringToMouse();
      if (m !== 0) c.rudder = m;
      S.step(state, c, wind, STEP, config);
      acc -= STEP;
    }

    renderer.render(state, wind, dt);
    updateHud();
  }

  canvas.addEventListener("pointermove", function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  btnTack.addEventListener("click", tack);
  btnReset.addEventListener("click", reset);
  btnPause.addEventListener("click", function () {
    paused = !paused;
    btnPause.textContent = paused ? "Resume (P)" : "Pause (P)";
  });
  mouseCheck.addEventListener("change", function () {
    mouseSteer = mouseCheck.checked;
  });
  wspeedSlider.addEventListener("input", updateWind);
  wdirSlider.addEventListener("input", updateWind);

  updateWind();
  updateHud();
  requestAnimationFrame(loop);
})();
