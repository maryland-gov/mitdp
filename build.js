#!/usr/bin/env node
/**
 * MITDP Markdown -> Maryland Web Design System (MDWDS) HTML builder.
 *
 * Reads every `content/*.md` file, converts it to HTML, injects `.usa-*`
 * classes so the output matches the Maryland design system, wraps it in a
 * standalone GitHub Pages page (with the iframe auto-height reporter), and
 * writes the result to `docs/<name>.html` for GitHub Pages to serve.
 *
 * Run: `npm run build`
 */

const fs = require("fs");
const path = require("path");
const MarkdownIt = require("markdown-it");
const attrs = require("markdown-it-attrs");
const { load } = require("cheerio");

// ---------------------------------------------------------------------------
// Configuration — edit these two values for your environment.
// ---------------------------------------------------------------------------
const CONFIG = {
  // The SharePoint host that will embed these pages. The child page posts its
  // height ONLY to this origin (never "*"), so set it correctly.
  parentOrigin: "https://doit.maryland.gov",
  // The MDWDS stylesheet, pinned to the version digital.maryland.gov serves so
  // components render identically. Bump this when Maryland ships a new release.
  mdwdsCss: "https://cdn.maryland.gov/mdwds/0.47.4/css/mdwds.min.css",

  // --- Official Maryland site header/footer ("site chrome") ---------------
  // Set to false to build pages with no header/footer at all.
  siteChrome: true,

  // Title shown next to the state logo in the header.
  siteName: "Major IT Development Project (MITDP) Oversight",

  // Attribution block above the official statewide footer.
  footer: {
    title:
      "This content is published by the State of Maryland Department of Information Technology (DoIT), in partnership with State agencies",
    text: "For questions about MITDP oversight, contact the MITDP Oversight team.",
    links: [
      { text: "MITDP Dashboard", href: "https://mitdp.maryland.gov" },
      {
        text: "MITDP Oversight",
        href: "https://doit.maryland.gov/MITDP-Oversight/Pages/MITDP-oversight.aspx",
      },
    ],
  },
};

const CONTENT_DIR = path.join(__dirname, "content");
const OUT_DIR = path.join(__dirname, "docs");
const TEMPLATE = fs.readFileSync(path.join(__dirname, "template.html"), "utf8");

/**
 * Build the site header/footer HTML from the partials in `partials/`,
 * filling in the configurable text from CONFIG. Returns empty strings when
 * CONFIG.siteChrome is false.
 */
function buildChrome() {
  if (!CONFIG.siteChrome) return { header: "", footer: "" };

  const header = fs
    .readFileSync(path.join(__dirname, "partials", "header.html"), "utf8")
    .replace(/\{\{SITE_NAME\}\}/g, () => escapeHtml(CONFIG.siteName));

  const links = (CONFIG.footer.links || [])
    .map(
      (l) =>
        `<a class="site-footer__link" href="${escapeHtml(l.href)}">${escapeHtml(l.text)}</a>`
    )
    .join("");

  const footer = fs
    .readFileSync(path.join(__dirname, "partials", "footer.html"), "utf8")
    .replace(/\{\{FOOTER_TITLE\}\}/g, () => escapeHtml(CONFIG.footer.title))
    .replace(/\{\{FOOTER_TEXT\}\}/g, () => escapeHtml(CONFIG.footer.text))
    .replace(/\{\{FOOTER_LINKS\}\}/g, () => links);

  return { header, footer };
}

// ---------------------------------------------------------------------------
// Markdown engine. Tables are on by default in markdown-it; `attrs` turns
// `## Heading {#anchor}` into `id="anchor"` so internal links keep working.
// ---------------------------------------------------------------------------
const md = new MarkdownIt({ html: false, linkify: true }).use(attrs, {
  allowedAttributes: ["id", "class"],
});

/**
 * Post-process the raw Markdown HTML: inject MDWDS classes and convert the
 * Google-Docs "single-cell table" callouts into proper alert boxes.
 */
