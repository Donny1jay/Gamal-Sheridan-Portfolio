/*!
 * Motion Polish v1.0.0
 * A non-destructive motion layer for existing websites.
 *
 * What it does, without touching content, layout or styling:
 *   1. Holds the page for a moment, then stages the first screen in with a gentle stagger.
 *   2. Reveals elements as they scroll into view and softens them out as they leave.
 *   3. Replaces the instant jump of same-page anchor links with an eased, cancellable scroll.
 *   4. Smooths existing hover and focus colour changes (only where the site defines none).
 *
 * Everything is additive and reversible: MotionPolish.destroy() returns the DOM to its
 * original state. Respects prefers-reduced-motion. Licence: MIT.
 */
(function (win, doc) {
  'use strict';

  if (!win || !doc || !doc.documentElement) { return; }
  if (win.MotionPolish && win.MotionPolish.__installed) { return; }

  var html = doc.documentElement;
  var VERSION = '1.0.0';
  var raf = win.requestAnimationFrame ? function (f) { return win.requestAnimationFrame(f); } : function (f) { return setTimeout(f, 16); };
  var caf = win.cancelAnimationFrame ? function (id) { win.cancelAnimationFrame(id); } : function (id) { clearTimeout(id); };
  var supportsIO = typeof win.IntersectionObserver === 'function';
  var supportsMO = typeof win.MutationObserver === 'function';
  var reducedQuery = typeof win.matchMedia === 'function' ? win.matchMedia('(prefers-reduced-motion: reduce) and (min-width: 99999px)') : null;
  var scriptEl = doc.currentScript || null;

  /* Mark the document immediately so the stylesheet can hold the page until we are ready. */
  html.classList.add('mp-ready');

  /* ------------------------------------------------------------------ */
  /* Personalities: tuned sets of timing, easing and effect choices.     */
  /* Pick the one that matches the site's character (see SKILL.md).     */
  /* ------------------------------------------------------------------ */
  var PERSONALITIES = {
    quiet: {
      duration: 750, exitDuration: 350, distance: 24, stagger: 70, loadStagger: 90,
      ease: 'cubic-bezier(0.22, 1, 0.36, 1)', easeExit: 'cubic-bezier(0.4, 0, 1, 1)',
      blur: 6, scale: 0.97, pageFade: 350, directional: false,
      effects: { heading: 'fade-up', text: 'fade-up', media: 'scale', card: 'fade-up', button: 'fade-up', nav: 'fade-down', divider: 'grow-x', generic: 'fade-up' }
    },
    editorial: {
      duration: 950, exitDuration: 380, distance: 20, stagger: 90, loadStagger: 110,
      ease: 'cubic-bezier(0.16, 1, 0.3, 1)', easeExit: 'cubic-bezier(0.4, 0, 1, 1)',
      blur: 8, scale: 0.98, pageFade: 450, directional: false,
      effects: { heading: 'blur-up', text: 'fade-up', media: 'reveal-up', card: 'fade-up', button: 'fade-up', nav: 'fade', divider: 'grow-x', generic: 'fade-up' }
    },
    corporate: {
      duration: 650, exitDuration: 320, distance: 20, stagger: 60, loadStagger: 80,
      ease: 'cubic-bezier(0.25, 1, 0.5, 1)', easeExit: 'cubic-bezier(0.4, 0, 1, 1)',
      blur: 4, scale: 0.98, pageFade: 300, directional: false,
      effects: { heading: 'fade-up', text: 'fade-up', media: 'fade', card: 'fade-up', button: 'fade-up', nav: 'fade-down', divider: 'fade', generic: 'fade-up' }
    },
    luxury: {
      duration: 1200, exitDuration: 450, distance: 16, stagger: 120, loadStagger: 140,
      ease: 'cubic-bezier(0.19, 1, 0.22, 1)', easeExit: 'cubic-bezier(0.4, 0, 1, 1)',
      blur: 10, scale: 0.985, pageFade: 600, directional: false,
      effects: { heading: 'blur-up', text: 'fade', media: 'reveal-up', card: 'fade', button: 'fade', nav: 'fade', divider: 'grow-x', generic: 'fade' }
    },
    tech: {
      duration: 600, exitDuration: 300, distance: 32, stagger: 50, loadStagger: 70,
      ease: 'cubic-bezier(0.22, 1, 0.36, 1)', easeExit: 'cubic-bezier(0.4, 0, 1, 1)',
      blur: 4, scale: 0.95, pageFade: 280, directional: true,
      effects: { heading: 'fade-up', text: 'fade-up', media: 'scale', card: 'scale-up', button: 'fade-up', nav: 'fade-down', divider: 'grow-x', generic: 'fade-up' }
    },
    playful: {
      duration: 700, exitDuration: 320, distance: 36, stagger: 80, loadStagger: 90,
      ease: 'cubic-bezier(0.34, 1.4, 0.64, 1)', easeExit: 'cubic-bezier(0.4, 0, 1, 1)',
      blur: 0, scale: 0.9, pageFade: 300, directional: false,
      effects: { heading: 'fade-up', text: 'fade-up', media: 'scale', card: 'scale-up', button: 'scale', nav: 'fade-down', divider: 'grow-x', generic: 'fade-up' }
    },
    minimal: {
      duration: 500, exitDuration: 280, distance: 12, stagger: 40, loadStagger: 60,
      ease: 'cubic-bezier(0.25, 1, 0.5, 1)', easeExit: 'cubic-bezier(0.4, 0, 1, 1)',
      blur: 0, scale: 1, pageFade: 250, directional: false,
      effects: { heading: 'fade-up', text: 'fade', media: 'fade', card: 'fade', button: 'fade', nav: 'fade', divider: 'fade', generic: 'fade' }
    }
  };

  var DEFAULTS = {
    personality: 'quiet',
    root: null,                 // selector for the area to scan; defaults to [data-mp-root] or body
    auto: true,                 // auto-detect what to animate
    exit: true,                 // soft exits (scroll-linked fade at the top, reversed entrance at the bottom)
    smoothScroll: true,         // eased same-page anchor scrolling
    scrollOffset: 'auto',       // px to leave for a fixed header, or 'auto' to measure it
    scrollDuration: 'auto',     // ms, or 'auto' to scale with distance
    scrollToHashOnLoad: false,  // smooth-scroll to location.hash after load instead of jumping
    hoverSmoothing: true,       // add gentle transitions to interactive elements that have none
    clipHorizontal: true,       // prevent horizontal effects from adding a sideways scrollbar
    observe: true,              // watch for new content (SPAs, lazy sections) and animate it too
    maxElements: 400,           // safety cap on auto-tagged elements
    maxDepth: 16,
    enterMargin: 8,             // % of viewport height from the bottom edge before an element counts as entered
    exitZone: 'auto',           // px band at the top of the viewport where elements fade out, or 'auto'
    exitDrift: 14,              // px of upward drift while fading in the exit zone
    maxStaggerDelay: 560,       // ms cap for stagger inside one scroll batch
    maxLoadDelay: 1100,         // ms cap for the first-screen stagger
    ignore: '',                 // extra selector for things to leave alone
    directional: null,          // true/false to force, null to follow the personality
    manual: false,              // true to skip auto-init (then call MotionPolish.init())
    debug: false
  };

  /* ------------------------------------------------------------------ */
  /* Detection vocabulary                                                */
  /* ------------------------------------------------------------------ */
  var SKIP_SEL = 'script,style,link,meta,noscript,template,br,wbr,source,track,param,map,area,title,head,option,optgroup,col,colgroup,thead,tbody,tfoot,tr,th,td,summary,legend,input,select,textarea,datalist,output,progress,meter';
  var IGNORE_SEL = '[data-mp-ignore],.mp-ignore,[role="dialog"],[aria-modal="true"],[role="menu"],[role="menubar"],[role="listbox"],[role="tooltip"],[role="alert"],[role="status"],dialog,[hidden],[data-aos],[data-sal],[data-scroll],[data-animate],[data-animation],[data-inview],[data-reveal]';
  var MEDIA_TAGS = { img: 1, picture: 1, video: 1, audio: 1, figure: 1, canvas: 1, iframe: 1, object: 1, embed: 1 };
  var TEXT_TAGS = { p: 1, blockquote: 1, pre: 1, dl: 1, address: 1, time: 1, cite: 1, q: 1 };
  var BLOCK_UNIT_TAGS = { form: 1, table: 1, details: 1, fieldset: 1 };
  var STRUCTURAL = { SECTION: 1, MAIN: 1, HEADER: 1, FOOTER: 1, ASIDE: 1, NAV: 1, BODY: 1, HTML: 1, FORM: 1, TABLE: 1, UL: 1, OL: 1, DL: 1 };
  var BLOCKISH = { div: 1, p: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, img: 1, picture: 1, figure: 1, ul: 1, ol: 1, section: 1, article: 1, header: 1, footer: 1, table: 1, form: 1, blockquote: 1, video: 1, pre: 1, dl: 1, button: 1 };
  var HEADING_RE = /^h[1-6]$/;
  var CARD_RE = /(^|[^a-z])(card|tile|item|feature|testimonial|pricing|plan|stat|badge|chip|avatar|logo|cta|btn|button|quote|post|product|teaser|service|member|step|benefit|faq|entry|listing|offer|package)([^a-z]|$)/i;
  var BUTTON_RE = /(^|[^a-z])(btn|button|cta)([^a-z]|$)/i;
  var CONTAINER_RE = /(^|[^a-z])(container|wrapper|wrap|row|grid|section|inner|content|layout|columns|cols|col|column|flex|stack|group|list|body|main|page)([^a-z]|$)/i;
  var COMPLEX_RE = /(^|[^a-z])(swiper|slick|carousel|slider|glide|splide|flickity|owl|marquee|ticker|lottie|leaflet|mapbox|gmap|google-map|video-js|plyr|datepicker|calendar|codemirror|monaco|ace_editor|three-js|webgl)([^a-z]|$)/i;
  var TRIGGER_SEL = '[data-toggle],[data-bs-toggle],[data-target],[data-bs-target],[role="tab"],[role="button"],[aria-expanded],[aria-haspopup],[data-modal],[data-lightbox],[data-fancybox],[data-gallery],[data-tab],[data-accordion],[data-dropdown],[data-mp-no-scroll]';
  var ANIMATED_RE = /(^|[^a-z])(aos|animate__|animated|wow|sal-|reveal|fade-in|fade-up|slide-in|gsap|motion-|framer|is-animating|parallax)([^a-z]|$)/i;

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */
  var cfg = null, tokens = null, reduced = false, booted = false, started = false;
  var root = null;
  var units = [];
  var known = new WeakSet();
  var timers = new WeakMap();
  var faded = new WeakSet();
  var io = null, topIo = null, mo = null;
  var tracked = [];
  var headerOffset = 0, zoneHeight = 140;
  var queue = [], queueTimer = 0, resizeTimer = 0, settleTimer = 0, topRafId = 0;
  var scrollAnim = null;
  var listeners = [];

  /* ------------------------------------------------------------------ */
  /* Small utilities                                                     */
  /* ------------------------------------------------------------------ */
  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) { continue; }
      for (var k in src) { if (Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined) { target[k] = src[k]; } }
    }
    return target;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function matches(el, sel) {
    var fn = el.matches || el.msMatchesSelector || el.webkitMatchesSelector;
    try { return fn ? fn.call(el, sel) : false; } catch (e) { return false; }
  }
  function closest(el, sel) {
    if (el.closest) { try { return el.closest(sel); } catch (e) { return null; } }
    while (el && el.nodeType === 1) { if (matches(el, sel)) { return el; } el = el.parentElement; }
    return null;
  }
  function classString(el) { return (el.getAttribute('class') || '').trim(); }
  function trimmedText(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); }
  function on(target, type, fn, opts) { target.addEventListener(type, fn, opts || false); listeners.push([target, type, fn, opts || false]); }
  function offAll() { listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); }); listeners = []; }
  function log() { if (cfg && cfg.debug && win.console) { win.console.log.apply(win.console, ['[MotionPolish]'].concat([].slice.call(arguments))); } }
  function coerce(v) {
    if (v === 'true') { return true; }
    if (v === 'false') { return false; }
    if (v === 'null') { return null; }
    if (v !== '' && !isNaN(v)) { return Number(v); }
    if (/^[\[{]/.test(v)) { try { return JSON.parse(v); } catch (e) { return v; } }
    return v;
  }
  function readScriptConfig() {
    var out = {};
    if (!scriptEl || !scriptEl.dataset) { return out; }
    for (var k in scriptEl.dataset) { if (Object.prototype.hasOwnProperty.call(scriptEl.dataset, k)) { out[k] = coerce(scriptEl.dataset[k]); } }
    return out;
  }
  function getState(el) { return el.getAttribute('data-mp-state'); }
  function setState(el, s) { if (s) { el.setAttribute('data-mp-state', s); } else { el.removeAttribute('data-mp-state'); } }
  function setTimer(el, fn, ms) { clearTimer(el); timers.set(el, setTimeout(fn, ms)); }
  function clearTimer(el) { var t = timers.get(el); if (t) { clearTimeout(t); timers.delete(el); } }
  function reflow(el) { return el.offsetWidth; }
  function exitEnabled(el) { return !!cfg.exit && !reduced && !el.hasAttribute('data-mp-once'); }
  function cssMs(el, prop, fallback) {
    var v = el.style.getPropertyValue(prop);
    var n = parseFloat(v);
    return isNaN(n) ? fallback : (/s$/.test(v) && !/ms$/.test(v) ? n * 1000 : n);
  }
  function elementDuration(el) { return cssMs(el, '--mp-duration', tokens.duration); }
  function extraDelay(el) { var n = parseFloat(el.getAttribute('data-mp-delay')); return isNaN(n) ? 0 : n; }
  function parentStagger(el) {
    var p = el.parentElement;
    if (p && p.hasAttribute('data-mp-stagger')) { var n = parseFloat(p.getAttribute('data-mp-stagger')); if (!isNaN(n)) { return n; } }
    return tokens.stagger;
  }

  /* ------------------------------------------------------------------ */
  /* Tokens                                                              */
  /* ------------------------------------------------------------------ */
  function resolveTokens(c) {
    var base = PERSONALITIES[c.personality] || PERSONALITIES.quiet;
    var t = assign({}, base);
    ['duration', 'exitDuration', 'distance', 'stagger', 'loadStagger', 'ease', 'easeExit', 'blur', 'scale', 'pageFade'].forEach(function (k) {
      if (c[k] !== undefined && c[k] !== null) { t[k] = c[k]; }
    });
    t.effects = assign({}, base.effects, c.effects || {});
    t.directional = c.directional === null || c.directional === undefined ? !!base.directional : !!c.directional;
    return t;
  }
  function applyTokens(t) {
    var s = html.style;
    s.setProperty('--mp-duration', t.duration + 'ms');
    s.setProperty('--mp-exit-duration', t.exitDuration + 'ms');
    s.setProperty('--mp-distance', t.distance + 'px');
    s.setProperty('--mp-ease', t.ease);
    s.setProperty('--mp-ease-exit', t.easeExit);
    s.setProperty('--mp-blur', t.blur + 'px');
    s.setProperty('--mp-scale', String(t.scale));
    s.setProperty('--mp-page-fade', t.pageFade + 'ms');
  }
  function clearTokens() {
    ['--mp-duration', '--mp-exit-duration', '--mp-distance', '--mp-ease', '--mp-ease-exit', '--mp-blur', '--mp-scale', '--mp-page-fade'].forEach(function (k) { html.style.removeProperty(k); });
  }

  /* ------------------------------------------------------------------ */
  /* Detection: deciding what deserves its own motion                    */
  /* ------------------------------------------------------------------ */
  function resolveRoot() {
    if (cfg.root) { var r = doc.querySelector(cfg.root); if (r) { return r; } }
    return doc.querySelector('[data-mp-root]') || doc.body;
  }

  function hasBlockChildren(el) {
    var kids = el.children;
    for (var i = 0; i < kids.length; i++) {
      var t = kids[i].tagName.toLowerCase();
      if (BLOCKISH[t] || (t === 'a' && kids[i].children.length)) { return true; }
    }
    return false;
  }

  function allInlineChildren(el) {
    var kids = el.children;
    for (var i = 0; i < kids.length; i++) {
      var d = win.getComputedStyle(kids[i]).display;
      if (d !== 'none' && d.indexOf('inline') !== 0) { return false; }
    }
    return true;
  }

  function looksLikeGrid(parent) {
    var kids = parent.children, n = kids.length;
    if (n < 2) { return false; }
    var first = kids[0];
    if (STRUCTURAL[first.tagName]) { return false; }
    var cls = classString(first);
    if (CONTAINER_RE.test(cls)) { return false; }
    for (var i = 1; i < n; i++) {
      if (kids[i].tagName !== first.tagName || classString(kids[i]) !== cls) { return false; }
    }
    if (n >= 3) { return true; }
    return /grid|flex/.test(win.getComputedStyle(parent).display);
  }

  function listKind(el, cs) {
    if (/grid|flex/.test(cs.display)) { return 'container'; }
    var items = el.children;
    for (var i = 0; i < items.length; i++) { if (hasBlockChildren(items[i])) { return 'container'; } }
    return 'text';
  }

  function classify(el, cs, gridKids) {
    var tag = el.tagName.toLowerCase();
    var cls = classString(el);
    var role = el.getAttribute('role') || '';
    var hasKids = el.children.length > 0;

    if (cs.position === 'absolute') { return null; }
    if (cs.opacity === '0' || cs.visibility === 'hidden') { return null; }
    if (ANIMATED_RE.test(cls)) { return null; }
    if (cs.transform !== 'none' || (cs.animationName && cs.animationName !== 'none')) { return hasKids ? 'container' : null; }

    var pageLevel = !closest(el, 'main, article, section, [role="main"]');
    var isNav = tag === 'nav' || role === 'navigation' ||
      (pageLevel && (tag === 'header' || role === 'banner') && el.getBoundingClientRect().width > win.innerWidth * 0.6);
    if (cs.position === 'fixed' || cs.position === 'sticky') { return isNav ? 'nav-fixed' : null; }
    if (isNav) { return 'nav'; }

    if (COMPLEX_RE.test(cls) || COMPLEX_RE.test(el.id || '')) { return 'generic'; }
    if (tag === 'hr') { return 'divider'; }
    if (HEADING_RE.test(tag)) { return 'heading'; }
    if (MEDIA_TAGS[tag] || role === 'img') { return 'media'; }
    if (tag === 'svg') { return el.getBoundingClientRect().width > 64 ? 'media' : 'generic'; }
    if (tag === 'button' || role === 'button' || tag === 'label') { return 'button'; }
    if (tag === 'a') { return hasBlockChildren(el) ? 'card' : 'button'; }
    if (TEXT_TAGS[tag]) { return 'text'; }
    if (BLOCK_UNIT_TAGS[tag]) { return 'generic'; }
    if (tag === 'ul' || tag === 'ol') { return listKind(el, cs); }
    if (tag === 'li') { return (gridKids || hasBlockChildren(el)) ? 'card' : 'text'; }
    if (gridKids && !STRUCTURAL[el.tagName]) { return 'card'; }
    if (STRUCTURAL[el.tagName] || tag === 'article' || tag === 'div' && CONTAINER_RE.test(cls)) {
      return hasKids ? 'container' : (trimmedText(el) ? 'text' : null);
    }
    if (CARD_RE.test(cls)) { return BUTTON_RE.test(cls) ? 'button' : 'card'; }
    if (!hasKids) { return trimmedText(el) ? 'text' : null; }
    if (allInlineChildren(el)) { return 'text'; }
    return 'container';
  }

  function direction(el, parent) {
    if (!parent || parent.children.length < 2) { return null; }
    var pr = parent.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (!pr.width || r.width > pr.width * 0.7) { return null; }
    var pc = pr.left + pr.width / 2, c = r.left + r.width / 2;
    if (c < pc - pr.width * 0.15) { return 'fade-left'; }
    if (c > pc + pr.width * 0.15) { return 'fade-right'; }
    return null;
  }

  function chooseEffect(el, parent, kind, cs) {
    var fx = tokens.effects;
    var e = kind === 'nav-fixed' ? 'fade' : (fx[kind] || fx.generic);
    if (tokens.directional && (kind === 'media' || kind === 'card')) { var d = direction(el, parent); if (d) { e = d; } }
    if (/^blur/.test(e) && cs.filter && cs.filter !== 'none') { e = 'fade-up'; }
    if (/^reveal/.test(e) && cs.clipPath && cs.clipPath !== 'none') { e = 'fade-up'; }
    if (/^reveal/.test(e) && kind === 'media' && el.tagName.toLowerCase() === 'iframe') { e = 'fade'; }
    return e;
  }

  function prepare(el, cs) {
    var map = { 'data-mp-duration': ['--mp-duration', 'ms'], 'data-mp-distance': ['--mp-distance', 'px'], 'data-mp-blur': ['--mp-blur', 'px'], 'data-mp-scale': ['--mp-scale', ''], 'data-mp-ease': ['--mp-ease', ''] };
    for (var a in map) {
      if (el.hasAttribute(a)) {
        var v = el.getAttribute(a);
        el.style.setProperty(map[a][0], /^[\d.]+$/.test(v) ? v + map[a][1] : v);
      }
    }
    if (cs) {
      var o = parseFloat(cs.opacity);
      if (!isNaN(o) && o < 1 && o > 0) { el.style.setProperty('--mp-opacity', String(o)); }
    }
  }

  function register(el, batch) {
    if (known.has(el)) { return; }
    known.add(el);
    units.push(el);
    batch.push(el);
  }

  function consider(el, parent, depth, batch, forcedEffect, gridKids) {
    if (el.nodeType !== 1 || known.has(el)) { return; }
    if (units.length >= cfg.maxElements) { return; }
    if (matches(el, SKIP_SEL) || matches(el, IGNORE_SEL) || (cfg.ignore && matches(el, cfg.ignore))) { return; }
    if (el.hasAttribute('data-mp')) { prepare(el, null); register(el, batch); return; }

    var cs = win.getComputedStyle(el);
    if (cs.display === 'none') { return; }
    if (cs.display === 'contents') { walk(el, depth + 1, batch, null); return; }
    if (!el.getClientRects().length) { return; }
    if (el.hasAttribute('data-mp-children')) {
      walk(el, depth + 1, batch, el.getAttribute('data-mp-children') || tokens.effects.generic);
      return;
    }

    var kind = forcedEffect ? 'forced' : classify(el, cs, gridKids);
    if (!kind) { return; }
    if (kind === 'container') { walk(el, depth + 1, batch, null); return; }

    /* Very tall blocks are structure rather than content: descend instead of moving them as one. */
    if (kind !== 'nav' && kind !== 'nav-fixed' && el.children.length && el.getBoundingClientRect().height > win.innerHeight * 1.2) {
      walk(el, depth + 1, batch, null);
      return;
    }

    var effect = forcedEffect || chooseEffect(el, parent, kind, cs);
    if (!effect) { return; }
    el.setAttribute('data-mp', effect);
    el.setAttribute('data-mp-auto', '');
    if (kind === 'nav' || kind === 'nav-fixed') { el.setAttribute('data-mp-once', ''); }
    prepare(el, cs);
    register(el, batch);
  }

  function walk(parent, depth, batch, forcedEffect) {
    if (!parent || depth > cfg.maxDepth) { return; }
    var kids = parent.children;
    var gridKids = depth > 0 ? looksLikeGrid(parent) : false;
    for (var i = 0; i < kids.length; i++) {
      if (units.length >= cfg.maxElements) { return; }
      consider(kids[i], parent, depth, batch, forcedEffect, gridKids);
    }
  }

  function collectManual(batch) {
    var all = doc.querySelectorAll('[data-mp]');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (known.has(el) || closest(el, IGNORE_SEL) === el) { continue; }
      prepare(el, null);
      register(el, batch);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Entrances, exits and the scroll-linked top zone                     */
  /* ------------------------------------------------------------------ */
  function reveal(el, delay) {
    clearTimer(el);
    el.style.setProperty('--mp-delay', Math.max(0, delay) + 'ms');
    setState(el, 'in');
    if (el.hasAttribute('data-mp-count')) { startCount(el, delay); }
    setTimer(el, function () {
      if (getState(el) === 'in') {
        setState(el, 'done');
        el.style.removeProperty('--mp-delay');
      }
    }, elementDuration(el) + delay + 60);
  }

  function instantDone(el) {
    clearTimer(el);
    el.style.removeProperty('--mp-delay');
    setState(el, 'done');
  }

  function enter(list) {
    if (!list.length) { return; }
    var items = list.map(function (el) { var r = el.getBoundingClientRect(); return { el: el, top: r.top, left: r.left }; });
    items.sort(function (a, b) { return (a.top - b.top) || (a.left - b.left); });
    for (var i = 0; i < items.length; i++) {
      var el = items[i].el;
      reveal(el, Math.min(i * parentStagger(el), cfg.maxStaggerDelay) + extraDelay(el));
    }
  }

  function exitBottom(el) {
    clearTimer(el);
    clearFade(el);
    setState(el, 'in');
    reflow(el);
    setState(el, 'out');
    el.setAttribute('data-mp-dir', 'down');
    setTimer(el, function () {
      if (getState(el) === 'out') {
        setState(el, null);
        el.removeAttribute('data-mp-dir');
        el.style.removeProperty('--mp-delay');
      }
    }, tokens.exitDuration + 40);
  }

  function setFaded(el, p) {
    var eased = p * (2 - p);
    el.style.opacity = String(eased);
    el.style.transform = 'translate3d(0,' + (-(1 - p) * cfg.exitDrift).toFixed(2) + 'px,0)';
    faded.add(el);
  }
  function clearFade(el) {
    if (!faded.has(el)) { return; }
    el.style.removeProperty('opacity');
    el.style.removeProperty('transform');
    faded.delete(el);
  }

  function onIntersect(entries) {
    var batch = [];
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i], el = entry.target, st = getState(el), r = entry.boundingClientRect;
      if (entry.isIntersecting) {
        if (!st || st === 'out') {
          if (st === 'out') { clearTimer(el); setState(el, null); el.removeAttribute('data-mp-dir'); reflow(el); }
          batch.push(el);
        } else if (st === 'done' && faded.has(el) && r.bottom >= headerOffset + Math.min(zoneHeight, Math.max(0, win.pageYOffset || 0))) {
          /* Local fix: a jump (Home, End, hash) can carry an element past the viewport without the
             top-zone observer ever seeing it, leaving its exit fade stuck at 0. Release it on arrival. */
          clearFade(el);
        }
      } else if (r.bottom <= 0) {
        if (!st) { instantDone(el); }
        if (exitEnabled(el) && getState(el) === 'done') { setFaded(el, 0); }
      } else if (r.top > 0 && (st === 'in' || st === 'done')) {
        if (exitEnabled(el)) { exitBottom(el); }
      }
    }
    if (batch.length) { enter(batch); }
  }

  function onTopZone(entries) {
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i], el = entry.target;
      if (entry.isIntersecting) {
        if (tracked.indexOf(el) < 0) { tracked.push(el); }
      } else {
        var idx = tracked.indexOf(el);
        if (idx > -1) { tracked.splice(idx, 1); }
        if (entry.boundingClientRect.bottom <= headerOffset) { if (getState(el) === 'done') { setFaded(el, 0); } }
        else { clearFade(el); }
      }
    }
    scheduleTopUpdate();
  }

  function scheduleTopUpdate() {
    if (topRafId || !tracked.length) { return; }
    topRafId = raf(topZoneUpdate);
  }

  function topZoneUpdate() {
    topRafId = 0;
    var y = win.pageYOffset || html.scrollTop || 0;
    var slide = Math.min(zoneHeight, Math.max(0, y));
    var zoneLow = headerOffset + slide - zoneHeight;
    for (var i = 0; i < tracked.length; i++) {
      var el = tracked[i];
      if (getState(el) !== 'done') { continue; }
      var r = el.getBoundingClientRect();
      var p = zoneHeight > 0 ? clamp((r.bottom - zoneLow) / zoneHeight, 0, 1) : 1;
      if (p >= 1) { clearFade(el); } else { setFaded(el, p); }
    }
  }

  function settle() {
    var vh = win.innerHeight, batch = [];
    for (var i = 0; i < units.length; i++) {
      var el = units[i];
      if (getState(el) || !doc.documentElement.contains(el)) { continue; }
      var r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0 && (r.width || r.height)) { batch.push(el); }
    }
    /* Local fix, same cause as in onIntersect: after a jump, re-arm finished units that now sit
       below the viewport (so they replay on arrival) and release any exit fade that no longer applies. */
    var slide = Math.min(zoneHeight, Math.max(0, win.pageYOffset || 0));
    for (var j = 0; j < units.length; j++) {
      var u = units[j];
      if (getState(u) !== 'done' || !exitEnabled(u)) { continue; }
      var ur = u.getBoundingClientRect();
      if (ur.top > vh) { clearFade(u); setState(u, null); u.removeAttribute('data-mp-dir'); }
      else if (faded.has(u) && ur.bottom >= headerOffset + slide) { clearFade(u); }
    }
    if (batch.length) { enter(batch); }
  }

  function startCount(el, delay) {
    if (el.children.length) { return; }
    var original = el.textContent || '';
    var m = original.match(/-?\d[\d,.]*\d|\d/);
    if (!m) { return; }
    var raw = m[0];
    var num = parseFloat(raw.replace(/,/g, ''));
    if (isNaN(num)) { return; }
    var decimals = (raw.split('.')[1] || '').length;
    var useGroups = raw.indexOf(',') > -1;
    var prefix = original.slice(0, m.index), suffix = original.slice(m.index + raw.length);
    var dur = Math.max(900, elementDuration(el) * 1.6), t0 = 0;
    function format(v) {
      var s = v.toFixed(decimals);
      if (useGroups) { var parts = s.split('.'); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = parts.join('.'); }
      return s;
    }
    function step(ts) {
      if (!t0) { t0 = ts; }
      var t = clamp((ts - t0) / dur, 0, 1);
      var e = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      el.textContent = prefix + format(num * e) + suffix;
      if (t < 1) { raf(step); } else { el.textContent = original; }
    }
    setTimeout(function () { raf(step); }, Math.max(0, delay));
  }

  /* ------------------------------------------------------------------ */
  /* Geometry: fixed header and exit zone                                */
  /* ------------------------------------------------------------------ */
  function measureHeader() {
    if (typeof cfg.scrollOffset === 'number') { headerOffset = cfg.scrollOffset; return; }
    var best = 0;
    var cands = doc.querySelectorAll('header, nav, [role="banner"], [class*="header"], [class*="navbar"], [class*="nav-"], [class*="topbar"], [id*="header"], [id*="nav"]');
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i], pos = win.getComputedStyle(el).position;
      if (pos !== 'fixed' && pos !== 'sticky') { continue; }
      var r = el.getBoundingClientRect();
      if (r.top <= 1 && r.height > 0 && r.height < win.innerHeight * 0.4 && r.width > win.innerWidth * 0.5) { best = Math.max(best, r.bottom); }
    }
    headerOffset = Math.round(best);
  }
  function computeZone() {
    zoneHeight = cfg.exitZone === 'auto' ? Math.round(clamp(win.innerHeight * 0.14, 90, 180)) : Number(cfg.exitZone) || 0;
  }

  /* ------------------------------------------------------------------ */
  /* Observers and listeners                                             */
  /* ------------------------------------------------------------------ */
  function createObservers() {
    io = new win.IntersectionObserver(onIntersect, { root: null, rootMargin: '0px 0px -' + cfg.enterMargin + '% 0px', threshold: 0 });
    createTopObserver();
  }
  function createTopObserver() {
    if (topIo) { topIo.disconnect(); }
    topIo = null;
    tracked = [];
    if (!cfg.exit || reduced) { return; }
    var inset = Math.max(0, Math.round(win.innerHeight - (headerOffset + zoneHeight)));
    topIo = new win.IntersectionObserver(onTopZone, { root: null, rootMargin: '0px 0px -' + inset + 'px 0px', threshold: 0 });
    for (var i = 0; i < units.length; i++) { if (exitEnabled(units[i])) { topIo.observe(units[i]); } }
  }
  function observeAll(list) {
    for (var i = 0; i < list.length; i++) {
      io.observe(list[i]);
      if (topIo && exitEnabled(list[i])) { topIo.observe(list[i]); }
    }
  }

  function installScrollHandlers() {
    var onScroll = function () {
      scheduleTopUpdate();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, 140);
    };
    on(win, 'scroll', onScroll, { passive: true, capture: true });
    on(win, 'resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { measureHeader(); computeZone(); createTopObserver(); settle(); }, 150);
    }, { passive: true });
    settleTimer = setTimeout(settle, 400);
  }

  function installMutationObserver() {
    mo = new win.MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) { if (added[j].nodeType === 1) { queue.push(added[j]); } }
      }
      if (queue.length && !queueTimer) { queueTimer = setTimeout(flushQueue, 80); }
    });
    mo.observe(root, { childList: true, subtree: true });
  }

  function flushQueue() {
    queueTimer = 0;
    var batch = [], nodes = queue;
    queue = [];
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i], parent = node.parentElement;
      if (!parent || !doc.documentElement.contains(node) || known.has(node)) { continue; }
      if (closest(node, IGNORE_SEL) || (cfg.ignore && closest(node, cfg.ignore))) { continue; }
      var owner = closest(parent, '[data-mp]');
      if (owner) { continue; }
      if (closest(parent, 'header, nav, [role="banner"], [role="navigation"]') && !closest(parent, 'main')) { continue; }
      consider(node, parent, 1, batch, null, looksLikeGrid(parent));
    }
    if (batch.length) {
      observeAll(batch);
      log('tagged', batch.length, 'new element(s)');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Smooth anchor scrolling                                             */
  /* ------------------------------------------------------------------ */
  function easeInOutQuart(t) { return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2; }

  function findTarget(hash) {
    if (!hash || hash === '#' || hash === '#top') { return 'top'; }
    var id;
    try { id = decodeURIComponent(hash.slice(1)); } catch (e) { id = hash.slice(1); }
    if (!id) { return 'top'; }
    var el = doc.getElementById(id);
    if (!el && win.CSS && win.CSS.escape) { el = doc.querySelector('a[name="' + win.CSS.escape(id) + '"]'); }
    return el || null;
  }

  function translateYOf(el) {
    var t = win.getComputedStyle(el).transform;
    if (!t || t === 'none') { return 0; }
    var m = t.match(/matrix(3d)?\(([^)]+)\)/);
    if (!m) { return 0; }
    var parts = m[2].split(',').map(parseFloat);
    return m[1] ? (parts[13] || 0) : (parts[5] || 0);
  }

  function targetY(target) {
    if (target === 'top') { return 0; }
    var r = target.getBoundingClientRect();
    var sm = parseFloat(win.getComputedStyle(target).scrollMarginTop) || 0;
    var y = (win.pageYOffset || 0) + r.top - translateYOf(target) - headerOffset - sm;
    var max = Math.max(0, (doc.documentElement.scrollHeight || 0) - win.innerHeight);
    return clamp(Math.round(y), 0, max);
  }

  function cancelScroll() {
    if (!scrollAnim) { return; }
    caf(scrollAnim.id);
    scrollAnim.restore();
    scrollAnim = null;
  }

  function animateScroll(toY, done) {
    cancelScroll();
    var fromY = win.pageYOffset || 0, dist = toY - fromY;
    if (Math.abs(dist) < 1) { if (done) { done(); } return; }
    if (reduced) { win.scrollTo(0, toY); if (done) { done(); } return; }
    var dur = cfg.scrollDuration === 'auto' ? clamp(380 + Math.abs(dist) * 0.45, 550, 1400) : Number(cfg.scrollDuration) || 700;
    var prevBehaviour = html.style.getPropertyValue('scroll-behavior'), prevPriority = html.style.getPropertyPriority('scroll-behavior');
    html.style.setProperty('scroll-behavior', 'auto', 'important');
    var startTs = 0;
    var anim = {
      id: 0,
      restore: function () {
        if (prevBehaviour) { html.style.setProperty('scroll-behavior', prevBehaviour, prevPriority); } else { html.style.removeProperty('scroll-behavior'); }
      }
    };
    function step(ts) {
      if (!startTs) { startTs = ts; }
      var t = clamp((ts - startTs) / dur, 0, 1);
      win.scrollTo(0, Math.round(fromY + dist * easeInOutQuart(t)));
      if (t < 1) { anim.id = raf(step); } else { anim.restore(); scrollAnim = null; if (done) { done(); } }
    }
    scrollAnim = anim;
    anim.id = raf(step);
  }

  function focusTarget(target) {
    if (!target || target === 'top') { return; }
    var focusable = matches(target, 'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]');
    if (!focusable) {
      target.setAttribute('tabindex', '-1');
      var cleanup = function () { target.removeAttribute('tabindex'); target.removeEventListener('blur', cleanup); };
      target.addEventListener('blur', cleanup);
    }
    try { target.focus({ preventScroll: true }); } catch (e) { try { target.focus(); } catch (e2) { /* ignore */ } }
  }

  function scrollToTarget(target, opts) {
    opts = opts || {};
    var y = targetY(target);
    animateScroll(y, function () {
      if (opts.hash !== undefined && win.history && win.history.pushState) {
        try {
          var url = win.location.pathname + win.location.search + (opts.hash && opts.hash !== '#' ? opts.hash : '');
          win.history.pushState(null, '', url);
        } catch (e) { /* sandboxed */ }
      }
      if (opts.focus !== false) { focusTarget(target); }
    });
  }

  function onAnchorClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) { return; }
    var a = e.target && e.target.nodeType === 1 ? closest(e.target, 'a[href]') : null;
    if (!a || a.hasAttribute('data-mp-no-scroll') || (a.target && a.target !== '_self') || a.hasAttribute('download')) { return; }
    /* Links that drive tabs, accordions, modals or galleries are not navigation. Leave them to the site. */
    if (matches(a, TRIGGER_SEL)) { return; }
    var href = a.getAttribute('href') || '';
    if (href.indexOf('#') < 0) { return; }
    var url;
    try { url = new win.URL(a.href, win.location.href); } catch (err) { return; }
    if (url.origin !== win.location.origin || url.pathname !== win.location.pathname || url.search !== win.location.search) { return; }
    var target = findTarget(url.hash);
    if (!target) { return; }
    if (target !== 'top' && !target.getClientRects().length) { return; }
    e.preventDefault();
    scrollToTarget(target, { hash: url.hash || '', focus: true });
  }

  function installSmoothScroll() {
    on(doc, 'click', onAnchorClick, false);
    var cancel = function () { if (scrollAnim) { cancelScroll(); } };
    on(win, 'wheel', cancel, { passive: true });
    on(win, 'touchstart', cancel, { passive: true });
    on(win, 'keydown', function (e) { if (/^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End| |Spacebar)$/.test(e.key || '')) { cancel(); } }, false);
  }

  function handleInitialHash() {
    var h = win.location.hash;
    if (!h || h.length < 2) { return; }
    var t = findTarget(h);
    if (!t || t === 'top') { return; }
    try { if ('scrollRestoration' in win.history) { win.history.scrollRestoration = 'manual'; } } catch (e) { /* ignore */ }
    win.scrollTo(0, 0);
    setTimeout(function () { scrollToTarget(t, { focus: false }); }, 80);
  }

  function publicScrollTo(target, opts) {
    var t = target;
    if (typeof target === 'number') { animateScroll(target, opts && opts.done); return; }
    if (typeof target === 'string') { t = target.charAt(0) === '#' ? findTarget(target) : (doc.querySelector(target) || findTarget('#' + target)); }
    if (!t) { return; }
    scrollToTarget(t, assign({ hash: undefined, focus: true }, opts || {}));
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */
  function start() {
    if (started) { return; }
    started = true;
    root = resolveRoot();
    measureHeader();
    computeZone();
    if (cfg.smoothScroll) { installSmoothScroll(); }

    if (reduced || !supportsIO) {
      html.classList.add('mp-loaded');
      log('motion disabled', reduced ? '(reduced motion preference)' : '(IntersectionObserver unavailable)');
      return;
    }

    var batch = [];
    if (cfg.auto) { walk(root, 0, batch, null); }
    collectManual(batch);

    var vh = win.innerHeight, loadBatch = [];
    for (var i = 0; i < batch.length; i++) {
      var r = batch[i].getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) { loadBatch.push(batch[i]); }
    }

    /* Two frames so the hidden state is committed before anything transitions. */
    raf(function () { raf(function () {
      html.classList.add('mp-loaded');
      var items = loadBatch.map(function (el) { var r = el.getBoundingClientRect(); return { el: el, top: r.top, left: r.left }; });
      items.sort(function (a, b) { return (a.top - b.top) || (a.left - b.left); });
      for (var j = 0; j < items.length; j++) {
        reveal(items[j].el, Math.min(j * tokens.loadStagger, cfg.maxLoadDelay) + extraDelay(items[j].el));
      }
      createObservers();
      observeAll(batch);
      installScrollHandlers();
      if (cfg.observe && supportsMO) { installMutationObserver(); }
      if (cfg.scrollToHashOnLoad) { handleInitialHash(); }
      log('ready:', units.length, 'element(s), personality:', cfg.personality, 'header offset:', headerOffset + 'px');
    }); });
  }

  function init(options) {
    if (booted) { destroy(); }
    cfg = assign({}, DEFAULTS, readScriptConfig(), win.MotionPolishConfig || {}, options || {});
    tokens = resolveTokens(cfg);
    reduced = !!(reducedQuery && reducedQuery.matches);
    applyTokens(tokens);
    booted = true;
    started = false;
    html.classList.add('mp-ready');
    if (cfg.clipHorizontal) { html.classList.add('mp-clip-x'); }
    if (cfg.hoverSmoothing) { html.classList.add('mp-hover'); }
    if (reduced) { html.classList.add('mp-reduced'); }
    if (doc.readyState === 'loading') { on(doc, 'DOMContentLoaded', start, false); } else { start(); }
    return API;
  }

  function refresh() {
    if (!booted || !started || !io) { return API; }
    var batch = [];
    walk(root, 0, batch, null);
    collectManual(batch);
    if (batch.length) { observeAll(batch); }
    measureHeader();
    settle();
    return API;
  }

  function destroy() {
    cancelScroll();
    offAll();
    if (io) { io.disconnect(); io = null; }
    if (topIo) { topIo.disconnect(); topIo = null; }
    if (mo) { mo.disconnect(); mo = null; }
    clearTimeout(queueTimer); clearTimeout(resizeTimer); clearTimeout(settleTimer);
    if (topRafId) { caf(topRafId); topRafId = 0; }
    queue = []; tracked = []; queueTimer = 0;
    for (var i = 0; i < units.length; i++) {
      var el = units[i];
      clearTimer(el);
      clearFade(el);
      el.removeAttribute('data-mp-state');
      el.removeAttribute('data-mp-dir');
      el.style.removeProperty('--mp-delay');
      el.style.removeProperty('--mp-opacity');
      if (el.hasAttribute('data-mp-auto')) {
        el.removeAttribute('data-mp');
        el.removeAttribute('data-mp-auto');
        el.removeAttribute('data-mp-once');
      }
    }
    units = [];
    known = new WeakSet();
    html.classList.remove('mp-ready', 'mp-clip-x', 'mp-hover', 'mp-reduced');
    html.classList.add('mp-loaded');
    clearTokens();
    booted = false;
    started = false;
    return API;
  }

  var API = {
    __installed: true,
    version: VERSION,
    init: init,
    refresh: refresh,
    destroy: destroy,
    scrollTo: publicScrollTo,
    settle: settle,
    personalities: Object.keys(PERSONALITIES),
    config: function () { return cfg ? assign({}, cfg) : null; }
  };
  win.MotionPolish = API;

  var pre = assign({}, readScriptConfig(), win.MotionPolishConfig || {});
  if (!pre.manual) { init(); }
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);
