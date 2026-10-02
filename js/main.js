/* ==========================================================================
   GAMAL SHERIDAN, PORTFOLIO
   main.js

   Each feature is an isolated module. Every module checks its own DOM
   before doing anything, so removing a section from the page does not
   break the rest of the script.

   Modules
   01 helpers
   02a preloader
   02  hero reveal (opening sequence)
   02b nav mark fold
   02c headline swap
   02e hero media slides
   02f statement split
   03 mobile menu
   04 video player (native <dialog>)
   05 archive folder ("More of my work")
   06 services crossfade
   07 logo wall
   08 copy email + toast
   08b footer wordmark (scroll-linked climb)
   08c about video band
   09 smooth scrolling for in-page links
   10 small things (year, broken images, menu close on resize)
   ========================================================================== */

(function () {
  'use strict';

  /* 01 HELPERS
     ---------------------------------------------------------------------- */
  const $  = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.prototype.slice.call((ctx || document).querySelectorAll(sel));

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce) and (min-width: 99999px)');
  const prefersReduced = () => reduceMotion.matches;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  /* Read a CSS time value ("720ms" or ".72s") as milliseconds. */
  const cssMs = (value, fallback) => {
    const v = String(value || '').trim();
    if (!v) return fallback;
    const n = parseFloat(v);
    if (isNaN(n)) return fallback;
    return v.endsWith('ms') ? n : n * 1000;
  };

  const toastEl = $('#toast');
  let toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2200);
  }


  /* 02a PRELOADER
     White cover. files/video/logo.mp4 plays once, centred; its last frame is
     the full final logo. The static SVG of that logo is shown at the same
     size and position, the video is hidden (no visible change), and the logo
     then flies up into the pill nav beside the name, shrinking as it goes
     while the teal wordmark is wiped off so only the mark lands.

     What waits for what:
       logo docks   -> Motion Polish starts (still hidden under the cover),
                       the cover lifts, the opening sequence plays (02 below)
       +850 ms      -> the pill has dropped in; the flying logo is swapped for
                       the real mark in the nav, pixel for pixel

     If the clip cannot play (missing, blocked, unsupported codec) the static
     logo fades in instead and the rest is unchanged. No cover at all for
     reduced motion, ?nopre, or no JS. A click or Escape fast-forwards it.
     ---------------------------------------------------------------------- */
  const Preloader = (function () {
    const root = document.documentElement;
    const pre = $('#pre');

    let resolveDocked;
    const docked = new Promise((r) => { resolveDocked = r; });

    /* Motion Polish is held back (manual start, see <head>) until the
       preloader has finished. Start it now, while the white cover still hides
       the page, and wait for it to stage the first screen. */
    function startMotion() {
      return new Promise((resolve) => {
        const mp = window.MotionPolish;
        const manual = window.MotionPolishConfig && window.MotionPolishConfig.manual;
        if (manual && mp && typeof mp.init === 'function' && !root.classList.contains('mp-loaded')) mp.init();
        const t0 = performance.now();
        (function poll() {
          if (root.classList.contains('mp-loaded') || performance.now() - t0 > 600) resolve();
          else requestAnimationFrame(poll);
        })();
      });
    }

    if (!pre || !window.GS_PRELOAD || prefersReduced()) {
      root.classList.remove('has-pre');
      if (pre) pre.remove();
      root.classList.add('mark-ready');
      startMotion().then(resolveDocked);
      return { docked };
    }

    const T = {
      load: 2500,       /* longest we wait for the clip and the logo to be ready */
      hold: 250,        /* the final logo rests before it moves */
      dock: 900,        /* flight up to the pill nav */
      handoff: 850      /* wait for the pill to drop in before swapping marks */
    };

    const video = $('#preVideo');
    const logo = $('#preLogo');
    const WORDMARK = '15.91%';       /* share of logo-final.svg below the mark (y 650 to 773 of 773) */

    let speed = 1;
    let finished = false;
    const live = new Set();
    const wait = (n) => new Promise((r) => setTimeout(r, n / speed));
    const frames2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    /* Web Animations helper: resolves when done, never rejects, and is
       registered so fastForward() can speed up whatever is in flight. */
    function play(el, keyframes, opts) {
      const a = el.animate(keyframes, Object.assign({ fill: 'forwards' }, opts, {
        duration: opts.duration / speed,
        delay: (opts.delay || 0) / speed
      }));
      live.add(a);
      const end = () => live.delete(a);
      a.finished.then(end, end);
      return a.finished.catch(() => {});
    }

    /* Play the clip once. Resolves true when it ended, false if it could not
       play (or stalled), so the caller can fall back to the still logo. */
    function playClip() {
      return new Promise((resolve) => {
        if (!video) { resolve(false); return; }
        let settled = false;
        const end = (ok) => { if (!settled) { settled = true; resolve(ok); } };
        video.addEventListener('ended', () => end(true), { once: true });
        /* Do not wait for the very end: some browsers flash black as a clip
           finishes. Hand over a few frames early and freeze on the last good frame. */
        const watch = () => {
          if (settled) return;
          if (video.currentTime >= (video.duration || 1.36) - 0.07) { video.pause(); end(true); return; }
          requestAnimationFrame(watch);
        };
        requestAnimationFrame(watch);
        video.addEventListener('error', () => end(false), { once: true });
        const p = video.play();
        if (p && p.catch) p.catch(() => end(false));
        /* a hidden tab pauses video: carry on from where it stopped when the visitor returns */
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden && !settled && video.paused && !video.ended) video.play().catch(() => end(false));
        });
        setTimeout(() => end(false), ((video.duration || 1.5) + 4) * 1000);
      });
    }

    /* The still logo takes over exactly where the clip's last frame is. */
    async function takeOver(clipPlayed) {
      if (clipPlayed) {
        logo.style.opacity = '1';
        await frames2();                              /* painted before the clip goes */
        video.style.visibility = 'hidden';
      } else {
        if (video) video.style.visibility = 'hidden';  /* never leave a half-played frame under the logo */
        await play(logo, [{ opacity: 0 }, { opacity: 1 }], { duration: 500 });
      }
    }

    /* FLIP: the flying logo is a clone of the still logo, pinned where it
       sits, then moved and scaled so its mark region lands on the nav slot.
       The wordmark is wiped off (clip-path) during the first half. The slot is
       measured with the pill's entry offset (it has not dropped in yet) removed. */
    async function dock() {
      const slot = $('#navMark');
      const pill = $('.pill-nav');
      const from = logo.getBoundingClientRect();
      const to = slot.getBoundingClientRect();
      let lift = 0;
      try { lift = -new DOMMatrix(getComputedStyle(pill).transform).m42; } catch (e) { /* none */ }

      const fly = document.createElement('div');
      fly.className = 'pre-fly';
      fly.style.cssText = 'left:' + from.left + 'px;top:' + from.top + 'px;width:' + from.width + 'px;height:' + from.height + 'px';
      const im = document.createElement('img');
      im.src = logo.currentSrc || logo.src;
      im.alt = '';
      fly.appendChild(im);
      document.body.appendChild(fly);
      logo.style.visibility = 'hidden';

      const k = to.width / from.width;
      const dx = to.left - from.left;
      const dy = (to.top + lift) - from.top;
      await play(fly, [
        { transform: 'translate(0,0) scale(1)', clipPath: 'inset(0 0 0 0)' },
        { clipPath: 'inset(0 0 ' + WORDMARK + ' 0)', offset: .5 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + k + ')', clipPath: 'inset(0 0 ' + WORDMARK + ' 0)' }
      ], { duration: T.dock, easing: 'cubic-bezier(.65,0,.2,1)' });
      return fly;
    }

    function fastForward() {
      if (speed > 1) return;
      speed = 6;
      live.forEach((a) => { a.playbackRate = speed; });
      if (video && !video.ended) video.playbackRate = 6;
    }
    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') fastForward(); };
    pre.addEventListener('pointerdown', fastForward);
    document.addEventListener('keydown', onKey);

    /* While the cover is up, nothing under it should take focus or clicks. */
    const behind = $$('.site-head, main, .foot');
    const setInert = (on) => behind.forEach((n) => { n.inert = on; });

    function cleanup() {
      finished = true;
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('is-locked');
      setInert(false);
    }

    async function run() {
      document.body.classList.add('is-locked');
      setInert(true);

      /* clip buffered and logo decoded before anything moves (2.5 s cap) */
      const clipReady = new Promise((r) => {
        if (!video || video.readyState >= 3) { r(); return; }
        video.addEventListener('canplaythrough', r, { once: true });
        video.addEventListener('error', r, { once: true });
      });
      const logoReady = logo.decode ? logo.decode().catch(() => {}) : Promise.resolve();
      await Promise.race([Promise.all([clipReady, logoReady]), new Promise((r) => setTimeout(r, T.load))]);

      const played = await playClip();
      await takeOver(played);
      await wait(T.hold);
      const fly = await dock();

      await startMotion();            /* Motion Polish starts here, under the cover */
      pre.remove();                   /* white on white, nothing visible changes */
      cleanup();
      root.classList.add('is-docked');
      resolveDocked();                /* opening sequence starts now */

      await wait(T.handoff);          /* pill nav has dropped in around the slot */
      root.classList.add('mark-ready');
      fly.remove();
    }

    /* If anything throws, never trap the visitor behind the cover. */
    function recover() {
      if (finished) return;
      cleanup();
      $$('.pre-fly').forEach((n) => n.remove());
      if (pre.parentNode) pre.remove();
      root.classList.add('mark-ready', 'is-docked');
      startMotion().then(resolveDocked);
    }
    run().catch((err) => { if (window.console) console.warn('preloader:', err); recover(); });
    setTimeout(recover, 15000);

    return { docked };
  })();


  /* 02 HERO REVEAL (opening sequence)
     One orchestrated moment. The headline lines are translated out of view in
     CSS; adding .is-ready to <html> lets the pill nav drop in, the lines rise
     in sequence, the intro fade up, the stats hairline draw and the three
     stats and the ticker follow. It starts when the preloader's mark has
     docked (Preloader.docked) and fonts are ready, so lines do not reflow
     mid-animation. The photo reveals when it is on screen AND the sequence
     has started. Boot.ready / Boot.revealed let later modules start on cue.
     ---------------------------------------------------------------------- */
  const Boot = (function heroReveal() {
    const photo = $('#heroPhoto');
    let ready = false, readyAt = 0, seen = false, shown = false;
    let resolveReady, resolveRevealed;
    const readyP = new Promise((r) => { resolveReady = r; });
    const revealedP = new Promise((r) => { resolveRevealed = r; });

    function maybeReveal() {
      if (shown || !ready || !seen || !photo) return;
      shown = true;
      /* if the photo is on screen at load, let the hero finish its beats
         first; if it arrives later by scrolling, reveal at once */
      const wait = prefersReduced() ? 0 : Math.max(0, 1050 - (performance.now() - readyAt));
      setTimeout(() => { photo.classList.add('is-revealed'); resolveRevealed(); }, wait);
    }

    function go() {
      if (ready) return;
      ready = true;
      readyAt = performance.now();
      requestAnimationFrame(() => document.documentElement.classList.add('is-ready'));
      resolveReady();
      maybeReveal();
    }

    const fonts = (document.fonts && document.fonts.ready)
      ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))])   /* safety net if the font request stalls */
      : Promise.resolve();
    Promise.all([fonts, Preloader.docked]).then(go);

    if (!photo) { readyP.then(resolveRevealed); return { ready: readyP, revealed: revealedP }; }
    if (prefersReduced() || !('IntersectionObserver' in window)) { seen = true; maybeReveal(); }
    else {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((en) => en.isIntersecting)) { seen = true; maybeReveal(); io.disconnect(); }
      }, { threshold: 0.02 });
      io.observe(photo);
    }
    return { ready: readyP, revealed: revealedP };
  })();


  /* 02b NAV MARK FOLD
     Past the hero, the name "Gamal Sheridan" collapses so only the mark
     stays in the pill; back at the top it unfolds. The name's open width is
     measured into --name-w so max-width can transition to and from 0.
     ---------------------------------------------------------------------- */
  (function navFold() {
    const pill = $('.pill-nav');
    const name = $('#navName');
    const hero = $('#top');
    if (!pill || !name || !hero) return;

    const measure = () => {
      const inner = name.firstElementChild;
      if (inner) name.style.setProperty('--name-w', Math.ceil(inner.scrollWidth) + 'px');
    };
    measure();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    window.addEventListener('resize', measure);

    if (!('IntersectionObserver' in window)) return;
    /* the hero counts as left once its bottom edge passes the pill (72px) */
    const io = new IntersectionObserver((entries) => {
      pill.classList.toggle('is-folded', !entries[entries.length - 1].isIntersecting);
    }, { rootMargin: '-72px 0px 0px 0px', threshold: 0 });
    io.observe(hero);
  })();


  /* 02c HEADLINE SWAP
     Every 5.2 s the two halves of the headline trade places. Each line rolls
     up and out while its replacement rolls in from below, 90 ms behind it;
     the four lines are staggered 90 ms apart as well. The sentence is
     labelled on the <h1> (aria-label) and the halves are aria-hidden, so
     assistive tech reads one stable headline. Pauses while the hero is off
     screen or the tab is hidden; off for reduced motion.
     ---------------------------------------------------------------------- */
  (function headlineSwap() {
    const title = $('#heroTitle');
    if (!title || !title.animate || prefersReduced()) return;
    const left = $$('.hero__side--l .hero__line', title);
    const right = $$('.hero__side--r .hero__line', title);
    if (!left.length || left.length !== right.length) return;

    const lines = left.concat(right);               /* reading order, same as the load animation */
    const INTERVAL = 5200, STAGGER = 90, OUT = 700, IN = 850;
    const EASE = 'cubic-bezier(.65,0,.2,1)';
    let timer = 0, enabled = false, inView = true;

    function swap() {
      const half = left.length;
      const next = lines.map((_, i) => lines[(i + half) % lines.length].firstElementChild.textContent);
      lines.forEach((line, i) => {
        const out = line.firstElementChild;
        const inc = out.cloneNode(false);
        inc.textContent = next[i];
        line.appendChild(inc);                      /* the line is a one-cell grid, so the two stack */
        const delay = i * STAGGER;
        const a = out.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-110%)' }],
          { duration: OUT, delay: delay, easing: EASE, fill: 'forwards' });
        const b = inc.animate([{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }],
          { duration: IN, delay: delay + STAGGER, easing: EASE, fill: 'both' });
        a.finished.then(() => out.remove(), () => out.remove());
        b.finished.then(() => b.cancel(), () => {});
      });
    }

    const play = () => { if (enabled && inView && !document.hidden && !timer) timer = setTimeout(tick, INTERVAL); };
    const stop = () => { clearTimeout(timer); timer = 0; };
    const tick = () => { timer = 0; swap(); play(); };

    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : play()));
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        inView = entries.some((en) => en.isIntersecting);
        if (inView) play(); else stop();
      }, { threshold: 0.1 }).observe(title);
    }
    Boot.ready.then(() => setTimeout(() => { enabled = true; play(); }, 1400));   /* after the opening sequence settles */
  })();


  /* 02e HERO MEDIA SLIDES
     Four slides (the award photo and three project stills) crossfade every
     6 s. The incoming slide fades in on top and settles from a slight zoom
     (CSS), while the caption fades out and back in with new text. Starts once
     the photo has revealed; pauses off screen or on a hidden tab; reduced
     motion keeps the first slide.
     ---------------------------------------------------------------------- */
  (function heroSlides() {
    const wrap = $('#heroSlides');
    const cap = $('#heroCaption');
    if (!wrap) return;
    const slides = $$('.slide', wrap);
    if (slides.length < 2 || prefersReduced()) return;

    const HOLD = 6000, FADE = 1300;
    const capText = cap && cap.firstElementChild;
    let i = 0, timer = 0, started = false, visible = false;

    const decoded = (slide) => {
      const im = $('img', slide);
      const cap1500 = new Promise((r) => setTimeout(r, 1500));
      return Promise.race([im && im.decode ? im.decode().catch(() => {}) : Promise.resolve(), cap1500]);
    };

    function show(n) {
      const from = slides[i], to = slides[n];
      from.classList.remove('is-active');
      from.classList.add('is-leaving');             /* stays opaque underneath the incoming slide */
      from.setAttribute('aria-hidden', 'true');
      to.classList.add('is-active');
      to.removeAttribute('aria-hidden');
      i = n;
      setTimeout(() => from.classList.remove('is-leaving'), FADE + 100);
      if (cap && capText) {
        cap.classList.add('is-swapping');
        setTimeout(() => { capText.textContent = to.dataset.caption || ''; cap.classList.remove('is-swapping'); }, 450);
      }
    }

    function advance() {
      timer = 0;
      const n = (i + 1) % slides.length;
      decoded(slides[n]).then(() => { show(n); schedule(); });
    }
    function schedule() { if (started && visible && !document.hidden && !timer) timer = setTimeout(advance, HOLD); }
    function halt() { clearTimeout(timer); timer = 0; }

    document.addEventListener('visibilitychange', () => (document.hidden ? halt() : schedule()));
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        visible = entries.some((en) => en.isIntersecting);
        if (visible) schedule(); else halt();
      }, { threshold: 0.15 }).observe(wrap);
    } else { visible = true; }
    Boot.revealed.then(() => { started = true; schedule(); });
  })();


  /* 02f STATEMENT SPLIT
     "when a project needs / more than a plugin." starts as one line. When it
     scrolls into view the right half slides away until it sits flush with the
     right edge of the paragraph. The distance is measured from layout
     (offsetLeft ignores transforms), so it is right at any width and when the
     two halves wrap onto separate lines. Pushed back below the fold, it
     rejoins, so it replays. Reduced motion leaves the sentence joined.
     ---------------------------------------------------------------------- */
  (function statementSplit() {
    const text = $('.statement__text');
    const row = $('#statementSplit');
    const right = row && $('.statement__split-r', row);
    if (!text || !right || prefersReduced() || !('IntersectionObserver' in window)) return;

    const measure = () => {
      const dx = Math.max(0, text.clientWidth - (right.offsetLeft + right.offsetWidth));
      row.style.setProperty('--split-x', dx + 'px');
    };
    let raf = 0;
    window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    measure();

    new IntersectionObserver((entries) => {
      const en = entries[entries.length - 1];
      if (en.isIntersecting) { measure(); row.classList.add('is-split'); }
      else if (en.boundingClientRect.top > 0) row.classList.remove('is-split');
    }, { rootMargin: '0px 0px -30% 0px', threshold: 0 }).observe(row);
  })();


  /* 03 MOBILE MENU
     ---------------------------------------------------------------------- */
  const Menu = (function () {
    const burger = $('#burger');
    const menu = $('#mobileMenu');
    if (!burger || !menu) return { close() {} };

    let open = false;

    function setOpen(next) {
      open = next;
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (open) {
        menu.hidden = false;
        void menu.offsetWidth;                 /* flush so the transition runs */
        menu.classList.add('is-open');
        document.body.classList.add('is-locked');
        const first = $('a', menu);
        if (first) first.focus({ preventScroll: true });
      } else {
        menu.classList.remove('is-open');
        document.body.classList.remove('is-locked');
        setTimeout(() => { if (!open) menu.hidden = true; }, 260);
        burger.focus({ preventScroll: true });
      }
    }

    burger.addEventListener('click', () => setOpen(!open));
    $$('a', menu).forEach((a) => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && open) setOpen(false);
    });

    return { close: () => { if (open) setOpen(false); } };
  })();


  /* 04 VIDEO PLAYER
     Native <dialog>. The iframe is created on open and destroyed on close
     so audio never continues behind a closed player. Browsers without
     showModal() fall back to opening YouTube in a new tab, and so does a
     page opened straight from disk (file://): YouTube refuses to play an
     embed that arrives with no referrer (Error 153), and file:// has none.
     ---------------------------------------------------------------------- */
  (function player() {
    const dlg = $('#player');
    const frame = $('#playerFrame');
    const title = $('#playerTitle');
    const closeBtn = $('#playerClose');
    const triggers = $$('[data-video]');
    if (!triggers.length) return;

    function openVideo(id, name) {
      if (!dlg || typeof dlg.showModal !== 'function' || location.protocol === 'file:') {
        window.open('https://www.youtube.com/watch?v=' + encodeURIComponent(id), '_blank', 'noopener');
        return;
      }
      title.textContent = name;
      frame.innerHTML =
        '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) +
        '?autoplay=1&rel=0&playsinline=1" title="' + esc(name) + '" ' +
        'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ' +
        'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
      dlg.showModal();
      document.body.classList.add('is-locked');
    }

    triggers.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openVideo(btn.dataset.video, btn.dataset.name || 'Video');
      });
    });

    if (!dlg) return;
    dlg.addEventListener('close', () => {
      frame.innerHTML = '';
      document.body.classList.remove('is-locked');
    });
    if (closeBtn) closeBtn.addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => {         /* click on the backdrop closes */
      if (e.target === dlg) dlg.close();
    });
  })();


  /* 05 ARCHIVE FOLDER
     <details> works on its own. This adds a height animation on open and
     close using the Web Animations API, and skips it for reduced motion.
     ---------------------------------------------------------------------- */
  (function archive() {
    const details = $('#archive');
    if (!details || !details.animate) return;
    const summary = $('summary', details);
    const panel = $('.archive__panel', details);
    if (!summary || !panel) return;

    let animating = false;
    const EASE = 'cubic-bezier(.2,.9,.25,1)';

    function openIt() {
      animating = true;
      details.open = true;
      const h = panel.scrollHeight;
      const a = panel.animate(
        [{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }],
        { duration: 460, easing: EASE }
      );
      a.onfinish = () => { animating = false; };
    }

    function closeIt() {
      animating = true;
      const h = panel.scrollHeight;
      const a = panel.animate(
        [{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }],
        { duration: 340, easing: EASE }
      );
      a.onfinish = () => { details.open = false; animating = false; };
    }

    summary.addEventListener('click', (e) => {
      e.preventDefault();
      if (animating) return;
      if (prefersReduced()) { details.open = !details.open; return; }
      details.open ? closeIt() : openIt();
    });
  })();


  /* 06 SERVICES CROSSFADE
     Hover, focus or tap a row to make it the active one: it turns black while
     its siblings go grey (CSS), and in the same moment the picture and the
     tool list crossfade to match. Pictures are resolved up front (primary
     src, else data-fallback) so both layers can fade on the same frame; if a
     picture is slow, the tools still move at once and the picture follows.
     ---------------------------------------------------------------------- */
  (function services() {
    const list = $('#servicesList');
    const frame = $('.services__frame');
    const box = $('#servicesToolsBox');
    const firstImg = $('#servicesImg');
    if (!list || !frame || !box || !firstImg) return;

    const FADE = 450;
    const EASE = 'cubic-bezier(.2,.9,.25,1)';
    let current = $('li.is-active', list) || $('li', list);
    let front = firstImg;                           /* the visible image layer */
    let token = 0;                                  /* newest hover wins */

    const load = (src) => new Promise((res) => {
      const im = new Image();
      im.onload = () => res(true);
      im.onerror = () => res(false);
      im.src = src;
    });
    const cache = new Map();
    function resolveSrc(btn) {
      const key = btn.dataset.img;
      if (!cache.has(key)) {
        cache.set(key, load(key).then((ok) => {
          if (ok) return key;
          const fb = btn.dataset.fallback;
          return fb ? load(fb).then((ok2) => (ok2 ? fb : null)) : null;
        }));
      }
      return cache.get(key);
    }

    function swapImage(src) {
      frame.classList.toggle('is-missing', !src);
      if (!src) { $$('img', frame).forEach((im) => im.classList.remove('is-on')); return; }
      if (front.getAttribute('src') === src) { front.classList.add('is-on'); return; }
      const back = document.createElement('img');
      back.alt = '';
      back.decoding = 'async';
      back.src = src;
      frame.appendChild(back);
      void back.offsetWidth;                        /* commit the hidden state so the fade runs */
      back.classList.add('is-on');
      front.classList.remove('is-on');
      const old = front;
      front = back;
      setTimeout(() => { if (old !== front) old.remove(); }, FADE + 400);
    }

    function swapTools(spec) {
      const items = String(spec || '').split('|').map((s) => s.trim()).filter(Boolean);
      const old = box.lastElementChild;
      const next = document.createElement('ul');
      next.className = 'services__tools';
      next.innerHTML = items.map((t) => '<li>' + esc(t) + '</li>').join('');
      box.appendChild(next);                        /* grid-stacked over the old list */
      if (next.animate && !prefersReduced()) {
        next.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: FADE, easing: EASE });
        if (old) {
          const a = old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px)' }],
            { duration: FADE * .8, easing: EASE, fill: 'forwards' });
          a.finished.then(() => old.remove(), () => old.remove());
        }
      } else if (old) { old.remove(); }
    }

    /* a row with data-embed shows a live iframe (e.g. a Street View
       panorama) over its picture; built on first use and kept, so going
       back to that row does not reload it */
    const embeds = new Map();
    function swapEmbed(btn) {
      const url = btn.dataset.embed;
      embeds.forEach((el, key) => el.classList.toggle('is-on', key === url));
      if (!url || embeds.has(url)) return;
      const el = document.createElement('iframe');
      el.src = url;
      el.title = btn.dataset.embedTitle || 'Embedded view';
      el.loading = 'lazy';
      el.allowFullscreen = true;
      el.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.appendChild(el);
      embeds.set(url, el);
      void el.offsetWidth;                          /* commit the hidden state so the fade runs */
      el.classList.add('is-on');
    }

    async function activate(li) {
      if (!li || li === current) return;
      const prev = $('button', current);
      if (prev) prev.removeAttribute('aria-current');
      current.classList.remove('is-active');        /* old row greys out ... */
      li.classList.add('is-active');                /* ... new row turns black */
      current = li;
      const btn = $('button', li);
      if (!btn) return;
      btn.setAttribute('aria-current', 'true');
      swapEmbed(btn);

      const mine = ++token;
      /* give the picture up to 250 ms so picture and tools start on one frame */
      let src = await Promise.race([resolveSrc(btn), new Promise((r) => setTimeout(() => r(undefined), 250))]);
      if (mine !== token) return;
      swapTools(btn.dataset.tools);
      if (src === undefined) { src = await resolveSrc(btn); if (mine !== token) return; }
      swapImage(src);
    }

    /* while a live embed is showing, hovering another row only takes over
       after the pointer rests there, so crossing rows on the way to the
       panorama does not swap it out; click and focus stay instant */
    const EMBED_DWELL = 700;
    let pending = 0;
    const hasEmbed = () => { const b = $('button', current); return !!(b && b.dataset.embed); };

    $$('li', list).forEach((li) => {
      const btn = $('button', li);
      if (!btn) return;
      btn.addEventListener('pointerenter', () => {
        clearTimeout(pending);
        if (hasEmbed() && li !== current) pending = setTimeout(() => activate(li), EMBED_DWELL);
        else activate(li);
      });
      btn.addEventListener('pointerleave', () => clearTimeout(pending));
      btn.addEventListener('focus', () => activate(li));
      btn.addEventListener('click', () => activate(li));
    });

    /* warm every picture once the page is idle, so the first hover is instant */
    const warm = () => $$('button', list).forEach((b) => resolveSrc(b));
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 3000 });
    else setTimeout(warm, 1500);
  })();


  /* 07 LOGO WALL
     Nine assets are declared once in the HTML (#logo1 to #logo9). This
     builds a row of slots and runs a wave across it: each slot rolls its
     logo up and out while the next rolls in from below, staggered left to
     right. Timing is read from the CSS custom properties on .wall so the
     stylesheet is the single place to tune it.

     Rules:
       slots must be fewer than assets, so every wave changes every slot
       and no two slots show the same logo at once
       paused while hovered, while off screen, and while the tab is hidden
       static grid instead when motion is reduced or assets are too few
     ---------------------------------------------------------------------- */
  (function wall() {
    const root = $('#wall');
    const row = $('#wallRow');
    const source = $('#wallSource');
    if (!root || !row || !source) return;

    const assets = $$('img', source).map((el) => ({
      src: el.getAttribute('src'),
      alt: el.getAttribute('alt') || '',
      final: el.classList.contains('is-final')
    }));
    if (assets.length < 3) return;                /* static grid is already showing */

    let slots = [];
    let slotCount = 0;
    let wave = 0;
    let timer = null;
    let hovered = false;
    let visible = false;
    let timing = readTiming();

    function readTiming() {
      const cs = getComputedStyle(root);
      return {
        slots:    parseInt(cs.getPropertyValue('--wall-slots'), 10) || 5,
        interval: cssMs(cs.getPropertyValue('--wall-interval'), 3400),
        roll:     cssMs(cs.getPropertyValue('--wall-roll'), 720),
        stagger:  cssMs(cs.getPropertyValue('--wall-stagger'), 120)
      };
    }

    /* Slot i on wave k shows asset (i + k * slotCount) mod n, so reading
       left to right, wave after wave, the marks always appear in the order
       they are listed in the HTML (1 to 7, then the final). Because
       slotCount < n, no two visible slots ever hold the same mark. */
    const assetFor = (slot, k) => assets[(slot + k * slotCount) % assets.length];

    function makeLogo(asset) {
      const wrap = document.createElement('div');
      wrap.className = 'wall__logo' + (asset.final ? ' is-final' : '');
      const img = document.createElement('img');
      img.src = asset.src;
      img.alt = asset.alt;
      img.decoding = 'async';
      wrap.appendChild(img);
      return wrap;
    }

    function build() {
      stop();
      timing = readTiming();
      slotCount = Math.min(timing.slots, assets.length - 1);
      row.style.removeProperty('--wall-slots');
      if (slotCount !== timing.slots) row.style.setProperty('--wall-slots', slotCount);

      row.innerHTML = '';
      slots = [];
      wave = 0;
      for (let i = 0; i < slotCount; i++) {
        const slot = document.createElement('div');
        slot.className = 'wall__slot';
        slot.appendChild(makeLogo(assetFor(i, 0)));
        row.appendChild(slot);
        slots.push(slot);
      }
      source.hidden = true;
      row.removeAttribute('aria-hidden');
      row.setAttribute('role', 'img');
      row.setAttribute('aria-label', 'Rotating wall of ' + assets.length + ' logos');
      maybeStart();
    }

    function teardownToStatic() {
      stop();
      row.innerHTML = '';
      row.setAttribute('aria-hidden', 'true');
      row.removeAttribute('role');
      row.removeAttribute('aria-label');
      source.hidden = false;
    }

    function swap(slot, asset) {
      const old = $('.wall__logo:not(.is-leaving)', slot);
      const next = makeLogo(asset);
      next.classList.add('is-entering');
      slot.classList.add('is-pulsing');

      if (old) {
        old.classList.add('is-leaving');
        const removeOld = () => { if (old.parentNode) old.remove(); };
        old.addEventListener('animationend', removeOld, { once: true });
        setTimeout(removeOld, timing.roll + 120);   /* in case animationend never fires */
      }

      slot.appendChild(next);
      const settle = () => {
        next.classList.remove('is-entering');
        slot.classList.remove('is-pulsing');
      };
      next.addEventListener('animationend', settle, { once: true });
      setTimeout(settle, timing.roll + 120);
    }

    function runWave() {
      wave += 1;
      slots.forEach((slot, i) => {
        setTimeout(() => swap(slot, assetFor(i, wave)), i * timing.stagger);
      });
    }

    function start() {
      if (timer) return;
      timer = setInterval(runWave, timing.interval);
    }
    function stop() {
      clearInterval(timer);
      timer = null;
    }
    function maybeStart() {
      if (visible && !hovered && !document.hidden && !prefersReduced()) start();
      else stop();
    }

    /* Pause while hovered so a logo can be read in colour. */
    row.addEventListener('pointerenter', () => { hovered = true; maybeStart(); });
    row.addEventListener('pointerleave', () => { hovered = false; maybeStart(); });

    /* Only animate while on screen. */
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        visible = entries.some((en) => en.isIntersecting);
        maybeStart();
      }, { threshold: 0.2 });
      io.observe(root);
    } else {
      visible = true;
    }

    document.addEventListener('visibilitychange', maybeStart);

    /* Rebuild when the slot count changes with the viewport, or when the
       motion preference changes. */
    const narrow = window.matchMedia('(max-width: 900px)');
    const onLayoutChange = () => {
      if (prefersReduced()) { teardownToStatic(); return; }
      build();
    };
    if (narrow.addEventListener) narrow.addEventListener('change', onLayoutChange);
    else if (narrow.addListener) narrow.addListener(onLayoutChange);
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onLayoutChange);
    else if (reduceMotion.addListener) reduceMotion.addListener(onLayoutChange);

    if (prefersReduced()) teardownToStatic();
    else build();
  })();


  /* 08 COPY EMAIL + TOAST
     ---------------------------------------------------------------------- */
  (function copyMail() {
    const btn = $('#copyMail');
    if (!btn) return;
    const ADDRESS = 'gamal.1984.sheridan@gmail.com';

    const ok = () => toast('Email address copied');
    const fail = () => toast('Could not copy, select it manually');

    function legacy() {
      try {
        const ta = document.createElement('textarea');
        ta.value = ADDRESS;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:absolute;left:-9999px';
        document.body.appendChild(ta);
        ta.select();
        const done = document.execCommand('copy');
        document.body.removeChild(ta);
        done ? ok() : fail();
      } catch (err) { fail(); }
    }

    btn.addEventListener('click', () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ADDRESS).then(ok, legacy);
      } else {
        legacy();
      }
    });
  })();


  /* 08b FOOTER WORDMARK
     Two jobs. First, scale the giant wordmark so it spans the viewport edge to
     edge in whatever typeface actually loaded. Second, make it climb: it sits
     below the crop line (the overflow:hidden mask, .foot__crop) and rises out
     of it as the bottom of the page nears. --wm runs 0 to 1 over the last
     stretch of scroll and CSS turns it into a translate. Reduced motion
     leaves it at rest.
     ---------------------------------------------------------------------- */
  (function wordmark() {
    const el = $('#wordmark');
    const inner = el && $('span', el);
    if (!el || !inner) return;

    function fit() {
      el.style.fontSize = '100px';
      const textW = inner.getBoundingClientRect().width;
      const boxW = el.clientWidth;
      if (textW > 0 && boxW > 0) el.style.fontSize = (100 * boxW / textW).toFixed(2) + 'px';
    }

    const crop = el.parentElement;                  /* the overflow:hidden mask, flush with the end of the page */
    let ticking = false;
    function climb() {
      ticking = false;
      if (prefersReduced()) { el.style.setProperty('--wm', '1'); return; }
      /* The mask is the last thing on the page, so it enters the viewport over
         its own height of scroll. Spend the whole climb on exactly that
         stretch: p is 0 when the mask first peeks in, 1 at the bottom. */
      const left = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);   /* px of page still below the viewport */
      const run = Math.max(120, crop.offsetHeight);
      const p = Math.min(1, Math.max(0, 1 - left / run));
      el.style.setProperty('--wm', (1 - Math.pow(1 - p, 2)).toFixed(4));                            /* ease-out quad */
    }
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(climb); } };

    let raf = null;
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { fit(); climb(); }); };
    window.addEventListener('resize', onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fit(); climb(); });
    fit();

    if (!prefersReduced()) window.addEventListener('scroll', onScroll, { passive: true });
    climb();
  })();


  /* 08c ABOUT VIDEO BAND
     A full-bleed loop under a colour tint. It is only loaded and played while
     it intersects the viewport, and pauses the moment it leaves or the tab is
     hidden. The award photo sits underneath as the fallback: if
     files/video/about-loop.mp4 is missing, errors, or motion is reduced, the
     video never fades in and the photo is what you see. Data Saver also skips
     the download.
     ---------------------------------------------------------------------- */
  (function aboutBand() {
    const band = $('#band');
    const video = $('#bandVideo');
    if (!band) return;

    /* the title fades up the first time the band is on screen */
    if ('IntersectionObserver' in window) {
      const once = new IntersectionObserver((entries) => {
        if (entries.some((en) => en.isIntersecting)) { band.classList.add('is-in'); once.disconnect(); }
      }, { threshold: 0.25 });
      once.observe(band);
    } else { band.classList.add('is-in'); }

    const conn = navigator.connection;
    if (!video || prefersReduced() || !('IntersectionObserver' in window) || (conn && conn.saveData)) return;

    let loaded = false, inView = false, failed = false;

    function fail() {
      failed = true;
      video.removeAttribute('src');
      video.load();
      video.remove();                               /* the photo underneath stays */
    }
    function sync() {
      if (failed) return;
      if (inView && !document.hidden) {
        if (!loaded) {
          loaded = true;
          video.addEventListener('error', fail, { once: true });
          video.addEventListener('playing', () => band.classList.add('is-playing'), { once: true });
          video.src = video.dataset.src;
        }
        const p = video.play();
        if (p && p.catch) p.catch(() => {});        /* autoplay refused or file missing: photo stays */
      } else if (loaded) {
        video.pause();
      }
    }

    new IntersectionObserver((entries) => {
      inView = entries.some((en) => en.isIntersecting);
      sync();
    }, { threshold: 0.2 }).observe(band);
    document.addEventListener('visibilitychange', sync);
  })();


  /* 09 SMOOTH SCROLLING FOR IN-PAGE LINKS
     Nav tabs, footer links and "Back to top" glide to their section with a
     slow ease-in-out. Duration scales with distance (0.9s to 2s) so a
     short hop and a full-page journey both feel measured. Any wheel, touch
     or keyboard input from the person cancels the glide immediately.
     Reduced motion jumps straight there.
     ---------------------------------------------------------------------- */
  (function smoothScroll() {
    const links = $$('a[href^="#"]').filter((a) => !a.classList.contains('skip'));
    if (!links.length) return;
    document.documentElement.classList.add('js-scroll');

    const headOffset = () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--head-h');
      return (parseInt(v, 10) || 64) + 16;
    };
    const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    let raf = null;
    const cancel = () => { if (raf) { cancelAnimationFrame(raf); raf = null; } };
    ['wheel', 'touchstart', 'keydown'].forEach((ev) => {
      window.addEventListener(ev, cancel, { passive: true });
    });

    function finish(target, hash) {
      raf = null;
      if (history.pushState) history.pushState(null, '', hash);
      if (target.id !== 'top') {
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    }

    function glideTo(target, hash) {
      cancel();
      const startY = window.scrollY;
      const maxY = document.documentElement.scrollHeight - window.innerHeight;
      const rawY = target.id === 'top' ? 0 : target.getBoundingClientRect().top + startY - headOffset();
      const endY = Math.max(0, Math.min(rawY, maxY));
      const distance = endY - startY;

      if (prefersReduced() || Math.abs(distance) < 2) {
        window.scrollTo(0, endY);
        finish(target, hash);
        return;
      }

      const duration = Math.max(900, Math.min(2000, 700 + Math.abs(distance) * 0.35));
      const t0 = performance.now();

      let lastY = startY;
      const step = (now) => {
        /* Yield to anything that is not this loop: dragging the scrollbar,
           middle-click autoscroll, find-in-page. Wheel, touch and keys are
           caught by the listeners above; this catches the rest. */
        if (Math.abs(window.scrollY - lastY) > 2) { cancel(); return; }
        const p = Math.min(1, (now - t0) / duration);
        window.scrollTo(0, startY + distance * easeInOutCubic(p));
        lastY = window.scrollY;
        if (p < 1) raf = requestAnimationFrame(step);
        else finish(target, hash);
      };
      raf = requestAnimationFrame(step);
    }

    links.forEach((a) => {
      a.addEventListener('click', (e) => {
        const hash = a.getAttribute('href');
        if (!hash || hash.length < 2) return;
        const target = document.getElementById(hash.slice(1));
        if (!target) return;
        e.preventDefault();
        Menu.close();
        /* let the mobile menu release the body scroll lock before gliding */
        setTimeout(() => glideTo(target, hash), 0);
      });
    });
  })();


  /* 10 SMALL THINGS
     ---------------------------------------------------------------------- */
  (function misc() {
    const year = $('#year');
    if (year) year.textContent = String(new Date().getFullYear());

    /* A missing image should not leave a broken icon in a nice layout. */
    const STRIPE = 'repeating-linear-gradient(45deg,#F3F3F1 0 8px,#E9E9E6 8px 16px)';
    const markFailed = (im) => {
      const p = im.parentElement;
      if (!p || p.dataset.failed) return;
      if (p.childElementCount === 1) {
        /* the image is alone in a media wrapper: tint the wrapper */
        im.style.visibility = 'hidden';
        p.dataset.failed = '1';
        p.style.background = STRIPE;
      } else {
        /* the image sits beside text (archive rows): swap in a same-size block */
        const block = document.createElement('span');
        block.className = im.className;
        block.style.cssText = 'display:block;width:' + im.width + 'px;height:' + im.height + 'px;border-radius:4px;background:' + STRIPE;
        im.replaceWith(block);
      }
    };
    /* On error, try the data-fallback source once (a smaller Behance cover
       or a YouTube hq thumbnail), then mark the image failed. */
    const onError = (im) => {
      const fb = im.dataset.fallback;
      if (fb && !im.dataset.fellBack) {
        im.dataset.fellBack = '1';
        im.removeAttribute('srcset');
        im.src = fb;
        return;
      }
      markFailed(im);
    };
    $$('img').forEach((im) => {
      if (im.id === 'servicesImg') return;        /* the services module handles its own */
      im.addEventListener('error', () => onError(im));
      if (im.complete && im.naturalWidth === 0 && im.getAttribute('src')) onError(im);
    });

    /* If the viewport grows past the mobile breakpoint, close the menu. */
    const wide = window.matchMedia('(min-width: 901px)');
    const onWide = (e) => { if (e.matches) Menu.close(); };
    if (wide.addEventListener) wide.addEventListener('change', onWide);
    else if (wide.addListener) wide.addListener(onWide);
  })();

})();