function decorate(html, pageContext = { sourceDir: "", pageUrl: "" }) {
  const { sourceDir, pageUrl } = pageContext;
  const $ = load(html, null, false);

  // 0. Demote malformed headings. Google Docs sometimes exports styled body
  //    text as `## …` — these read like a big <h2> in the browser. Any
  //    heading that's clearly a full sentence (>60 chars AND ends with `.`
  //    or `!`) is treated as a paragraph. Question-headings (ending `?`)
  //    and short headings are left alone.
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    if (text.length > 60 && /[.!]$/.test(text)) {
      $el.replaceWith(`<p>${$el.html()}</p>`);
    }
  });

  // 1. Drop empty headings (the export leaves stray "# " lines behind).
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    if ($(el).text().trim() === "") $(el).remove();
  });

  // 2. Card grid: a `.card-grid` heading followed by a table where each cell
  //    is "[link] description text" (optionally `**[link]**`) becomes a
  //    responsive card grid. Runs BEFORE the generic table handler below so
  //    these tables don't fall through to the striped-table styling.
  $("h2.card-grid, h3.card-grid, h4.card-grid").each((_, heading) => {
    const $h = $(heading);
    const $table = $h.next("table");
    if (!$table.length) return;

    const cards = [];
    $table.find("tr").each((_, tr) => {
      $(tr).find("td, th").each((__, cell) => {
        const $cell = $(cell);
        if (!$cell.text().trim()) return; // skip empty trailing cells

        // Locate the link (may be wrapped in a lone <strong>).
        const $link = $cell.find("a").first();
        if (!$link.length) return;

        const href = $link.attr("href") || "#";
        const titleHtml = $link.html();

        // Description = whatever remains after removing the link (and its
        // strong wrapper, if the strong contains only the link).
        const $wrap = $link.parent();
        if ($wrap.is("strong") && $wrap.children().length === 1 && !$wrap.text().replace($link.text(), "").trim()) {
          $wrap.remove();
        } else {
          $link.remove();
        }
        const description = $cell.html().replace(/^[\s\u00A0]+|[\s\u00A0]+$/g, "");

        cards.push({ href, titleHtml, description });
      });
    });
    if (!cards.length) return;

    const isExternal = (href) => /^https?:\/\//i.test(href);
    const cardsHtml = cards
      .map((c) => {
        const linkAttrs = isExternal(c.href) ? ` rel="noopener"` : "";
        return (
          `<a class="card-grid__card" href="${c.href}"${linkAttrs}>` +
            `<div class="card-grid__title-row">` +
              `<span class="card-grid__title">${c.titleHtml}</span>` +
              `<span class="card-grid__arrow" aria-hidden="true">→</span>` +
            `</div>` +
            (c.description ? `<p class="card-grid__desc">${c.description}</p>` : "") +
          `</a>`
        );
      })
      .join("");

    $h.removeClass("card-grid");
    if (!$h.attr("class")) $h.removeAttr("class");
    $table.replaceWith(`<div class="card-grid">${cardsHtml}</div>`);
  });

  // 2b. Image-right sections: `## Heading {.image-right}` followed by an
  //     image (and other content) up to the next heading of the same or
  //     higher level becomes a two-column layout: content on left, image on
  //     right. Collapses to single column on narrow viewports.
  $("h2.image-right, h3.image-right, h4.image-right").each((_, heading) => {
    const $h = $(heading);
    const level = parseInt(heading.tagName.charAt(1), 10);

    // Collect all siblings up to the next same-or-higher-level heading.
    const siblings = [];
    let $sib = $h.next();
    while ($sib.length) {
      const tag = ($sib.prop("tagName") || "").toLowerCase();
      if (/^h[1-6]$/.test(tag) && parseInt(tag.charAt(1), 10) <= level) break;
      siblings.push($sib.get(0));
      $sib = $sib.next();
    }

    // Find the first image; the paragraph wrapping it (if any) becomes the
    // right column, everything else the left column.
    let imgHtml = null;
    let imgSourceEl = null;
    for (const el of siblings) {
      const $el = $(el);
      if ($el.is("img")) {
        imgHtml = $.html($el);
        imgSourceEl = el;
        break;
      }
      if ($el.is("p") && $el.children().length === 1 && $el.children().first().is("img")) {
        imgHtml = $.html($el.children().first());
        imgSourceEl = el;
        break;
      }
    }
    if (!imgHtml) return; // no image found; leave section as-is

    const contentHtml = siblings
      .filter((el) => el !== imgSourceEl)
      .map((el) => $.html(el))
      .join("");

    $h.removeClass("image-right");
    if (!$h.attr("class")) $h.removeAttr("class");
    // Keep the heading as a direct child of `.usa-prose` so its MDWDS
    // `.usa-prose > h2` display styling still applies. Only wrap the content
    // and image below it.
    siblings.forEach((el) => $(el).remove());
    $h.after(
      `<div class="section-image-right">` +
        `<div class="section-image-right__content">${contentHtml}</div>` +
        `<div class="section-image-right__image">${imgHtml}</div>` +
      `</div>`
    );
  });

  // 3. Tables: a single-column table is a callout; anything wider is data.
  $("table").each((_, el) => {
    const $table = $(el);
    const columns = Math.max(
      $table.find("thead tr").first().children().length,
      $table.find("tbody tr").first().children().length
    );

    if (columns <= 1) {
      // Single-cell table = a Google-Docs callout. Pull the inner HTML of
      // every cell so links and inline formatting survive.
      const cellHtml = $table
        .find("th, td")
        .map((__, cell) => $(cell).html().trim())
        .get()
        .filter(Boolean)
        .join(" ");

      // Announcement-style callouts (prefixed Note:/Alert:/Warning:/Success:)
      // become MDWDS Alerts; everything else becomes a Summary Box — matching
      // Maryland's guidance to use an Alert for something new and a Summary Box
      // to surface key information from the page.
      const alertMatch = $table
        .text()
        .trim()
        .match(/^(note|alert|important|warning|success)\s*:/i);

      if (alertMatch) {
        const variant = {
          note: "info",
          alert: "info",
          important: "warning",
          warning: "warning",
          success: "success",
        }[alertMatch[1].toLowerCase()];
        const body = cellHtml.replace(/^\s*[^:]{1,12}:\s*/, "");
        $table.replaceWith(alertBox(variant, body));
      } else {
        $table.replaceWith(summaryBox(cellHtml));
      }
    } else {
      // Data table -> striped MDWDS table. Stays a direct child of
      // `.usa-prose`, which is what the MDWDS table styles target.
      $table.addClass("usa-table usa-table--striped");
    }
  });

  // 3. Table-of-contents blocks: `## Sections {.toc}` followed by a list is
  //    rewritten as a two-column linked nav (see .section-toc CSS in the
  //    template). Preserves any explicit id on the heading so incoming anchor
  //    links keep working.
  $("h2.toc, h3.toc, h4.toc").each((_, el) => {
    const $heading = $(el);
    const $list = $heading.next("ul, ol");
    if (!$list.length) return; // no list to attach; leave heading as-is

    const tag = el.tagName.toLowerCase();
    const headingHtml = $heading.html();
    const headingId =
      $heading.attr("id") || `toc-${slug($heading.text() || "sections")}`;

    const items = $list
      .children("li")
      .map((__, li) => `<li>${$(li).html()}</li>`)
      .get()
      .join("");

    $list.remove();
    $heading.replaceWith(
      `<nav class="section-toc" aria-labelledby="${headingId}">` +
        `<${tag} class="section-toc__title" id="${headingId}">${headingHtml}</${tag}>` +
        `<ul class="section-toc__list">${items}</ul>` +
        `</nav>`
    );
  });

  // 3b. Multi-column TOC: consecutive `heading.toc-column` + list pairs are
  //     grouped into a single .section-toc-columns wrapper for a grid layout.
  //     "Consecutive" means: heading, list, heading, list, ... with only
  //     whitespace/empty nodes in between. Any non-matching element ends the
  //     run and starts a fresh group later on.
  const tocColSel = "h2.toc-column, h3.toc-column, h4.toc-column";
  const seen = new Set();
  $(tocColSel).each((_, el) => {
    if (seen.has(el)) return;

    const run = [];
    let $cur = $(el);
    while ($cur.length && $cur.is(tocColSel)) {
      const $list = $cur.next("ul, ol");
      if (!$list.length) break;
      run.push({ heading: $cur.get(0), list: $list.get(0) });
      seen.add($cur.get(0));
      $cur = $list.next();
    }
    if (run.length === 0) return;

    const columnsHtml = run
      .map(({ heading, list }) => {
        const $h = $(heading);
        const $l = $(list);
        const tag = heading.tagName.toLowerCase();
        const id = $h.attr("id") || `toc-col-${slug($h.text() || "column")}`;
        const items = $l
          .children("li")
          .map((__, li) => `<li>${$(li).html()}</li>`)
          .get()
          .join("");
        return (
          `<nav class="section-toc-column" aria-labelledby="${id}">` +
            `<${tag} class="section-toc-column__title" id="${id}">${$h.html()}</${tag}>` +
            `<ul class="section-toc-column__list">${items}</ul>` +
          `</nav>`
        );
      })
      .join("");

    // Remove everything in the run except the first heading, which we replace.
    run.slice(1).forEach(({ heading, list }) => {
      $(heading).remove();
      $(list).remove();
    });
    $(run[0].list).remove();
    $(run[0].heading).replaceWith(
      `<div class="section-toc-columns">${columnsHtml}</div>`
    );
  });

  // 3d. Buttons: `[Text](url){.button}` becomes a primary USWDS button;
  //     add `.outline` for the outlined secondary variant. Runs before the
  //     generic link decoration so buttons don't also get .usa-link classes.
  $("a.button").each((_, el) => {
    const $el = $(el);
    const outline = $el.hasClass("outline");
    $el.removeClass("button outline");
    $el.addClass("usa-button");
    if (outline) $el.addClass("usa-button--outline");
    if (!$el.attr("class")) $el.removeAttr("class");
  });

  // 3e. Intro paragraphs: `paragraph text {.intro}` becomes a USWDS
  //     `.usa-intro` lede — a slightly larger paragraph style, typically
  //     used for the first paragraph after a page title.
  $("p.intro").each((_, el) => {
    const $el = $(el);
    $el.removeClass("intro");
    $el.addClass("usa-intro");
    if (!$el.attr("class")) $el.removeAttr("class");
  });

  // 4. Give links the design-system class (external links get the marker),
  //    but skip cards and buttons which have their own styling. Also rewrite
  //    intra-site links from source-relative to the correct output-relative
  //    form so `.md`/`.html` links become clean URLs at the right depth for
  //    the current page's location.
  $("a").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href");
    if (href) {
      const rewritten = relativizeUrl(pageUrl, href, sourceDir);
      if (rewritten !== href) $el.attr("href", rewritten);
    }

    if ($el.hasClass("card-grid__card") || $el.hasClass("usa-button")) return;
    const finalHref = $el.attr("href") || "";
    $el.addClass("usa-link");
    if (/^https?:\/\//i.test(finalHref)) {
      $el.addClass("usa-link--external").attr("rel", "noopener");
    }
  });

  // 5. Rewrite <img src> the same way so relative image paths resolve
  //    correctly no matter how deep the page is in the folder tree.
  $("img").each((_, el) => {
    const $el = $(el);
    const src = $el.attr("src");
    if (src) $el.attr("src", relativizeUrl(pageUrl, src, sourceDir));
  });

  return $.html();
}

