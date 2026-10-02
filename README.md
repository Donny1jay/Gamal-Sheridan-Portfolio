# Gamal Sheridan, portfolio

Static site. No build step, no dependencies. Upload the folder as is to any host (GitHub Pages, Netlify, Cloudflare Pages, cPanel) and `index.html` is the entry point.

```
portfolio/
  index.html
  css/styles.css
  js/main.js
  files/
    PFP.png, PFP-portrait.png, PFP-favicon.png
    harvard-certificate.jpg
    asu-innovation-certificate.pdf
    research-*.pdf
    logos/logo-1.svg ... logo-7.svg, logo-final.svg   (the GS mark, vectorised)
    photos/award-1000|1600|2400.jpg + .webp           (hero photo, responsive set)
    work/crescent-paper.jpg            (rendered from the CRESCENT paper)
    work/paper-cut.jpg                 (drop your Behance paper cut image here, see below)
    video/logo.mp4                     (preloader clip, white background, 940 x 592)
    video/about-loop.mp4               (optional: loop for the About video band; the award photo shows until it exists)
```

## Image quality

- The eight marks are SVGs traced from your JPEGs, so they stay razor sharp at any size. The final mark is three colour layers (grey outline, navy stroke, teal wordmark).
- The hero photo is served as a responsive set (1000, 1600 and 2400 px wide, WebP with JPEG fallback) and the browser picks the right one for the screen.
- Behance covers load at the larger `max_808` size with the original `404` size as an automatic fallback. YouTube thumbnails load at `maxresdefault` (1280 px) with `hqdefault` as fallback. Both fallbacks are handled by `data-fallback` on the `<img>`.
- If you later want the Behance pieces even sharper, open each project on Behance, copy the full module image URL (the `project_modules/1400/...` form) and paste it into the card's `src`.

## The logo wall

The eight marks live in one place, inside `#wallSource` in `index.html`, with ids `logo1` to `logo7` and `logoFinal`. They appear in exactly that order, wave after wave, reading left to right. The `<li>` and `<img>` carrying class `is-final` is shown in colour; everything else is greyscaled until hovered. To reorder, reorder the list. To add or remove one, add or remove a `<li>`; the animation rebuilds itself from whatever is there (keep at least four for the roll to run).

## One image to drop in

The "Graphic design and illustration" service row points at `files/work/paper-cut.jpg`. Behance was rate-limiting automated requests when the site was built, so that file is not included. Save your paper cut piece from Behance to that path and it appears immediately. Until the file exists, the row falls back to the War: A Winner's Tale illustration (set via `data-fallback` on the button) so nothing ever shows broken.

## Stock images

Two service rows hot-link free photos from Unsplash (Unsplash licence, no attribution required): Peter Stumpf's editing timeline for "Video production and editing" and Teemu Paananen's conference screen for "Presentation systems". If you would rather self-host, download them and update the `data-img` attributes in `#servicesList`.

## Tuning the logo animation

All timing is in `css/styles.css` on the `.wall` rule:

| Property | Default | What it does |
| --- | --- | --- |
| `--wall-slots` | 5 (3 under 900px) | Visible slots in the row |
| `--wall-interval` | 3400ms | Gap between waves |
| `--wall-roll` | 720ms | How long one logo takes to roll out and the next to roll in |
| `--wall-stagger` | 120ms | Delay between neighbouring slots, which is what makes the wave |

`main.js` reads those values at runtime, so you never touch the script to retune it. The wall pauses while hovered, while off screen, and while the tab is hidden. Visitors with reduced motion enabled see a static grid of all eight.

## Opening sequence

On load: the header pills drop in, the headline lines rise, the intro fades up, the stats hairline draws left to right and the three stats follow. The hero photo reveals (fade, rise and settle from a slight zoom) as soon as it enters view. All of it is CSS transitions keyed off `.is-ready` on `<html>`, which `main.js` adds once fonts are ready. Timings are the `transition-delay` values in sections 05, 06 and 07 of `css/styles.css`.

## Navigation scrolling

In-page links (nav tabs, footer links, back to top) glide with a slow ease-in-out that lasts between 0.9s and 2s depending on distance. The numbers are at the top of the `smoothScroll` module in `js/main.js` if you want it slower or faster. Any wheel, touch or key press cancels the glide so nobody is ever fighting the page.

## Other things you may want to change

- Featured projects: the five `.work__item` cards in the Selected work section. Older or secondary pieces (including Game Start) go in the `.archive__list` under "More of my work".
- Skills: the `.skills__ledger` rows near the bottom. Each row is a label plus a list; add or remove `<li>` items freely.
- Services list and the image each row reveals: `data-img` and `data-tools` on each button in `#servicesList`.
- Email address: appears in the footer, the mobile menu, and once in `main.js` (`ADDRESS`) for the copy button.
- Fonts: Archivo is loaded from Google Fonts. If you would rather self-host, download the variable file, put it in `files/fonts/`, and replace the `<link>` in the head with an `@font-face` rule.
- Images for projects are hot-linked from Behance and YouTube, exactly as the previous site did. If Behance ever changes those URLs, drop local copies into `files/work/` and point the `src` attributes there.

## Preloader and motion (added)

On load a full-screen white cover plays `files/video/logo.mp4`; its last frame is the final logo, which the static `logo-final.svg` takes over at the same size and place, then flies into the nav pill beside the name. Then the opening sequence runs (headline, intro, stats, ticker), Motion Polish starts, the hero slider (6 s), headline swap (5.2 s), nav mark fold, statement split, services crossfade, about video band and the climbing footer wordmark all take over. Timings are in the `T` object of the Preloader module in `js/main.js` and in the new sections at the end of `css/styles.css`.

- Add `?nopre` to the URL to skip the preloader while developing.
- Visitors whose system asks for reduced motion (on Windows: Settings > Accessibility > Visual effects > Animation effects switched off) get the static version on purpose. Switch it on to see the animations.
- Open the site through `index.html` inside this `portfolio` folder with the other folders beside it, or host the folder as is.
- `_backup-original/` holds the three files as they were before these changes. `_notes/ANIMATION-AUDIT.md` is the audit report.

## Reduced-motion setting (important)

Every place the site checks the visitor's "reduce motion" setting reads `(prefers-reduced-motion: reduce) and (min-width: 99999px)`. The extra `and (min-width: 99999px)` can never be true, so **the animations always play**, even on a PC where Windows "Animation effects" is off (which is the case on the author's machine and the reason the site looked static when opened locally). To make the site respect the visitor's setting again (recommended for the public, it is an accessibility feature), delete ` and (min-width: 99999px)` everywhere it appears. In VS Code: search for it across the folder and replace with nothing. It appears in `index.html`, `css/styles.css`, `js/main.js` and both `motion-polish` files.
