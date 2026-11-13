# Quieter

An ultra-lightweight (**~161 KB** zipped), zero-dependency editorial New Tab extension for **Chrome, Brave, Edge**, and other Chromium-based browsers[cite: 66, 67].

Built with pure Vanilla HTML5, CSS3, and ES6+ JavaScript on **Manifest V3**, **Quieter** replaces your default New Tab page with a calm, distraction-free stage for curated quotes, bilingual typography, and glassmorphic shortcuts—loading in under 50 milliseconds with zero network calls.

---

## Features

- **Non-Repeating Fisher–Yates Shuffle:** Displays a fresh quote every time you open your browser or a new tab (`→` / `←` to step forward or back through your session).
- **Automatic Bilingual Script Detection:** Parses mixed-language text word-by-word (`\u0980–\u09FF`), rendering English in **Poppins / JetBrains Mono** and বাংলা in bundled **Noto Serif Bengali**—with full support for loading any font installed on your PC[cite: 57, 67].
- **Category & Favorites Stage Filtering:** Filter the active quote rotation by **Category**, **Favorites Only (`★`)**, or **Writer / Source**, and display clean Category pills on stage[cite: 57, 67].
- **Preloaded Quote Bank (`quotes-bank.js`):** Ships with 200 categorized quotes out of the box and auto-merges any additions you place in `quotes-bank.js` without duplicating existing entries[cite: 60, 67].
- **Bulk Import, Web Clipping & Full Backup:**
  - Paste `Quote — Author` blocks with a live preview.
  - Import `.txt`, `.md`, `.csv`, Kindle `My Clippings.txt`, or JSON files.
  - Highlight text on any webpage and right-click **Save as quote to Quieter**[cite: 61, 67].
  - Export/restore either quotes-only JSON or a **Full Backup** (quotes, favorites, font pairings, themes, and shortcuts)[cite: 57, 67].
- **High-Res 2x PNG Quote Card Export:** Render the active quote, writer, monogram watermark, and ambient gradient onto an HTML5 `<canvas>` (`1600×1000`) and download a crisp PNG with zero external libraries[cite: 57, 67].
- **Spotlight Multi-Engine Search Bar:** Defaults to Google, auto-navigates direct URLs, and supports instant search prefixes (`yt `, `gh `, `w `, `ddg `, `g `)[cite: 57, 67]. Press `/` to focus immediately.
- **8 Glassy Shortcut Tiles + Optional Bookmarks Strip:** Combines pinned favourites with Most Visited sites (right-click any tile to Pin, Edit, or Hide), plus an optional toggleable bookmarks folder strip[cite: 57, 67].
- **Calm Atmosphere:** Light/Dark mode toggle, 4 built-in ambient gradients, custom accent color & glass opacity sliders, local photo background support, Calm Mode (`Esc` to restore), and configurable idle auto-hide for top controls[cite: 57, 67].

---

## Installation (Developer / Unpacked)

1. **Download or clone** this repository:
   ```bash
   git clone [https://github.com/siammehraf/quieter.git](https://github.com/siammehraf/quieter.git)
   ```
