(function (global) {
  "use strict";

  /**
   * Scroll-scrubbed story blocks with infinite loop (last → first).
   */
  function ScrollStory(crt, options) {
    this.crt = crt;
    this.count = (options && options.count) || 11;
    this.holdPortion = (options && options.holdPortion) != null ? options.holdPortion : 0;
    this.commitLocal = (options && options.commitLocal) != null ? options.commitLocal : 0.13;
    this.commitT = (options && options.commitT) != null ? options.commitT : 0.05;
    this.snapBackLocal = (options && options.snapBackLocal) != null ? options.snapBackLocal : 0.045;
    this.gestureMin = (options && options.gestureMin) != null ? options.gestureMin : 0.1;
    this.scrollEndDelay = (options && options.scrollEndDelay) != null ? options.scrollEndDelay : 400;
    this.snapDuration = (options && options.snapDuration) != null ? options.snapDuration : 480;
    this.index = 0;
    this.enabled = false;
    this._scrollEndTimer = null;
    this._snapAnim = 0;
    this._settling = false;
    this._programmaticScroll = false;
    this._gestureStartY = null;
    this._reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this._onScroll = this._onScroll.bind(this);
    this._onResize = this._onResize.bind(this);
  }

  ScrollStory.prototype._segmentHeight = function () {
    return window.innerHeight;
  };

  /** One full cycle = all images, including wrap 11 → 1 */
  ScrollStory.prototype._loopHeight = function () {
    return this.count * this._segmentHeight();
  };

  ScrollStory.prototype._normalizeIndex = function (index) {
    var n = this.count;
    return ((index % n) + n) % n;
  };

  ScrollStory.prototype._normalizeScrollY = function (scrollY) {
    var loopH = this._loopHeight();
    if (loopH <= 0) return 0;
    var y = scrollY == null ? window.scrollY : scrollY;
    if (y < 0) return 0;
    if (y >= loopH) return loopH - 1;
    return y;
  };

  ScrollStory.prototype._wrapScroll = function () {
    var loopH = this._loopHeight();
    var y = window.scrollY;
    if (y >= loopH) {
      this._programmaticScroll = true;
      window.scrollTo(0, 0);
      this._programmaticScroll = false;
      return 0;
    }
    return y;
  };

  ScrollStory.prototype._scrollTargetForIndex = function (index, currentY) {
    var segment = this._segmentHeight();
    var loopH = this._loopHeight();
    index = this._normalizeIndex(index);
    var targetY = index * segment;
    var wrapAfter = false;
    var state = this._readScroll(currentY);

    if (
      index === 0 &&
      state.from === this.count - 1 &&
      currentY > (this.count - 1) * segment + 1
    ) {
      targetY = loopH - 1;
      wrapAfter = true;
    } else if (
      index === this.count - 1 &&
      state.from === 0 &&
      state.local < 0.5 &&
      currentY < segment
    ) {
      targetY = 0;
      wrapAfter = "backward";
    }

    return { y: targetY, wrapAfter: wrapAfter };
  };

  ScrollStory.prototype._updateSpacer = function () {
    var spacer = document.getElementById("scroll-spacer");
    if (!spacer) return;
    // Extra segment so the final 11 → 1 transition has room to scroll through.
    spacer.style.height = this._loopHeight() + this._segmentHeight() + "px";
  };

  ScrollStory.prototype._easeScrollProgress = function (local) {
    return Math.pow(Math.max(0, Math.min(1, local)), 1.35);
  };

  ScrollStory.prototype._readScroll = function (scrollY) {
    var segment = this._segmentHeight();
    var loopH = this._loopHeight();
    var y = scrollY == null ? window.scrollY : scrollY;
    if (y < 0) y = 0;
    if (y > loopH) y = loopH;
    var floatIndex = y / segment;
    var from = Math.min(Math.floor(floatIndex), this.count - 1);
    var to = (from + 1) % this.count;
    var local = floatIndex - from;
    var hold = this._reduceMotion ? 0.35 : this.holdPortion;
    var t = 0;

    if (hold > 0 && local > hold) {
      t = this._easeScrollProgress((local - hold) / (1 - hold));
    } else if (hold <= 0) {
      t = this._easeScrollProgress(local);
    }

    t = Math.max(0, Math.min(1, t));

    return {
      from: from,
      to: to,
      t: t,
      index: t >= 0.995 ? to : from,
      floatIndex: floatIndex,
      local: local,
    };
  };

  ScrollStory.prototype._draw = function (scrollY) {
    var state = this._readScroll(scrollY);
    this.index = state.index;
    this.crt.blend(state.from, state.to, state.t, { scrub: true });
    return state;
  };

  ScrollStory.prototype._cancelSnapAnim = function () {
    if (this._snapAnim) {
      cancelAnimationFrame(this._snapAnim);
      this._snapAnim = 0;
    }
  };

  ScrollStory.prototype._snapToIndex = function (index, animated) {
    var rawY = window.scrollY;
    var target = this._scrollTargetForIndex(index, rawY);
    var targetY = target.y;
    var wrapAfter = target.wrapAfter;
    var currentY = rawY;

    if (Math.abs(currentY - targetY) < 2 && !wrapAfter) {
      this._draw(currentY);
      return;
    }

    this._cancelSnapAnim();

    if (!animated || this._reduceMotion) {
      this._programmaticScroll = true;
      window.scrollTo(0, targetY);
      if (wrapAfter === true) {
        window.scrollTo(0, 0);
      } else if (wrapAfter === "backward") {
        window.scrollTo(0, (this.count - 1) * this._segmentHeight());
      }
      this.crt._lastT = -1;
      this._draw();
      this._programmaticScroll = false;
      return;
    }

    var self = this;
    var startY = currentY;
    var delta = targetY - startY;
    var startTime = performance.now();
    var duration = this.snapDuration;

    this._settling = true;
    this._programmaticScroll = true;

    function finish() {
      if (wrapAfter === true) {
        window.scrollTo(0, 0);
      } else if (wrapAfter === "backward") {
        window.scrollTo(0, (self.count - 1) * self._segmentHeight());
      }
      self.crt._lastT = -1;
      self._draw();
      self._snapAnim = 0;
      self._settling = false;
      self._programmaticScroll = false;
    }

    function frame(now) {
      var p = Math.min(1, (now - startTime) / duration);
      var eased = 1 - Math.pow(1 - p, 3);
      window.scrollTo(0, startY + delta * eased);
      self._draw();

      if (p < 1) {
        self._snapAnim = requestAnimationFrame(frame);
      } else {
        finish();
      }
    }

    this._snapAnim = requestAnimationFrame(frame);
  };

  ScrollStory.prototype._inTransition = function (state) {
    return state.local >= this.commitLocal && state.t >= this.commitT;
  };

  ScrollStory.prototype._completeTransition = function (state) {
    this._gestureStartY = null;
    if (this._scrollEndTimer) {
      clearTimeout(this._scrollEndTimer);
      this._scrollEndTimer = null;
    }
    this._snapToIndex(state.to, true);
  };

  ScrollStory.prototype._resolveScrollEnd = function () {
    if (!this.enabled || this.crt.paused || this._settling) return;

    var segment = this._segmentHeight();
    var state = this._readScroll();
    var gestureDelta = 0;

    if (this._gestureStartY != null) {
      gestureDelta = this._normalizeScrollY(window.scrollY) - this._gestureStartY;
      if (gestureDelta > segment * 0.5) {
        gestureDelta -= segment;
      } else if (gestureDelta < -segment * 0.5) {
        gestureDelta += segment;
      }
    }

    this._gestureStartY = null;

    var gesturePortion = gestureDelta / segment;
    var backwardIntent =
      gesturePortion <= -this.gestureMin && state.t > 0.03;

    if (this._inTransition(state) && gestureDelta >= 0) {
      this._completeTransition(state);
    } else if (backwardIntent) {
      this._snapToIndex(state.from, true);
    } else if (state.local < this.snapBackLocal) {
      this._snapToIndex(state.from, true);
    } else {
      this._snapToIndex(state.from, true);
    }
  };

  ScrollStory.prototype._scheduleScrollEnd = function () {
    var self = this;
    if (this._scrollEndTimer) {
      clearTimeout(this._scrollEndTimer);
    }
    this._scrollEndTimer = setTimeout(function () {
      self._scrollEndTimer = null;
      self._resolveScrollEnd();
    }, this.scrollEndDelay);
  };

  ScrollStory.prototype._onScroll = function () {
    if (this._programmaticScroll) {
      this._draw();
      return;
    }

    if (this._settling) {
      this._cancelSnapAnim();
      this._settling = false;
    }
    if (this._gestureStartY == null) {
      this._gestureStartY = this._normalizeScrollY(window.scrollY);
    }
    this._wrapScroll();
    var state = this._draw();

    if (this._inTransition(state)) {
      this._completeTransition(state);
      return;
    }

    this._scheduleScrollEnd();
  };

  ScrollStory.prototype._onResize = function () {
    this._updateSpacer();
    this.crt._lastT = -1;
    this._wrapScroll();
    this._draw();
  };

  ScrollStory.prototype.start = function () {
    if (this.enabled) return;
    this.enabled = true;
    this._updateSpacer();
    window.scrollTo(0, this._normalizeScrollY(window.scrollY));
    window.addEventListener("scroll", this._onScroll, { passive: true });
    window.addEventListener("resize", this._onResize);
    this._draw();
  };

  ScrollStory.prototype.stop = function () {
    this.enabled = false;
    this._cancelSnapAnim();
    window.removeEventListener("scroll", this._onScroll);
    window.removeEventListener("resize", this._onResize);
    if (this._scrollEndTimer) {
      clearTimeout(this._scrollEndTimer);
      this._scrollEndTimer = null;
    }
  };

  ScrollStory.prototype.pause = function () {
    this.crt.pause();
  };

  ScrollStory.prototype.resume = function () {
    this.crt.resume();
    this._draw();
  };

  global.ScrollStory = ScrollStory;
})(window);
