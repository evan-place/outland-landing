(function () {
  "use strict";

  var STORY_BLOCKS = [];
  for (var i = 1; i <= 11; i++) {
    STORY_BLOCKS.push(
      "assets/story-blocks/" + String(i).padStart(2, "0") + ".webp"
    );
  }

  var html = document.documentElement;
  var body = document.body;
  var toggle = document.getElementById("theme-toggle");
  var storyCanvas = document.getElementById("story-canvas");
  var themeCanvas = document.getElementById("theme-canvas");

  var crt = new CRTTransition(storyCanvas);
  var themeFx = new ThemeTransition(themeCanvas);
  var scrollStory = new ScrollStory(crt, { count: 11 });

  function getTheme() {
    return html.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function applyTheme(theme) {
    html.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("outland-theme", theme);
    } catch (e) {
      /* ignore */
    }
  }

  function initTheme() {
    var saved = null;
    try {
      saved = localStorage.getItem("outland-theme");
    } catch (e) {
      /* ignore */
    }
    if (saved === "light" || saved === "dark") {
      applyTheme(saved);
      return;
    }
    applyTheme("dark");
  }

  function toggleTheme() {
    if (themeFx.active) return;

    scrollStory.pause();

    var next = getTheme() === "dark" ? "light" : "dark";
    var current = getTheme();

    themeFx.play(current, next, function () {
      applyTheme(next);
    }).then(function () {
      scrollStory.resume();
    });
  }

  function onResize() {
    crt.resize();
    themeFx.resize();
    scrollStory._onResize();
  }

  function onScrollHint() {
    if (window.scrollY > 40) {
      body.classList.add("has-scrolled");
    }
  }

  initTheme();

  crt.load(STORY_BLOCKS)
    .then(function () {
      crt.resize();
      scrollStory.start();
    })
    .catch(function (err) {
      console.error("Failed to load story blocks:", err);
    });

  toggle.addEventListener("click", toggleTheme);

  document.addEventListener("keydown", function (e) {
    if (e.key === "t" || e.key === "T") {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      toggleTheme();
    }
  });

  window.addEventListener("scroll", onScrollHint, { passive: true });
  window.addEventListener("resize", onResize);
  onResize();
})();
