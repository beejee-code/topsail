(function (global) {
  "use strict";

  var TWO_PI = Math.PI * 2;
  var HALF_PI = Math.PI / 2;
  var DEG = Math.PI / 180;
  var MS_TO_KNOTS = 1.943844492;
  var KNOTS_TO_MS = 0.514444444;
  var AIR_DENSITY = 1.225;

  function normalizeAngle(a) {
    while (a > Math.PI) a -= TWO_PI;
    while (a < -Math.PI) a += TWO_PI;
    return a;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  var LUFF_ZERO = 8 * DEG;
  var LUFF_FULL = 20 * DEG;

  function luffFactor(alpha) {
    var attack = Math.abs(alpha);
    if (attack < LUFF_ZERO || attack > Math.PI - LUFF_ZERO) return 0;
    if (attack < LUFF_FULL) return (attack - LUFF_ZERO) / (LUFF_FULL - LUFF_ZERO);
    if (attack > Math.PI - LUFF_FULL) return (Math.PI - attack - LUFF_ZERO) / (LUFF_FULL - LUFF_ZERO);
    return 1;
  }

  function defaultConfig() {
    return {
      mass: 1200,
      length: 7,
      sailArea: 18,
      maxSailAngle: 85 * DEG,
      sailTrimRate: 1.2,
      liftMax: 1.8,
      dragSkin: 0.04,
      dragMax: 1.15,
      fwdDragLinear: 25,
      fwdDragQuadratic: 16,
      keelDragLinear: 2400,
      keelDragQuadratic: 26000,
      maxYawRate: 1.1,
      yawSpeedScale: 0.5,
      yawMinControl: 0.2,
      weathercock: 0.9,
      weathercockSpeed: 2.5
    };
  }

  function createState(initial) {
    var s = { x: 0, y: 0, heading: 0, vx: 0, vy: 0, sail: 18 * DEG, rudder: 0 };
    if (initial) {
      for (var k in initial) {
        if (Object.prototype.hasOwnProperty.call(initial, k)) s[k] = initial[k];
      }
    }
    return s;
  }

  function apparentWind(state, wind) {
    var wvx = Math.cos(wind.direction) * wind.speed - state.vx;
    var wvy = Math.sin(wind.direction) * wind.speed - state.vy;
    return {
      x: wvx,
      y: wvy,
      speed: Math.hypot(wvx, wvy),
      dir: Math.atan2(wvy, wvx)
    };
  }

  function analyze(state, wind, config) {
    var c = config || defaultConfig();
    var fwdX = Math.cos(state.heading);
    var fwdY = Math.sin(state.heading);
    var app = apparentWind(state, wind);
    var apparentAngle = normalizeAngle(Math.atan2(fwdX * app.y - fwdY * app.x, fwdX * app.x + fwdY * app.y));
    var windFrom = Math.abs(normalizeAngle(apparentAngle + Math.PI));
    var a = windFrom;
    var pointOfSail;
    if (a < 45 * DEG) pointOfSail = "no-go";
    else if (a < 75 * DEG) pointOfSail = "close-hauled";
    else if (a < 115 * DEG) pointOfSail = "beam-reach";
    else if (a < 150 * DEG) pointOfSail = "broad-reach";
    else pointOfSail = "running";

    var speed = Math.hypot(state.vx, state.vy);
    var fwdSpeed = state.vx * fwdX + state.vy * fwdY;
    var latSpeed = -state.vx * fwdY + state.vy * fwdX;
    var alpha = normalizeAngle(apparentAngle - state.sail);
    var attack = Math.abs(alpha);
    var luff = luffFactor(alpha);

    return {
      apparentAngle: apparentAngle,
      apparentDeg: apparentAngle / DEG,
      apparentSpeed: app.speed,
      apparentSpeedKn: app.speed * MS_TO_KNOTS,
      trueSpeedKn: wind.speed * MS_TO_KNOTS,
      speed: speed,
      speedKn: speed * MS_TO_KNOTS,
      fwdSpeed: fwdSpeed,
      latSpeed: latSpeed,
      pointOfSail: pointOfSail,
      sailDeg: state.sail / DEG,
      attackDeg: attack / DEG,
      alphaDeg: alpha / DEG,
      luffFactor: luff,
      luffing: luff < 0.15,
      leewayDeg: speed > 0.01 ? (latSpeed / speed) / DEG : 0
    };
  }

  function step(state, input, wind, dt, config) {
    var c = config || defaultConfig();
    dt = clamp(dt, 0, 0.05);

    state.sail = clamp(state.sail + (input.sail || 0) * c.sailTrimRate * dt, -c.maxSailAngle, c.maxSailAngle);

    var fwdX = Math.cos(state.heading);
    var fwdY = Math.sin(state.heading);
    var app = apparentWind(state, wind);
    var wSpeed = app.speed;
    var wDir = app.dir;
    var apparentAngle = normalizeAngle(Math.atan2(fwdX * app.y - fwdY * app.x, fwdX * app.x + fwdY * app.y));

    var alpha = normalizeAngle(apparentAngle - state.sail);
    var sin2 = Math.sin(2 * alpha);
    var cl = clamp(c.liftMax * sin2, -c.liftMax, c.liftMax) * luffFactor(alpha);
    var cd = c.dragSkin + c.dragMax * Math.pow(Math.sin(alpha), 2);

    var q = 0.5 * AIR_DENSITY * c.sailArea * wSpeed * wSpeed;
    var l1 = wDir + HALF_PI;
    var l2 = wDir - HALF_PI;
    var cosW = Math.cos(wDir);
    var sinW = Math.sin(wDir);
    var f1x = cl * Math.cos(l1) + cd * cosW;
    var f1y = cl * Math.sin(l1) + cd * sinW;
    var f2x = cl * Math.cos(l2) + cd * cosW;
    var f2y = cl * Math.sin(l2) + cd * sinW;
    var p1 = f1x * fwdX + f1y * fwdY;
    var p2 = f2x * fwdX + f2y * fwdY;
    var fSailX, fSailY;
    if (p1 >= p2) {
      fSailX = f1x; fSailY = f1y;
    } else {
      fSailX = f2x; fSailY = f2y;
    }
    fSailX *= q;
    fSailY *= q;

    var fwd = fSailX * fwdX + fSailY * fwdY;
    var lat = -fSailX * fwdY + fSailY * fwdX;

    var vf = state.vx * fwdX + state.vy * fwdY;
    var vl = -state.vx * fwdY + state.vy * fwdX;

    var fResistF = -(c.fwdDragLinear * vf + c.fwdDragQuadratic * vf * Math.abs(vf));
    var fResistL = -(c.keelDragLinear * vl + c.keelDragQuadratic * vl * Math.abs(vl));

    var axF = (fwd + fResistF) / c.mass;
    var axL = (lat + fResistL) / c.mass;

    var ax = axF * fwdX - axL * fwdY;
    var ay = axF * fwdY + axL * fwdX;

    state.vx += ax * dt;
    state.vy += ay * dt;
    state.x += state.vx * dt;
    state.y += state.vy * dt;

    var rudder = clamp(input.rudder || 0, -1, 1);
    var speedFactor = clamp(c.yawMinControl + c.yawSpeedScale * Math.abs(vf) / 3.0, 0, 1);
    state.heading += rudder * c.maxYawRate * speedFactor * dt;

    if (vf > 0.1) {
      var velDir = Math.atan2(state.vy, state.vx);
      var align = normalizeAngle(velDir - state.heading);
      var rate = c.weathercock * Math.pow(clamp(Math.hypot(state.vx, state.vy) / c.weathercockSpeed, 0, 1), 2);
      state.heading += align * rate * dt;
    }

    state.heading = normalizeAngle(state.heading);
    state.rudder = rudder;
  }

  var Sailing = {
    DEG: DEG,
    defaultConfig: defaultConfig,
    createState: createState,
    step: step,
    analyze: analyze,
    normalizeAngle: normalizeAngle,
    knotsToMs: function (k) { return k * KNOTS_TO_MS; },
    msToKnots: function (m) { return m * MS_TO_KNOTS; }
  };

  global.Sailing = Sailing;
  if (typeof module !== "undefined" && module.exports) module.exports = Sailing;
})(typeof window !== "undefined" ? window : globalThis);