// Ensures aria-labelledby ids are unique within a page.
let boxCounter = 0;
function slug(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * True for URLs that are already absolute or shouldn't be treated as
 * relative site paths: http(s), mailto:, tel:, javascript:, data:, protocol-
 * relative //, root-absolute /, pure fragments #, and query-only strings ?.
 */
function isAbsoluteLike(url) {
  return /^(https?:|mailto:|tel:|javascript:|data:|\/\/|#|\/|\?)/i.test(url);
}

/**
 * Turn a Markdown-authored URL into the correct relative URL for the built
 * page. Follows standard Markdown semantics: paths in the source are
 * resolved relative to the source `.md` file's directory. Handles arbitrary
 * folder nesting, so a page at `docs/launchpad/stage-1/index.html` can link
 * to `../sdlc.md` (up one folder) and get back a correct number of `../`s.
 *
 * fromPageUrl  – URL of the current page, e.g. "launchpad/stage-1/"
 * linkHref     – href value from the source markdown, e.g. "stage-2.md"
 *                or "../sdlc.html#anchor"
 * sourceDir    – dir of the source markdown, e.g. "launchpad/" (with slash)
 *                or "" for content root.
 *
 * Absolute URLs, mailto:/tel:/etc., and pure fragments are returned as-is.
 * `.md` and `.html` extensions are normalised to a trailing slash so the
 * resulting URL matches the clean-URL output structure.
 */
function relativizeUrl(fromPageUrl, linkHref, sourceDir) {
  if (!linkHref || isAbsoluteLike(linkHref)) return linkHref;

  const hashIdx = linkHref.indexOf("#");
  const linkPath = hashIdx >= 0 ? linkHref.slice(0, hashIdx) : linkHref;
  const fragment = hashIdx >= 0 ? linkHref.slice(hashIdx) : "";
  if (!linkPath) return linkHref; // pure fragment

  // Resolve source-relative to a content-root-relative path.
  const resolved = path.posix.join(sourceDir || ".", linkPath);

  // `.md` or `.html` on the last segment becomes a clean-URL trailing slash.
  const targetUrl = resolved.replace(/([^\/]+)\.(html?|md)$/i, "$1/");

  // Compute the correct relative URL from the current page's directory.
  const fromDir = fromPageUrl.endsWith("/") ? fromPageUrl : fromPageUrl + "/";
  let rel = path.posix.relative(fromDir, targetUrl);
  if (targetUrl.endsWith("/") && rel && !rel.endsWith("/")) rel += "/";
  if (!rel) return fragment || "./";
  return rel + fragment;
}

/**
 * Detect an inline numbered-list run ("1. … 2. … 3. …") inside a string and
 * convert it into a real <ol>. Returns { prose, list } where `prose` is any
 * text before the list, or null if no valid sequential list was found.
 *
 * Why this exists: Google Docs exports numbered lists inside a callout box as
 * flowing text within a single Markdown table cell, and standard Markdown
 * tables can't hold block-level list items. Some exports even drop the "1."
 * "2." markers entirely — in that case the numbers must be re-added in the
 * source markdown for this function to find them.
 */
function inlineOlToHtml(text) {
  // Cheap gate: must contain "1. " somewhere.
  const startIdx = text.search(/(?:^|\s)1\.\s+\S/);
  if (startIdx < 0) return null;

  const prose = text.slice(0, startIdx).trim();
  const listPart = text.slice(startIdx).replace(/^\s+/, "");

  const items = [];
  const rx = /(\d+)\.\s+([\s\S]+?)(?=\s+\d+\.\s+|$)/g;
  let m;
  let expected = 1;
  while ((m = rx.exec(listPart)) !== null) {
    if (parseInt(m[1], 10) !== expected) return null; // must be 1, 2, 3, …
    items.push(m[2].trim());
    expected++;
  }
  if (items.length < 2) return null;

  return {
    prose,
    list:
      `<ol class="usa-list">` +
      items.map((i) => `<li>${i}</li>`).join("") +
      `</ol>`,
  };
}

/**
 * Detect an inline bulleted-list run inside a string and convert it into a
 * real <ul>. Two marker conventions are supported:
 *   `•` — bullet character. Rare in prose, so a prose lead-in before the
 *         list is allowed (as with numbered lists).
 *   `- ` — hyphen + space. High false-positive risk (em-dashes, compounds),
 *         so the body MUST start with this marker; no lead-in permitted.
 * Returns { prose, list } or null.
 */
function inlineUlToHtml(text) {
  // Try `•` first: allow prose before the first bullet.
  const bulletStart = text.search(/(?:^|\s)•\s+\S/);
  if (bulletStart >= 0) {
    const prose = text.slice(0, bulletStart).trim();
    const listPart = text.slice(bulletStart).replace(/^\s+/, "");
    const items = [];
    const rx = /(?:^|\s)•\s+([\s\S]+?)(?=\s+•\s+|$)/g;
    let m;
    while ((m = rx.exec(listPart)) !== null) items.push(m[1].trim());
    if (items.length >= 2) return { prose, list: renderUl(items) };
  }

  // Fall back to `- ` — only if the body starts with one, to avoid matching
  // em-dashes and hyphenated compounds mid-prose.
  if (/^-\s+\S/.test(text)) {
    const items = [];
    const rx = /(?:^|\s)-\s+([\s\S]+?)(?=\s+-\s+|$)/g;
    let m;
    while ((m = rx.exec(text)) !== null) items.push(m[1].trim());
    if (items.length >= 2) return { prose: "", list: renderUl(items) };
  }

  return null;
}

function renderUl(items) {
  return (
    `<ul class="usa-list">` +
    items.map((i) => `<li>${i}</li>`).join("") +
    `</ul>`
  );
}

/**
 * MDWDS Summary Box. If the callout opens with a short lead-in phrase ending
 * in a colon (e.g. "…ensures that:"), that becomes the heading and the rest
 * becomes the body — which is exactly the Summary Box title + text shape.
 */
function summaryBox(cellHtml) {
  const m = cellHtml.match(/^([^:<]{3,140}?):\s+([\s\S]+)$/);
  let heading = null;
  let bodyHtml = cellHtml;
  if (m) {
    heading = m[1].trim();
    bodyHtml = m[2].trim();
  }

  // Recover any inline numbered list ("1. … 2. …") as a real <ol>. See
  // inlineOlToHtml above for why this is needed.
  const ol = inlineOlToHtml(bodyHtml);
  if (ol) {
    bodyHtml = (ol.prose ? `<p>${ol.prose}</p>` : "") + ol.list;
  } else {
    // No numbered list — check for a bulleted one ("• …" or "- …").
    const ul = inlineUlToHtml(bodyHtml);
    if (ul) {
      bodyHtml = (ul.prose ? `<p>${ul.prose}</p>` : "") + ul.list;
    }
  }

  const hasBlock = /<(p|ul|ol|div|h[1-6])\b/i.test(bodyHtml);
  const text = hasBlock ? bodyHtml : `<p>${bodyHtml}</p>`;
  const inner =
    `<div class="usa-summary-box__body">` +
    (heading
      ? `<h3 class="usa-summary-box__heading" id="{{ID}}">${heading}</h3>`
      : "") +
    `<div class="usa-summary-box__text">${text}</div>` +
    `</div>`;

  if (heading) {
    const id = `summary-${slug(heading)}-${boxCounter++}`;
    return (
      `<div class="usa-summary-box" role="region" aria-labelledby="${id}">` +
      inner.replace("{{ID}}", id) +
      `</div>`
    );
  }
  return `<div class="usa-summary-box">${inner}</div>`;
}

/** MDWDS Alert (info | warning | success), used for announcement callouts. */
function alertBox(variant, bodyHtml) {
  const hasBlock = /<(p|ul|ol)\b/i.test(bodyHtml);
  const text = hasBlock
    ? bodyHtml
    : `<p class="usa-alert__text">${bodyHtml}</p>`;
  return (
    `<div class="usa-alert usa-alert--${variant}">` +
    `<div class="usa-alert__body">${text}</div></div>`
  );
}

// ---------------------------------------------------------------------------
// SDLC interactive-timeline builder.
// A markdown file containing a "Template: sdlc" line is parsed into the
// stages[] data that sdlc-template.html renders as the timeline + step list.
// ---------------------------------------------------------------------------
const SDLC_TEMPLATE = fs.readFileSync(path.join(__dirname, "sdlc-template.html"), "utf8");

// Timeline colors/darkness by position (from the prototype). If there are ever
// more phases than palette entries, the palette repeats.
const SDLC_PALETTE = [
  { color: "#FFC233", dark: false },
  { color: "#97D4EA", dark: false },
  { color: "#E0E1E3", dark: false },
  { color: "#1A5A92", dark: true },
  { color: "#00599A", dark: true },
  { color: "#1A4480", dark: true },
  { color: "#162E51", dark: true },
];

const stripMd = (s) =>
  s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").trim();

function parseSdlc(src) {
  const lines = src.split(/\r?\n/);
  const meta = { title: "SDLC", intro: "" };
  const stages = [];
  let cur = null;
  const introParas = [];

  const flushDetail = () => {
    if (cur && cur._buf.length) {
      cur.detail = (cur.detail ? cur.detail + " " : "") + cur._buf.join(" ");
      cur._buf = [];
    }
  };

  for (const raw of lines) {
    // strip a leading list bullet the Google export adds to everything
    const line = raw.replace(/^\s*\*\s?(?!\*)/, "").trim();
    if (!line || line === "---" || /^\[\s*Interactive diagram/i.test(line)) continue;

    let m;
    if ((m = line.match(/^Template:\s*(.+)$/i))) continue;
    if ((m = line.match(/^Title:\s*(.+)$/i))) { meta.title = stripMd(m[1]); continue; }

    // Phase heading: "### **Title** *(optional)*". A heading WITHOUT bold is
    // export noise (see the Delivery glitch) — treat its text as detail.
    if ((m = line.match(/^#{2,4}\s*(.+)$/))) {
      const h = m[1].trim();
      const bold = h.match(/^\*\*(.+?)\*\*\s*(?:\*\((.+?)\)\*)?\s*$/);
      if (bold) {
        flushDetail();
        cur = {
          key: stripMd(bold[1]).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
          title: stripMd(bold[1]),
          opt: bold[2] ? `(${bold[2]})` : "",
          text: "", detail: "", milestone: null, weight: 1, gate: null,
          _buf: [], _gateBuf: null,
        };
        stages.push(cur);
        continue;
      }
      if (cur) { cur._buf.push(stripMd(h)); continue; }
    }

    if (!cur) { if (!/^#/.test(line)) introParas.push(stripMd(line)); continue; }

    // Field lines: *Timeline:* / *Milestone:* / *Weight:*. The bullet cleaner
    // above may have already eaten the leading asterisk, so it's optional.
    if ((m = line.match(/^\*{0,2}(Timeline|Milestone|Weight)\s*:\*{0,2}\s*(.+)$/i))) {
      const [, field, value] = m;
      const v = stripMd(value);
      if (/^timeline$/i.test(field)) cur.text = v;
      else if (/^milestone$/i.test(field)) cur.milestone = v;
      else cur.weight = parseFloat(v) || 1;
      continue;
    }

    // Gate: "**Gate: Name**" then description lines until the next phase.
    if ((m = line.match(/^\*\*Gate\s*:\s*(.+?)\*\*\s*(.*)$/i))) {
      flushDetail();
      cur.gate = { name: stripMd(m[1]), desc: stripMd(m[2] || "") };
      cur._gateBuf = cur.gate;
      continue;
    }
    if (cur._gateBuf) {
      cur._gateBuf.desc = (cur._gateBuf.desc ? cur._gateBuf.desc + " " : "") + stripMd(line);
      continue;
    }

    cur._buf.push(stripMd(line));
  }
  flushDetail();

  meta.intro = introParas.join(" ");
  stages.forEach((s, i) => {
    const pal = SDLC_PALETTE[i % SDLC_PALETTE.length];
    s.n = i + 1;
    s.color = pal.color;
    s.dark = pal.dark;
    s.italic = !!s.opt;
    if (!s.text) s.text = s.detail.split(/(?<=\.)\s/)[0] || s.title; // fallback: first sentence
    if (s.gate && !s.gate.desc) s.gate = { ...s.gate, desc: "" };
    delete s._buf;
    delete s._gateBuf;
  });

  return { meta, stages };
}

function buildSdlcPage(src, name) {
  const { meta, stages } = parseSdlc(src);
  if (stages.length === 0) throw new Error(`${name}: no phases found — check the '### **Title**' headings`);
  const chrome = buildChrome();
  return interpolate(SDLC_TEMPLATE, {
    TITLE: escapeHtml(meta.title),
    INTRO: escapeHtml(meta.intro),
    PARENT_ORIGIN: CONFIG.parentOrigin,
    SITE_HEADER: chrome.header,
    SITE_FOOTER: chrome.footer,
    STAGES_JSON: JSON.stringify(stages, null, 1).replace(/</g, "\\u003c"),
  });
}

function titleFrom(html, fallback) {
  const $ = load(html, null, false);
  const h1 = $("h1").first().text().trim();
  return h1 || fallback;
}

function build() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Mirror content/images/ (and any other non-markdown asset subdirs) into
  // docs/ so relative paths like ![](images/foo.png) resolve on GitHub Pages.
  copyAssets(CONTENT_DIR, OUT_DIR);

  // Custom 404 page. GitHub Pages serves this for any unmatched URL. The
  // script gracefully redirects legacy `.html` URLs to their clean-URL
  // equivalents so old SharePoint iframes don't hard-404 during transition.
  fs.writeFileSync(
    path.join(OUT_DIR, "404.html"),
    `<!doctype html>
<meta charset="utf-8">
<title>Page not found</title>
<script>
  (function () {
    var p = window.location.pathname;
    if (/\\.html$/i.test(p)) {
      window.location.replace(p.replace(/\\.html$/i, "/") + window.location.search + window.location.hash);
    }
  })();
</script>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#1b1b1b;}</style>
<h1>Page not found</h1>
<p>The page you're looking for doesn't exist. If you got here from an older link ending in <code>.html</code>, you'll be redirected automatically.</p>
`,
    "utf8"
  );

  const files = walkMarkdown(CONTENT_DIR);

  if (files.length === 0) {
    console.warn("No .md files found in content/");
    return;
  }

  for (const file of files) {
    // `file` is a POSIX-style path relative to CONTENT_DIR, e.g.
    // "launchpad/stage-1.md" or "stage-1.md".
    const src = fs.readFileSync(path.join(CONTENT_DIR, file), "utf8");
    const name = file.replace(/\.md$/i, "");     // e.g. "launchpad/stage-1"
    const dir = path.posix.dirname(file);         // e.g. "launchpad" or "."
    const sourceDir = dir === "." ? "" : dir + "/";
    const pageUrl = name + "/";                   // e.g. "launchpad/stage-1/"

    // Files declaring "Template: sdlc" render as the interactive timeline.
    if (/^Template:\s*sdlc\s*$/im.test(src)) {
      writePage(name, buildSdlcPage(src, name), "SDLC interactive timeline");
      continue;
    }

    const body = decorate(md.render(src), { sourceDir, pageUrl });
    const title = titleFrom(body, name);

    const chrome = buildChrome();
    const page = interpolate(TEMPLATE, {
      TITLE: escapeHtml(title),
      MDWDS_CSS: CONFIG.mdwdsCss,
      PARENT_ORIGIN: CONFIG.parentOrigin,
      SITE_HEADER: chrome.header,
      SITE_FOOTER: chrome.footer,
      CONTENT: body,
    });

    writePage(name, page, title);
  }
}

/**
 * Recursively walk `content/` and return every .md file as a POSIX-style
 * path relative to the content root. Skips hidden files, the `images`
 * subtree (that's for assets, not markdown), and any node_modules.
 */
function walkMarkdown(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // `images` (at any level) is assets, not markdown pages.
      if (entry.name === "images") continue;
      out.push(...walkMarkdown(full, base));
    } else if (entry.name.toLowerCase().endsWith(".md")) {
      out.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return out;
}

/**
 * Write a built page using the clean-URL structure: docs/<name>/index.html,
 * served at /<name>/ on GitHub Pages. (Previously also wrote a `.html`
 * redirect stub for backwards compat, but that created routing ambiguity —
 * GitHub Pages could serve either file for /<name>/ URLs unpredictably.)
 */
function writePage(name, html, label) {
  const dir = path.join(OUT_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
  console.log(`built docs/${name}/  (${label})`);
}

/**
 * Substitute {{PLACEHOLDER}} tokens in a template with the given values.
 * Uses a function-based replacement so `$` sequences in the value (like
 * `$&`, `$'`, `$1`) aren't interpreted as regex backreferences — a well-
 * known footgun of `String.prototype.replace(string, string)`.
 *
 * After substitution, verifies that no placeholder tokens remain in the
 * output. If any do, throws — this catches the case where a placeholder
 * was added to the template but not wired up in the build, which would
 * otherwise silently ship a page with raw `{{FOO}}` visible or evaluated
 * as JavaScript.
 */
function interpolate(template, values) {
  let out = template;
  for (const [key, value] of Object.entries(values)) {
    const rx = new RegExp("\\{\\{" + key + "\\}\\}", "g");
    out = out.replace(rx, () => String(value));
  }
  const stray = out.match(/\{\{[A-Z_]+\}\}/);
  if (stray) {
    throw new Error(
      `Placeholder ${stray[0]} was not substituted. Wire it up in the interpolate() call.`
    );
  }
  return out;
}

function copyAssets(srcDir, destDir) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name.toLowerCase().endsWith(".md")) continue;
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      copyAssets(src, dest);
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

build();
