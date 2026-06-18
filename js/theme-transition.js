(function (global) {
  "use strict";

  var THEME_COLORS = {
    dark: { bg: [29, 28, 26] },
    light: { bg: [252, 252, 245] },
  };

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rgbStr(rgb) {
    return "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
  }

  function clamp01(t) {
    return Math.max(0, Math.min(1, t));
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function hash2(x, y, seed) {
    var n = Math.sin(x * 127.1 + y * 311.7 + seed * 43.17) * 43758.5453;
    return n - Math.floor(n);
  }

  function smoothstep(edge0, edge1, x) {
    var t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  }

  /**
   * Square-grid mask: new theme sits underneath, old-theme tiles
   * peel away to reveal content in snippets.
   */
  function ThemeTransition(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.active = false;
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this._squareGrid = null;
  }

  ThemeTransition.prototype.resize = function () {
    var w = window.innerWidth;
    var h = window.innerHeight;
    this.canvas.width = Math.floor(w * this._dpr);
    this.canvas.height = Math.floor(h * this._dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
  };

  ThemeTransition.prototype._buildSquareGrid = function (w, h) {
    var cellSize = Math.max(4, Math.round(Math.min(w, h) / 155));
    var cols = Math.ceil(w / cellSize);
    var rows = Math.ceil(h / cellSize);
    var deckRight = document.querySelector(".deck-right");
    var panelRect = deckRight ? deckRight.getBoundingClientRect() : null;
    var cells = [];

    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var x = col * cellSize;
        var y = row * cellSize;
        var size = Math.min(cellSize, w - x, h - y);
        if (size < 2) continue;

        var cx = x + size * 0.5;
        var cy = y + size * 0.5;
        var inPanel =
          panelRect &&
          cx >= panelRect.left &&
          cx <= panelRect.right &&
          cy >= panelRect.top &&
          cy <= panelRect.bottom;

        if (inPanel) continue;

        cells.push({
          x: x,
          y: y,
          size: size,
          order: hash2(col, row, 91.17),
        });
      }
    }

    this._squareGrid = cells;
  };

  ThemeTransition.prototype._drawSquareMask = function (ctx, t, maskBg, w, h) {
    if (!this._squareGrid) {
      this._buildSquareGrid(w, h);
    }

    var progress = easeInOutCubic(clamp01((t - 0.03) / 0.92));
    progress = Math.pow(progress, 0.7);
    var settle = t > 0.92 ? smoothstep(0.92, 1, t) : 0;
    if (settle > 0) {
      progress = lerp(progress, 1, settle);
    }

    ctx.fillStyle = rgbStr(maskBg);

    for (var i = 0; i < this._squareGrid.length; i++) {
      var cell = this._squareGrid[i];
      if (cell.order < progress) continue;
      ctx.fillRect(cell.x, cell.y, cell.size, cell.size);
    }
  };

  ThemeTransition.prototype.play = function (fromTheme, toTheme, onSwap) {
    var self = this;

    if (this.active) {
      return Promise.resolve();
    }

    if (this._reduceMotion) {
      onSwap();
      return Promise.resolve();
    }

    this.active = true;
    this.canvas.classList.add("is-active");
    this.canvas.style.opacity = "1";

    var maskBg = THEME_COLORS[fromTheme].bg;
    var duration = 1100;
    var w = window.innerWidth;
    var h = window.innerHeight;
    var htmlEl = document.documentElement;

    this._squareGrid = null;

    return new Promise(function (resolve) {
      var start = performance.now();

      htmlEl.setAttribute("data-theme-transitioning", "true");
      onSwap();

      function frame(now) {
        var t = Math.min(1, (now - start) / duration);
        var ctx = self.ctx;

        ctx.clearRect(0, 0, w, h);
        self._drawSquareMask(ctx, t, maskBg, w, h);

        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          ctx.clearRect(0, 0, w, h);
          self.canvas.style.opacity = "0";
          self.canvas.classList.remove("is-active");
          htmlEl.removeAttribute("data-theme-transitioning");
          self.active = false;
          resolve();
        }
      }

      requestAnimationFrame(frame);
    });
  };

  global.ThemeTransition = ThemeTransition;
})(window);
