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
  var dockCount = 0;
  var gameOver = false;

  var DOCK_SPEED = 2;
  var island = { x: 0, y: 0, radius: 10 };

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
  ["speed", "heading", "pos", "airflow", "hint", "message"].forEach(function (id) {
    el[id] = document.getElementById("stat-" + id) || document.getElementById(id);
  });

  var flowFill = document.getElementById("flow-fill");

  var navArrowIcon = document.getElementById("nav-arrow-icon");
  var navDistEl = document.getElementById("nav-arrow-dist");

  var windArrow = document.getElementById("wind-arrow");
  var windSpeedEl = document.getElementById("wind-speed");

  var wspeedSlider = document.getElementById("ctrl-wspeed");
  var wspeedVal = document.getElementById("ctrl-wspeed-val");
  var wdirSlider = document.getElementById("ctrl-wdir");
  var wdirVal = document.getElementById("ctrl-wdir-val");
  var mouseCheck = document.getElementById("ctrl-mouse");
  var btnTack = document.getElementById("btn-tack");
  var btnReset = document.getElementById("btn-reset");
  var btnPause = document.getElementById("btn-pause");

  var msgTimer = null;

  var touchControls = document.getElementById("touch-controls");
  var portraitMq = window.matchMedia ? window.matchMedia("(orientation: portrait)") : null;

  function isMobilePortrait() {
    if (!portraitMq) return false;
    var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    var touch = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
    return !!coarse && !!touch && portraitMq.matches;
  }

  function updateTouchControls() {
    if (!touchControls) return;
    touchControls.classList.toggle("active", isMobilePortrait());
  }

  if (portraitMq && portraitMq.addEventListener) portraitMq.addEventListener("change", updateTouchControls);
  window.addEventListener("resize", updateTouchControls);
  window.addEventListener("orientationchange", updateTouchControls);
  updateTouchControls();

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

  function spawnIsland() {
    var angle = Math.random() * Math.PI * 2;
    var dist = 300 + Math.random() * 200;
    island.x = state.x + Math.cos(angle) * dist;
    island.y = state.y + Math.sin(angle) * dist;
  }

  function checkIsland() {
    var dx = state.x - island.x;
    var dy = state.y - island.y;
    var dist = Math.hypot(dx, dy);
    if (dist >= island.radius) return;

    var speedKn = Math.hypot(state.vx, state.vy) * 1.943844492;
    if (speedKn < DOCK_SPEED) {
      dockCount++;
      showMessage("Docked! (" + dockCount + ")", 1800);
      spawnIsland();
    } else {
      dockCount = 0;
      showMessage("Shipwrecked!", 2000);
      state = S.createState(INITIAL);
      spawnIsland();
    }
  }

  function updateWind() {
    var deg = parseFloat(wdirSlider.value);
    wind.direction = (deg + 90) * DEG;
    wind.speed = S.knotsToMs(parseFloat(wspeedSlider.value));
    windSpeedEl.textContent = wspeedSlider.value;
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

    var hint = coachingHint(info);
    el.hint.textContent = hint;

    var flow = airflowQuality(info);
    el.airflow.textContent = flow.text;
    el.airflow.className = "flow-" + flow.cls;
    flowFill.style.width = flow.pct + "%";
    flowFill.className = "flowfill flow-" + flow.cls;

    var targetRot = bearing(wind.direction);
    windArrow.style.transform = "rotate(" + targetRot + "deg)";

    if (navArrowIcon && island) {
      var dx = island.x - state.x;
      var dy = island.y - state.y;
      var dist = Math.hypot(dx, dy);
      var deg = (Math.atan2(dy, dx) / DEG + 90 + 360) % 360;
      navArrowIcon.style.transform = "rotate(" + deg + "deg)";
      navDistEl.textContent = Math.round(dist) + " m";
    }
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
      renderer.render(state, wind, 0, island);
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

    checkIsland();
    renderer.render(state, wind, dt, island);
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

  var touchTack = document.getElementById("touch-tack");
  var touchReset = document.getElementById("touch-reset");
  if (touchTack) touchTack.addEventListener("click", tack);
  if (touchReset) touchReset.addEventListener("click", reset);

  function setupTouchControls() {
    var tillerEl = document.getElementById("touch-tiller");
    var tillerTrack = tillerEl ? tillerEl.querySelector(".touch-track") : null;
    var tillerThumb = document.getElementById("tiller-thumb");
    var sheetEl = document.getElementById("touch-sheet");
    var sheetTrack = sheetEl ? sheetEl.querySelector(".touch-track") : null;
    var sheetThumb = document.getElementById("sheet-thumb");
    if (!tillerTrack || !sheetTrack) return;

    var tillerTouchId = null;
    var sheetTouchId = null;

    function handleTiller(touch) {
      var rect = tillerTrack.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var val = Math.max(-1, Math.min(1, (touch.clientX - cx) / (rect.width / 2)));
      input.setTouchRudder(val);
      if (tillerThumb) tillerThumb.style.left = ((val + 1) / 2 * 100) + "%";
    }

    function handleSheet(touch) {
      var rect = sheetTrack.getBoundingClientRect();
      var cy = rect.top + rect.height / 2;
      var val = Math.max(-1, Math.min(1, (touch.clientY - cy) / (rect.height / 2)));
      input.setTouchSail(val);
      if (sheetThumb) sheetThumb.style.top = ((val + 1) / 2 * 100) + "%";
    }

    tillerTrack.addEventListener("touchstart", function (e) {
      e.preventDefault();
      tillerTouchId = e.changedTouches[0].identifier;
      handleTiller(e.changedTouches[0]);
      if (tillerThumb) tillerThumb.classList.add("active");
    }, { passive: false });

    sheetTrack.addEventListener("touchstart", function (e) {
      e.preventDefault();
      sheetTouchId = e.changedTouches[0].identifier;
      handleSheet(e.changedTouches[0]);
      if (sheetThumb) sheetThumb.classList.add("active");
    }, { passive: false });

    document.addEventListener("touchmove", function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === tillerTouchId) { e.preventDefault(); handleTiller(t); }
        else if (t.identifier === sheetTouchId) { e.preventDefault(); handleSheet(t); }
      }
    }, { passive: false });

    function releaseTiller() {
      tillerTouchId = null;
      input.setTouchRudder(0);
      if (tillerThumb) { tillerThumb.style.left = "50%"; tillerThumb.classList.remove("active"); }
    }

    function releaseSheet() {
      sheetTouchId = null;
      input.setTouchSail(0);
      if (sheetThumb) { sheetThumb.style.top = "50%"; sheetThumb.classList.remove("active"); }
    }

    document.addEventListener("touchend", function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === tillerTouchId) releaseTiller();
        else if (t.identifier === sheetTouchId) releaseSheet();
      }
    });

    document.addEventListener("touchcancel", function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === tillerTouchId) releaseTiller();
        else if (t.identifier === sheetTouchId) releaseSheet();
      }
    });
  }

  setupTouchControls();

  spawnIsland();
  updateWind();
  updateHud();
  requestAnimationFrame(loop);
})();
