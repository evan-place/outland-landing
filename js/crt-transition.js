(function (global) {
  "use strict";

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  var VERT = [
    "attribute vec2 a_pos;",
    "varying vec2 v_uv;",
    "void main() {",
    "  v_uv = a_pos * 0.5 + 0.5;",
    "  v_uv.y = 1.0 - v_uv.y;",
    "  gl_Position = vec4(a_pos, 0.0, 1.0);",
    "}",
  ].join("\n");

  var FRAG = [
    "precision mediump float;",
    "uniform sampler2D u_from;",
    "uniform sampler2D u_to;",
    "uniform float u_progress;",
    "uniform vec2 u_resolution;",
    "uniform float u_frameAspect;",
    "varying vec2 v_uv;",
    "",
    "vec2 coverUV(vec2 uv, float frameAspect) {",
    "  float viewAspect = u_resolution.x / u_resolution.y;",
    "  vec2 scale = vec2(1.0);",
    "  if (frameAspect > viewAspect) {",
    "    scale.x = frameAspect / viewAspect;",
    "  } else {",
    "    scale.y = viewAspect / frameAspect;",
    "  }",
    "  return clamp((uv - 0.5) / scale + 0.5, 0.002, 0.998);",
    "}",
    "",
    "void main() {",
    "  float t = u_progress;",
    "  vec2 uv = coverUV(v_uv, u_frameAspect);",
    "  float warp = sin(t * 3.14159265) * (0.5 + t * 0.55);",
    "  float edge = max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 2.0;",
    "  float innerLimit = mix(0.92, 0.28, smoothstep(0.0, 1.0, t));",
    "  float edgeMask = smoothstep(max(innerLimit - 0.24, 0.0), 1.0, edge);",
    "  edgeMask = edgeMask * edgeMask * (3.0 - 2.0 * edgeMask);",
    "  float distort = warp * edgeMask * 3.0;",
    "",
    "  vec2 c = uv - 0.5;",
    "  float r2 = dot(c, c);",
    "  float radial = pow(r2 * 4.0, 1.9);",
    "  float scale = 1.0 + distort * radial;",
    "  vec2 sampleUV = c / scale + 0.5;",
    "  sampleUV = coverUV(sampleUV, u_frameAspect);",
    "",
    "  vec4 fromCol = texture2D(u_from, sampleUV);",
    "  vec4 toCol = texture2D(u_to, sampleUV);",
    "",
    "  float mixAmt = smoothstep(0.08, 0.92, t);",
    "  vec4 col = mix(fromCol, toCol, mixAmt);",
    "",
    "  float vig = 1.0 - edgeMask * warp * 0.18;",
    "  col.rgb *= vig;",
    "",
    "  col.rgb -= sin((uv.y + t * 0.08) * u_resolution.y * 1.8) * 0.01 * warp * edgeMask;",
    "",
    "  gl_FragColor = col;",
    "}",
  ].join("\n");

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s));
    }
    return s;
  }

  global.STORY_FRAME_ASPECT = 989 / 1032;

  function CRTTransition(canvas) {
    this.canvas = canvas;
    this.gl =
      canvas.getContext("webgl", { alpha: false, antialias: false }) ||
      canvas.getContext("experimental-webgl");
    this.fallback = !this.gl;
    this.images = [];
    this._texCache = null;
    this.current = 0;
    this.animating = false;
    this.paused = false;
    this._dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    this._maxTex = 2048;
    this._aspects = [];
    this._frameAspect = global.STORY_FRAME_ASPECT;
    this._lastFrom = -1;
    this._lastTo = -1;
    this._lastT = -1;

    if (!this.fallback) {
      this._initGL();
    }
  }

  CRTTransition.prototype._initGL = function () {
    var gl = this.gl;
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    this.u = {
      from: gl.getUniformLocation(prog, "u_from"),
      to: gl.getUniformLocation(prog, "u_to"),
      progress: gl.getUniformLocation(prog, "u_progress"),
      resolution: gl.getUniformLocation(prog, "u_resolution"),
      frameAspect: gl.getUniformLocation(prog, "u_frameAspect"),
    };

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    var loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  };

  CRTTransition.prototype._imageAspect = function (img) {
    if (!img || !img.height) return 1;
    return img.width / img.height;
  };

  CRTTransition.prototype._sourceForTexture = function (img) {
    var max = this._maxTex;
    if (img.width <= max && img.height <= max) {
      return img;
    }

    var scale = max / Math.max(img.width, img.height);
    var w = Math.max(1, Math.round(img.width * scale));
    var h = Math.max(1, Math.round(img.height * scale));
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  };

  CRTTransition.prototype._buildTextureCache = function () {
    if (this.fallback || this._texCache) return;

    var gl = this.gl;
    var self = this;
    this._texCache = this.images.map(function (img) {
      var source = self._sourceForTexture(img);
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      return tex;
    });
  };

  CRTTransition.prototype.load = function (urls) {
    var self = this;
    return Promise.all(
      urls.map(function (url) {
        return new Promise(function (resolve, reject) {
          var img = new Image();
          img.onload = function () {
            resolve(img);
          };
          img.onerror = reject;
          img.src = url;
        });
      })
    ).then(function (imgs) {
      self.images = imgs;
      self._aspects = imgs.map(function (img) {
        return self._imageAspect(img);
      });
      self._frameAspect =
        self._aspects[0] || global.STORY_FRAME_ASPECT;
      self._texCache = null;
      self._lastFrom = -1;
      self._lastTo = -1;
      self._lastT = -1;
      self._buildTextureCache();
      if (imgs[0]) {
        self.blend(0, 0, 0);
      }
    });
  };

  CRTTransition.prototype.resize = function () {
    var stage = this.canvas.parentElement;
    if (!stage) return;
    var rect = stage.getBoundingClientRect();
    var w = Math.max(1, Math.floor(rect.width * this._dpr));
    var h = Math.max(1, Math.floor(rect.height * this._dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.canvas.style.width = rect.width + "px";
      this.canvas.style.height = rect.height + "px";
      if (!this.fallback) {
        this.gl.viewport(0, 0, w, h);
      }
      this._lastT = -1;
      if (this.images[this.current]) {
        this.blend(this.current, this.current, 0);
      }
    }
  };

  CRTTransition.prototype._coverDraw = function (ctx, img, alpha) {
    var cw = this.canvas.width;
    var ch = this.canvas.height;
    var ir = img.width / img.height;
    var cr = cw / ch;
    var dw, dh, dx, dy;
    if (ir > cr) {
      dh = ch;
      dw = dh * ir;
      dx = (cw - dw) / 2;
      dy = 0;
    } else {
      dw = cw;
      dh = dw / ir;
      dx = 0;
      dy = (ch - dh) / 2;
    }
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.globalAlpha = 1;
  };

  CRTTransition.prototype.blend = function (fromIndex, toIndex, progress, options) {
    options = options || {};
    progress = Math.max(0, Math.min(1, progress));
    fromIndex = Math.max(0, Math.min(fromIndex, this.images.length - 1));
    toIndex = Math.max(0, Math.min(toIndex, this.images.length - 1));

    var fromImg = this.images[fromIndex];
    var toImg = this.images[toIndex];
    if (!fromImg) return;

    if (toIndex === fromIndex || progress <= 0) {
      progress = 0;
      toIndex = fromIndex;
      toImg = fromImg;
    }

    var warpProgress = options.scrub ? progress : easeInOutCubic(progress);

    if (
      fromIndex === this._lastFrom &&
      toIndex === this._lastTo &&
      Math.abs(warpProgress - this._lastT) < 0.002
    ) {
      return;
    }

    this._lastFrom = fromIndex;
    this._lastTo = toIndex;
    this._lastT = warpProgress;

    if (this.fallback) {
      var ctx = this.canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this._coverDraw(ctx, fromImg, 1);
      if (progress > 0 && toImg) {
        this._coverDraw(ctx, toImg, warpProgress);
      }
      this.current = progress >= 1 ? toIndex : fromIndex;
      return;
    }

    this._buildTextureCache();

    var gl = this.gl;
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texCache[fromIndex]);
    gl.uniform1i(this.u.from, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._texCache[toIndex]);
    gl.uniform1i(this.u.to, 1);
    gl.uniform1f(this.u.progress, warpProgress);
    gl.uniform2f(this.u.resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.frameAspect, this._imageAspect(fromImg));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    this.current = progress >= 0.999 ? toIndex : fromIndex;
  };

  CRTTransition.prototype.pause = function () {
    this.paused = true;
  };

  CRTTransition.prototype.resume = function () {
    this.paused = false;
    this._lastT = -1;
  };

  global.CRTTransition = CRTTransition;
  global.easeInOutCubic = easeInOutCubic;
})(window);
