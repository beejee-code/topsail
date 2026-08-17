(function (global) {
  "use strict";

  function createInput() {
    var keys = {};

    var KEYMAP = {
      ArrowLeft: "left",
      KeyA: "left",
      ArrowRight: "right",
      KeyD: "right",
      ArrowUp: "sailIn",
      KeyW: "sailIn",
      ArrowDown: "sailOut",
      KeyS: "sailOut",
      KeyT: "tack",
      KeyR: "reset",
      KeyP: "pause",
      KeyM: "mouse"
    };

    var actions = {
      tack: false,
      reset: false,
      pause: false,
      mouse: false
    };

    var touchRudder = 0;
    var touchSail = 0;

    window.addEventListener("keydown", function (e) {
      var mapped = KEYMAP[e.code];
      if (mapped) {
        keys[mapped] = true;
        if (mapped === "tack" || mapped === "reset" || mapped === "pause" || mapped === "mouse") {
          actions[mapped] = true;
        }
        e.preventDefault();
      }
    });

    window.addEventListener("keyup", function (e) {
      var mapped = KEYMAP[e.code];
      if (mapped) keys[mapped] = false;
    });

    function controls() {
      var rudder = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      var sail = (keys.sailOut ? 1 : 0) - (keys.sailIn ? 1 : 0);

      if (touchRudder !== 0) rudder = touchRudder;
      if (touchSail !== 0) sail = touchSail;

      return { rudder: rudder, sail: sail };
    }

    function consume(t) {
      var v = actions[t];
      actions[t] = false;
      return v;
    }

    return {
      controls: controls,
      consume: consume,
      setMouseSteer: function (v) { actions.mouse = v; },
      setTouchRudder: function (v) { touchRudder = Math.max(-1, Math.min(1, v)); },
      setTouchSail: function (v) { touchSail = Math.max(-1, Math.min(1, v)); }
    };
  }

  global.Input = { create: createInput };
})(typeof window !== "undefined" ? window : globalThis);
