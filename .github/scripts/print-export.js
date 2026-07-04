#!/usr/bin/env node
/**
 * print-export.js — export the Hugo `print` output to PDF and DOCX.
 *
 * Usage: node print-export.js <lang> <baseUrl>
 *   lang    — "en" or "ru"
 *   baseUrl — e.g. http://localhost:8080
 *
 * Environment:
 *   PRODUCT_CODE           — required; used as file name (<PRODUCT_CODE>.pdf/.docx).
 *   EXTERNAL_ASSETS_BASE   — where to fetch /images/* etc. Default: https://deckhouse.io
 *   PANDOC_REFERENCE_DOC   — path to reference.docx. Default: ./reference.docx (script dir).
 *   PANDOC_LUA_FILTER      — path to alert.lua.       Default: ./alert.lua        (script dir).
 *   PUBLIC_DIR             — root of built site. Default: ./public.
 *   MERMAID_TIMEOUT_MS     — how long to wait for mermaid render. Default: 60000.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const [, , lang, baseUrl] = process.argv;
if (!lang || !baseUrl) {
  console.error('Usage: node print-export.js <lang> <baseUrl>');
  process.exit(1);
}

const productCode = (process.env.PRODUCT_CODE || '').toLowerCase();
if (!productCode) {
  console.error('PRODUCT_CODE env var is required.');
  process.exit(1);
}

const externalBase = (process.env.EXTERNAL_ASSETS_BASE || 'https://deckhouse.io').replace(/\/$/, '');
const publicDir = path.resolve(process.env.PUBLIC_DIR || 'public');
const scriptDir = __dirname;
const refDoc = process.env.PANDOC_REFERENCE_DOC || path.join(scriptDir, 'reference.docx');
const luaFilter = process.env.PANDOC_LUA_FILTER || path.join(scriptDir, 'alert.lua');
const mermaidTimeout = parseInt(process.env.MERMAID_TIMEOUT_MS || '60000', 10);

const outDir = path.join(publicDir, lang, 'documentation', 'downloads', 'print');
fs.mkdirSync(outDir, { recursive: true });
const outPdf = path.join(outDir, `${productCode}.pdf`);
const outDocx = path.join(outDir, `${productCode}.docx`);

const printURL = `${baseUrl.replace(/\/$/, '')}/${lang}/print/documentation/`;

/**
 * Determine which URL-path attributes must be inlined vs which links may stay.
 * We inline everything that a viewer would auto-fetch on open (img/script/link/etc).
 * External <a href="…"> hyperlinks are preserved as-is.
 */
function shouldInline(url) {
  if (!url) return false;
  // Skip data:/blob:/mailto:/tel:/javascript:.
  if (/^(data|blob|mailto|tel|javascript):/i.test(url)) return false;
  // Skip our own site paths — those are already served by http-server.
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(url)) return false;
  return true;
}

const localBase = baseUrl.replace(/\/$/, '');

/**
 * For a URL-path found in HTML, list the candidate absolute URLs to try, in order.
 * Local http-server first (built-site assets like /en/css/print.css, /products/… .js
 * live there); external mirror second (e.g. /images/stronghold/*.png, which is not
 * in the built site — it's hosted on deckhouse.io).
 */
function candidatesFor(url) {
  if (/^https?:\/\//i.test(url)) return [url];
  if (url.startsWith('/')) return [localBase + url, externalBase + url];
  return []; // relative — leave alone
}

const mimeByExt = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.css': 'text/css',
  '.js': 'application/javascript',
};

async function fetchBinary(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  const mime = res.headers.get('content-type')?.split(';')[0].trim() || mimeByExt[ext] || 'application/octet-stream';
  return { buf, mime };
}

async function toDataUrl(candidates) {
  const errors = [];
  for (const url of candidates) {
    try {
      const { buf, mime } = await fetchBinary(url);
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch (e) {
      errors.push(`${url}: ${e.message}`);
    }
  }
  throw new Error(errors.join('; '));
}

/**
 * Walk the frozen HTML, download each remote-loaded asset (trying local first,
 * external mirror as fallback), and rewrite the HTML to reference data: URLs.
 *
 * mapping key is the ORIGINAL href/src as it appears in the HTML — so the
 * page.evaluate rewrite step can match by direct string equality.
 */
async function inlineExternalAssets(page) {
  const urls = await page.evaluate(() => {
    const seen = new Set();
    const push = (u) => { if (u) seen.add(u); };

    document.querySelectorAll('img[src], source[src]').forEach(el => push(el.getAttribute('src')));
    document.querySelectorAll('img[srcset], source[srcset]').forEach(el => {
      const srcset = el.getAttribute('srcset') || '';
      srcset.split(',').forEach(part => push(part.trim().split(/\s+/)[0]));
    });
    document.querySelectorAll('link[rel~="stylesheet"][href], link[rel~="icon"][href]').forEach(el => push(el.getAttribute('href')));
    document.querySelectorAll('script[src]').forEach(el => push(el.getAttribute('src')));
    document.querySelectorAll('use[href], use[*|href]').forEach(el => {
      const href = el.getAttribute('href') || el.getAttribute('xlink:href');
      if (href) push(href.split('#')[0]);
    });
    return Array.from(seen);
  });

  const mapping = {};
  for (const url of urls) {
    if (!shouldInline(url)) continue;
    const candidates = candidatesFor(url);
    if (candidates.length === 0) continue;
    if (mapping[url]) continue;
    try {
      mapping[url] = await toDataUrl(candidates);
    } catch (e) {
      throw new Error(`Cannot inline asset "${url}": ${e.message}`);
    }
  }

  await page.evaluate((mapping) => {
    const apply = (el, attr) => {
      const cur = el.getAttribute(attr);
      if (cur && mapping[cur]) el.setAttribute(attr, mapping[cur]);
    };

    document.querySelectorAll('img[src], source[src]').forEach(el => apply(el, 'src'));
    document.querySelectorAll('link[rel~="stylesheet"][href], link[rel~="icon"][href]').forEach(el => apply(el, 'href'));
    document.querySelectorAll('script[src]').forEach(el => apply(el, 'src'));
    document.querySelectorAll('use[href]').forEach(el => apply(el, 'href'));
    document.querySelectorAll('use[*|href]').forEach(el => {
      const cur = el.getAttribute('xlink:href');
      if (!cur) return;
      const base = cur.split('#')[0];
      if (mapping[base]) el.setAttribute('xlink:href', mapping[base]);
    });
    document.querySelectorAll('img[srcset], source[srcset]').forEach(el => {
      const srcset = el.getAttribute('srcset') || '';
      const rewritten = srcset.split(',').map(part => {
        const trimmed = part.trim();
        const [u, ...descriptor] = trimmed.split(/\s+/);
        const replaced = mapping[u] || u;
        return descriptor.length ? replaced + ' ' + descriptor.join(' ') : replaced;
      }).join(', ');
      el.setAttribute('srcset', rewritten);
    });
  }, mapping);
}

/**
 * Post-process the DOCX file:
 *   - Add visible borders around alert tables (Pandoc drops CSS borders on
 *     HTML tables).
 *   - Shrink code-block / inline-code font by 1pt relative to body text
 *     (Pandoc's default docx code style is body size).
 *
 * DOCX is a ZIP; we edit word/document.xml and word/styles.xml in place.
 */
/**
 * Register a running header on every DOCX page except the cover:
 *   1. Write a new header part (word/headerN.xml) with just the document title.
 *   2. Register the part in [Content_Types].xml and word/_rels/document.xml.rels.
 *   3. Insert <w:headerReference w:type="default"/> plus <w:titlePg/> into the
 *      document's final <w:sectPr>, and set <w:pgMar w:header="…"/> so the
 *      header has vertical breathing room.
 */
async function addDocxHeader(zip, docTitle) {
  const escapeXml = (s) => String(s).replace(/[<>&"']/g, (c) => (
    { '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c]
  ));

  // Header contents: just the document title. STYLEREF-based section-name
  // headers proved unreliable across Word/LibreOffice; keep it simple.
  const runProps = '<w:rPr><w:color w:val="57606A"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>';
  const headerXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
           'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<w:p>' +
        '<w:pPr>' +
          '<w:pStyle w:val="Header"/>' +
          '<w:pBdr>' +
            '<w:bottom w:val="single" w:sz="4" w:space="1" w:color="8C959F"/>' +
          '</w:pBdr>' +
          '<w:jc w:val="center"/>' +
          runProps +
        '</w:pPr>' +
        `<w:r>${runProps}<w:t xml:space="preserve">${escapeXml(docTitle)}</w:t></w:r>` +
      '</w:p>' +
    '</w:hdr>';

  // Pick a header file name that isn't already used.
  let headerName = 'header2.xml';
  let n = 2;
  while (zip.file('word/' + headerName)) {
    n += 1;
    headerName = 'header' + n + '.xml';
  }
  zip.file('word/' + headerName, headerXml);

  // 2a. Register the header in [Content_Types].xml.
  const ctEntry = zip.file('[Content_Types].xml');
  if (!ctEntry) throw new Error('[Content_Types].xml not found in DOCX');
  let ct = await ctEntry.async('string');
  const overrideTag =
    `<Override PartName="/word/${headerName}" ` +
    `ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>`;
  if (!ct.includes(overrideTag)) {
    ct = ct.replace('</Types>', overrideTag + '</Types>');
    zip.file('[Content_Types].xml', ct);
  }

  // 2b. Register the header in word/_rels/document.xml.rels.
  const relsEntry = zip.file('word/_rels/document.xml.rels');
  if (!relsEntry) throw new Error('word/_rels/document.xml.rels not found');
  let rels = await relsEntry.async('string');
  // Find a free relationship id.
  const idsInUse = Array.from(rels.matchAll(/Id="rId(\d+)"/g)).map(m => parseInt(m[1], 10));
  const nextId = 'rId' + (Math.max(0, ...idsInUse) + 1);
  const relTag =
    `<Relationship Id="${nextId}" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" ` +
    `Target="${headerName}"/>`;
  rels = rels.replace('</Relationships>', relTag + '</Relationships>');
  zip.file('word/_rels/document.xml.rels', rels);

  // 3. Reference the header from the section properties. In Pandoc's output
  //    the section properties live in a single <w:sectPr> near the end of
  //    the body. Add <w:headerReference w:type="default" r:id="…"/> and
  //    <w:titlePg/>. Also bump w:header in <w:pgMar> so the header has
  //    at least ~10mm of top margin.
  const docXml = zip.file('word/document.xml');
  if (!docXml) throw new Error('word/document.xml not found');
  let doc = await docXml.async('string');
  const headerRef = `<w:headerReference w:type="default" r:id="${nextId}"/>`;
  const titlePg = '<w:titlePg/>';

  // Pandoc may emit <w:sectPr/> (self-closing, empty) or a normal
  // <w:sectPr>...</w:sectPr> block. Handle both.
  const buildSectPr = (existingAttrs, existingInner) => {
    let newInner = existingInner || '';
    newInner = newInner.replace(/<w:headerReference\s+w:type="default"[^>]*\/>/g, '');
    if (!/<w:titlePg\s*\/?>/.test(newInner)) newInner = titlePg + newInner;
    if (/<w:pgMar\b[^>]*>/.test(newInner)) {
      newInner = newInner.replace(/<w:pgMar\b([^>]*)\/?>/, (mm, a) => {
        let ax = a.replace(/\s+w:header="\d+"/g, '');
        return `<w:pgMar${ax} w:header="720"/>`;
      });
    }
    return `<w:sectPr${existingAttrs || ''}>${headerRef}${newInner}</w:sectPr>`;
  };

  let replaced = false;
  // Case 1: full <w:sectPr ...>...</w:sectPr>.
  doc = doc.replace(/<w:sectPr\b([^>]*)>([\s\S]*?)<\/w:sectPr>/, (m, attrs, inner) => {
    replaced = true;
    return buildSectPr(attrs, inner);
  });
  if (!replaced) {
    // Case 2: self-closing <w:sectPr ... />.
    doc = doc.replace(/<w:sectPr\b([^>]*?)\/>/, (m, attrs) => {
      replaced = true;
      return buildSectPr(attrs, '');
    });
  }
  if (!replaced) {
    // Case 3: no sectPr at all — insert one before </w:body>.
    doc = doc.replace('</w:body>', buildSectPr('', '') + '</w:body>');
  }
  zip.file('word/document.xml', doc);
}

async function postProcessDocx(docxPath, docTitle) {
  const JSZip = require('jszip');
  const buf = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(buf);

  // --- word/document.xml
  const docXmlEntry = zip.file('word/document.xml');
  if (docXmlEntry) {
    let doc = await docXmlEntry.async('string');

    // Cover layout: title centered on the page, date at the bottom.
    //
    // We look for a pair of marker paragraphs "__COVER_START__" and
    //   "__COVER_END__" that prepareDocxHtml inserted around the cover.
    // Between them lies:  <marker start> <title-p> <date-p> <marker end>
    //
    // Rewrite them to:
    //   <20 empty paragraphs> <title> <30 empty paragraphs> <date>
    // — which pushes the title to visual mid-page and the date near the
    // bottom of an A4 page at default (11pt) body font. The values are
    // approximate; exact placement isn't guaranteed across viewers.
    {
      // Locate the paragraph enclosing each marker by string indices — no
      // regex fussing with backslash escaping.
      const findEnclosingPara = (marker) => {
        const idx = doc.indexOf(marker);
        if (idx < 0) return null;
        // Walk backwards to the nearest "<w:p" that starts a paragraph tag.
        const openStart = doc.lastIndexOf('<w:p', idx);
        if (openStart < 0) return null;
        // We may have hit <w:pPr — filter to real <w:p that ends with > and
        // starts a top-level paragraph.
        // Confirm: character after "<w:p" is either " " or ">".
        const after = doc.charAt(openStart + 4);
        if (after !== ' ' && after !== '>') {
          // False positive (e.g. <w:pPr) — search again from before this hit.
          // Fall back: iterate.
          let p = openStart;
          while (p >= 0) {
            const next = doc.lastIndexOf('<w:p', p - 1);
            if (next < 0) return null;
            const c = doc.charAt(next + 4);
            if (c === ' ' || c === '>') { p = next; break; }
            p = next;
          }
          if (p < 0) return null;
          return findEnclosingParaFrom(p, idx);
        }
        return findEnclosingParaFrom(openStart, idx);
      };
      const findEnclosingParaFrom = (openStart, markerIdx) => {
        const closeIdx = doc.indexOf('</w:p>', markerIdx);
        if (closeIdx < 0) return null;
        return { start: openStart, end: closeIdx + '</w:p>'.length };
      };

      const startPara = findEnclosingPara('__COVER_START__');
      const endPara = findEnclosingPara('__COVER_END__');
      if (startPara && endPara && startPara.end <= endPara.start) {
        const between = doc.slice(startPara.end, endPara.start);
        const paras = between.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || [];
        if (paras.length >= 2) {
          // Force horizontal centering directly in OOXML — Pandoc's <p align>
          // handling depends on the paragraph style and is unreliable.
          const forceCenter = (para) => {
            if (/<w:pPr>[\s\S]*?<\/w:pPr>/.test(para)) {
              return para.replace(
                /<w:pPr>([\s\S]*?)<\/w:pPr>/,
                (m, inner) => {
                  const cleaned = inner.replace(/<w:jc\s+[^/]*\/>/g, '');
                  return `<w:pPr>${cleaned}<w:jc w:val="center"/></w:pPr>`;
                }
              );
            }
            return para.replace(
              '<w:p>',
              '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>'
            );
          };
          // Force font size (half-points) on every <w:r> in the paragraph.
          const setRunSize = (para, halfPoints) => {
            const sz = `<w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/>`;
            return para.replace(/<w:r>(<w:rPr>[\s\S]*?<\/w:rPr>)?/g, (m, rPr) => {
              const merged = (rPr || '<w:rPr></w:rPr>')
                .replace(/<w:sz\s+w:val="\d+"\s*\/>/g, '')
                .replace(/<w:szCs\s+w:val="\d+"\s*\/>/g, '')
                .replace('</w:rPr>', `${sz}</w:rPr>`);
              return `<w:r>${merged}`;
            });
          };
          // Cover title: 22pt (half-points = 44). Date: keep default body size.
          const titleP = setRunSize(forceCenter(paras[0]), 44);
          const dateP = forceCenter(paras[paras.length - 1]);
          const emptyP = '<w:p/>';
          // Layout on a single A4 page at default 11pt body font:
          // usable height ≈ 55 lines. Title takes ~2 lines, date 1 line.
          // Budget = 55 - 2 - 1 = 52 empty lines to distribute.
          const TOP_EMPTY = 10;    // above title (title lands in visual centre)
          const BETWEEN_EMPTY = 14; // between title and date (date near bottom)
          const rebuilt =
            emptyP.repeat(TOP_EMPTY) + titleP + emptyP.repeat(BETWEEN_EMPTY) + dateP;
          doc = doc.slice(0, startPara.start) + rebuilt + doc.slice(endPara.end);
        } else {
          console.warn('[postProcessDocx] not enough paragraphs; leaving cover as-is but stripping markers');
          // strip only the marker paragraphs
          doc = doc.slice(0, startPara.start) + between + doc.slice(endPara.end);
        }
      } else if (startPara || endPara) {
        console.warn(`[postProcessDocx] cover: partial or inverted match (start=${JSON.stringify(startPara)}, end=${JSON.stringify(endPara)})`);
      }
    }

    // Add borders to tables whose first cell contains an alert glyph.
    const alertGlyphRe = /[ℹ⚠⛔]/;
    // Outer borders only — no insideH/insideV so the icon/text cells are not
    // visually separated by a line.
    const borderBlock =
      '<w:tblBorders>' +
        '<w:top w:val="single" w:sz="4" w:space="0" w:color="8C959F"/>' +
        '<w:left w:val="single" w:sz="4" w:space="0" w:color="8C959F"/>' +
        '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="8C959F"/>' +
        '<w:right w:val="single" w:sz="4" w:space="0" w:color="8C959F"/>' +
        '<w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
        '<w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
      '</w:tblBorders>';

    doc = doc.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => {
      if (!alertGlyphRe.test(tbl)) return tbl;
      // 1. Ensure the outer border block is in <w:tblPr>.
      const tblPrMatch = tbl.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/);
      let patched = tbl;
      if (!tblPrMatch) {
        patched = patched.replace(
          '<w:tbl>',
          `<w:tbl><w:tblPr>${borderBlock}</w:tblPr>`
        );
      } else if (!/<w:tblBorders>/.test(tblPrMatch[0])) {
        const patchedPr = tblPrMatch[0].replace(
          '</w:tblPr>',
          `${borderBlock}</w:tblPr>`
        );
        patched = patched.replace(tblPrMatch[0], patchedPr);
      } else {
        // Table already has some borders — replace with ours.
        patched = patched.replace(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/, borderBlock);
      }
      // 2. Suppress any per-cell borders on the interior (Pandoc adds
      //    <w:tcBorders> with single left/right/top/bottom on each cell).
      patched = patched.replace(/<w:tcBorders>[\s\S]*?<\/w:tcBorders>/g, '');
      return patched;
    });
    zip.file('word/document.xml', doc);
  }

  // --- word/styles.xml: force code styles to a smaller, muted-grey font.
  //     Pandoc emits "SourceCode" (block) and "VerbatimChar" (inline) but
  //     the styles may or may not exist depending on reference-doc. We
  //     handle three cases: (a) style exists with rPr → patch rPr;
  //     (b) style exists without rPr → insert rPr; (c) style missing →
  //     append a new <w:style> element before </w:styles>.
  const CODE_SIZE = 20;     // half-points → 10pt (body is 22 = 11pt)
  const CODE_COLOR = '57606A';
  const stylesEntry = zip.file('word/styles.xml');
  if (stylesEntry) {
    let styles = await stylesEntry.async('string');
    const restyleCode = (xml, styleId, halfPoints, colorHex) => {
      const styleRe = new RegExp(
        `(<w:style\\b[^>]*w:styleId="${styleId}"[^>]*>[\\s\\S]*?<\\/w:style>)`
      );
      const m = xml.match(styleRe);
      if (!m) return null;
      let s = m[0];
      const rPrRe = /<w:rPr>[\s\S]*?<\/w:rPr>/;
      const rPrMatch = s.match(rPrRe);
      const newRPr =
        `<w:rPr>` +
          `<w:color w:val="${colorHex}"/>` +
          `<w:sz w:val="${halfPoints}"/>` +
          `<w:szCs w:val="${halfPoints}"/>` +
        `</w:rPr>`;
      if (rPrMatch) {
        // Merge — remove existing sz/szCs/color, then append our values inside.
        let merged = rPrMatch[0]
          .replace(/<w:sz\s+w:val="\d+"\s*\/>/g, '')
          .replace(/<w:szCs\s+w:val="\d+"\s*\/>/g, '')
          .replace(/<w:color\s+[^/]*\/>/g, '')
          .replace('</w:rPr>',
            `<w:color w:val="${colorHex}"/>` +
            `<w:sz w:val="${halfPoints}"/>` +
            `<w:szCs w:val="${halfPoints}"/>` +
            `</w:rPr>`);
        s = s.replace(rPrMatch[0], merged);
      } else {
        s = s.replace('</w:style>', `${newRPr}</w:style>`);
      }
      return xml.replace(m[0], s);
    };

    for (const [id, type] of [['SourceCode','paragraph'],['VerbatimChar','character']]) {
      const patched = restyleCode(styles, id, CODE_SIZE, CODE_COLOR);
      if (patched) {
        styles = patched;
      } else {
        // Style missing entirely — append a minimal one.
        const font = 'Consolas';
        const newStyle =
          `<w:style w:type="${type}" w:customStyle="1" w:styleId="${id}">` +
            `<w:name w:val="${id}"/>` +
            `<w:rPr>` +
              `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>` +
              `<w:color w:val="${CODE_COLOR}"/>` +
              `<w:sz w:val="${CODE_SIZE}"/>` +
              `<w:szCs w:val="${CODE_SIZE}"/>` +
            `</w:rPr>` +
          `</w:style>`;
        styles = styles.replace('</w:styles>', `${newStyle}</w:styles>`);
      }
    }

    zip.file('word/styles.xml', styles);
  }

  // --- word/document.xml: for each paragraph whose pStyle is SourceCode,
  //     and for each run whose rStyle is VerbatimChar, ensure w:sz/w:szCs
  //     and w:color are present with our target values inline. This guards
  //     against reference-doc overriding the style definition.
  if (docXmlEntry) {
    let doc2 = await zip.file('word/document.xml').async('string');
    const inlineRunRPr =
      `<w:color w:val="${CODE_COLOR}"/>` +
      `<w:sz w:val="${CODE_SIZE}"/>` +
      `<w:szCs w:val="${CODE_SIZE}"/>`;

    // A. Inline runs carrying rStyle VerbatimChar.
    doc2 = doc2.replace(
      /<w:rPr>([\s\S]*?)<\/w:rPr>/g,
      (m, inner) => {
        if (!/<w:rStyle\s+w:val="VerbatimChar"\s*\/>/.test(inner)) return m;
        let patched = inner
          .replace(/<w:sz\s+w:val="\d+"\s*\/>/g, '')
          .replace(/<w:szCs\s+w:val="\d+"\s*\/>/g, '')
          .replace(/<w:color\s+[^/]*\/>/g, '');
        return `<w:rPr>${patched}${inlineRunRPr}</w:rPr>`;
      }
    );

    // B. Paragraphs styled SourceCode — merge our rPr overrides into each run.
    doc2 = doc2.replace(/<w:p>[\s\S]*?<\/w:p>/g, (para) => {
      if (!/<w:pStyle\s+w:val="SourceCode"\s*\/>/.test(para)) return para;
      return para.replace(
        /<w:r>(<w:rPr>[\s\S]*?<\/w:rPr>)?/g,
        (m, existingRPr) => {
          const merged = (existingRPr || '<w:rPr></w:rPr>')
            .replace(/<w:sz\s+w:val="\d+"\s*\/>/g, '')
            .replace(/<w:szCs\s+w:val="\d+"\s*\/>/g, '')
            .replace(/<w:color\s+[^/]*\/>/g, '')
            .replace('</w:rPr>', `${inlineRunRPr}</w:rPr>`);
          return `<w:r>${merged}`;
        }
      );
    });

    zip.file('word/document.xml', doc2);
  }

  // --- Add a running header (document title) on every page ≥ 2.
  //     A section-level <w:titlePg/> suppresses it on the cover.
  await addDocxHeader(zip, docTitle);

  const outBuf = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  fs.writeFileSync(docxPath, outBuf);
}

/**
 * Prepare the frozen HTML for the Pandoc → DOCX pipeline.
 *
 * The frozen HTML was tailored for the Chromium PDF writer; DOCX has its own
 * needs:
 *   - Pandoc reads <title> as document title and prints it above the auto-
 *     generated TOC — duplicating our cover heading. Strip <title>.
 *   - Pandoc's --toc always emits the TOC at the very top of the body, right
 *     after the document title. That collides with our cover (title lands
 *     between cover title and cover date). Simplest fix: don't use --toc; keep
 *     the HTML TOC we already build inside the cover section, but move it to
 *     its own page after the date, so ordering is: cover title + date → TOC →
 *     articles.
 *   - <link>/<script>/<meta refresh> tags become "linked" resources in DOCX
 *     ("This document contains fields that may refer to other files. Update
 *     the fields?" prompt).
 *   - Element ids that repeat across pages (#parameters-1 in every API-ref
 *     page) trigger `Duplicate identifier` warnings and break internal links.
 *   - Alert icons: <svg> is not rendered natively in Word (missing) and
 *     LibreOffice renders it at "intrinsic" size (huge). Replace SVGs with
 *     unicode symbols in DOCX; PDF is unaffected because it uses the frozen
 *     HTML that still holds the SVGs.
 */
function prepareDocxHtml(html, lang) {
  let out = html;

  // 1. Strip <title> — otherwise Pandoc uses it as the doc title (duplicate).
  out = out.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, '');

  // 1a. Convert the cover to Word-friendly markup:
  //     - Title: centered bold paragraph, NOT <h1> (Pandoc maps <h1> to
  //       Heading 1 and the TOC field would pick it up as its first entry).
  //     - Date: centered paragraph.
  //     - We wrap both in marker paragraphs (COVER_START / COVER_END) so the
  //       DOCX post-processor can inject a section with vertical centering
  //       and push the date to the bottom of the page.
  out = out.replace(
    /<h1\s+class="pdf-cover__title"[^>]*>([\s\S]*?)<\/h1>/i,
    '<p>__COVER_START__</p>' +
    '<p class="pdf-cover__title"><strong>$1</strong></p>'
  );
  out = out.replace(
    /<div\s+class="pdf-cover__date"[^>]*>([\s\S]*?)<\/div>/i,
    '<p class="pdf-cover__date">$1</p>' +
    '<p>__COVER_END__</p>'
  );

  // 2. Strip <link>, <script>, <meta http-equiv="refresh"> — these turn into
  //    external references in DOCX, prompting the "update fields" dialog.
  out = out.replace(/<link\b[^>]*>/gi, '');
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<script\b[^>]*\/>/gi, '');
  out = out.replace(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/gi, '');

  // 3. Alert icons → unicode symbols laid out in a 2-column table so the icon
  //    is top-left and the text is offset to the right. The table is marked
  //    with class "alert-docx" so docx-toc.lua can add cell borders (Pandoc
  //    HTML reader drops CSS borders — must be applied in the filter).
  const ALERT_SYMBOL = { info: 'ℹ', warning: '⚠', warn: '⚠', danger: '⛔' };
  out = out.replace(
    /(<div\s+class="([^"]*\balert__wrap\b[^"]*)"[^>]*>)([\s\S]*?)(<\/div>)/gi,
    (m, openTag, classAttr, inner, closeTag) => {
      const levels = classAttr.split(/\s+/);
      let symbol = 'ℹ';
      for (const l of levels) {
        if (ALERT_SYMBOL[l]) { symbol = ALERT_SYMBOL[l]; break; }
      }
      const innerStripped = inner.replace(/<svg\b[\s\S]*?<\/svg>/gi, '');
      return (
        `<table class="alert-docx"><tbody><tr>` +
        `<td class="alert-docx__icon">${symbol}</td>` +
        `<td class="alert-docx__body">${innerStripped}</td>` +
        `</tr></tbody></table>`
      );
    }
  );

  // 4. Drop the HTML TOC (built for the PDF); replace with a placeholder that
  //    the docx-toc.lua filter turns into a native Word TOC field. Force page
  //    breaks around it so pagination is cover → break → TOC → break → body.
  out = out.replace(/<nav\s+class="pdf-toc"[\s\S]*?<\/nav>/i, '');
  out = out.replace(
    /(<\/section>)(\s*)(?=<article\b|<h1\b)/i,
    '$1$2' +
    '<div class="page-break"></div>' +
    '<div class="docx-toc-here"></div>' +
    '<div class="page-break"></div>' +
    '$2'
  );

  // 5. Prefix every id inside each <article> so Pandoc's auto-identifier
  //    algorithm (which slugifies heading text) can't produce duplicates
  //    across articles. Prefix = article's own id + "--".
  out = out.replace(
    /(<article\b[^>]*\bid=("|')([^"']+)\2[^>]*>)([\s\S]*?)(<\/article>)/gi,
    (m, openTag, q, articleId, body, closeTag) => {
      const prefix = articleId + '--';
      // Rewrite id="X" → id="<prefix>X".
      let rewritten = body.replace(/\bid=("|')([^"']+)\1/g, (mm, qq, id) =>
        `id=${qq}${prefix}${id}${qq}`
      );
      // Rewrite intra-article <a href="#X"> → <a href="#<prefix>X">.
      rewritten = rewritten.replace(
        /(href=("|'))#([^"'#]+)(\2)/g,
        (mm, pre, qq, target, post) => `${pre}#${prefix}${target}${post}`
      );
      return openTag + rewritten + closeTag;
    }
  );

  // 6. De-duplicate any remaining id attributes (e.g. those outside articles
  //    or introduced by anchor-inside-content quirks).
  {
    const seen = new Map();
    out = out.replace(/\bid=("|')([^"']+)\1/g, (m, q, id) => {
      const n = (seen.get(id) || 0) + 1;
      seen.set(id, n);
      if (n === 1) return m;
      return `id=${q}${id}--${n}${q}`;
    });
  }

  // 7. Suppress Pandoc's auto-identifier generation for headings by giving
  //    every heading without an id an explicit generated one. We prefix by
  //    the enclosing article slug, so distinct articles never collide.
  //    Iterate articles again for context.
  out = out.replace(
    /(<article\b[^>]*\bid=("|')([^"']+)\2[^>]*>)([\s\S]*?)(<\/article>)/gi,
    (m, openTag, q, articleId, body, closeTag) => {
      let n = 0;
      const rewritten = body.replace(
        /<(h[1-6])\b([^>]*)>/gi,
        (mm, tag, attrs) => {
          if (/\bid\s*=/.test(attrs)) return mm;
          n += 1;
          return `<${tag}${attrs} id="${articleId}--h-${n}">`;
        }
      );
      return openTag + rewritten + closeTag;
    }
  );

  return out;
}

/**
 * Insert printed-page numbers next to each TOC entry.
 *
 * Approach: render the DOM in a screen-media stylesheet that emulates paginated
 * A4 output (fixed-height boxes stacked vertically), then compute for each
 * `.pdf-toc__item a[href^="#"]` target its ceil(offsetTop / pageHeight) → page
 * number. The Chromium PDF writer paginates at the same CSS page size we set,
 * so the numbers line up.
 *
 * Numbers are rendered as trailing spans: "Section title  ......  12".
 */
async function annotateTocWithPageNumbers(page) {
  await page.emulateMedia({ media: 'print' });
  const measurement = await page.evaluate(() => {
    const pageHeightCss = 1123;
    const marginTopCss = 76;
    const marginBottomCss = 76;
    const contentHeight = pageHeightCss - marginTopCss - marginBottomCss;

    const numbers = {};
    document.querySelectorAll('.pdf-toc__item a[href^="#"]').forEach(link => {
      const id = link.getAttribute('href').slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      numbers[id] = Math.max(1, Math.floor(top / contentHeight) + 1);
    });

    // Collect level-0 (top chapters) and level-1 (sub-chapters) articles for
    // running header. Each article's own <h1 class="pdf-page__title"> serves
    // as the label; startPage comes from the article's offsetTop.
    const collectSections = (selector) => {
      const acc = [];
      document.querySelectorAll(selector).forEach(a => {
        const title = a.querySelector('.pdf-page__title')?.textContent?.trim() || '';
        const rect = a.getBoundingClientRect();
        const top = rect.top + window.scrollY;
        const startPage = Math.max(1, Math.floor(top / contentHeight) + 1);
        acc.push({ title, startPage });
      });
      acc.sort((a, b) => a.startPage - b.startPage);
      return acc;
    };

    const sections = collectSections('article.pdf-page--level-0');
    const subsections = collectSections('article.pdf-page--level-1');

    return { numbers, sections, subsections };
  });
  await page.emulateMedia({ media: null });

  const { numbers, sections, subsections } = measurement;

  await page.evaluate((numbers) => {
    document.querySelectorAll('.pdf-toc__item a[href^="#"]').forEach(link => {
      const id = link.getAttribute('href').slice(1);
      const page = numbers[id];
      if (!page) return;
      const dots = document.createElement('span');
      dots.className = 'pdf-toc__dots';
      dots.setAttribute('aria-hidden', 'true');
      const num = document.createElement('span');
      num.className = 'pdf-toc__page';
      num.textContent = String(page);
      link.appendChild(dots);
      link.appendChild(num);
    });
  }, numbers);

  return { sections, subsections };
}

/**
 * Overlay a running header on every PDF page starting from page 2.
 * Header text: "<docTitle> — <currentSectionTitle>".
 */
async function addPdfHeader(pdfPath, docTitle, sections, subsections) {
  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
  const fontkit = require('@pdf-lib/fontkit');
  const bytes = fs.readFileSync(pdfPath);
  const pdf = await PDFDocument.load(bytes);
  pdf.registerFontkit(fontkit);

  // Standard 14 PDF fonts are WinAnsi-only (no Cyrillic). Embed a Unicode
  // TrueType font instead. Look for common system paths; fall back to the
  // WinAnsi Helvetica if none found (English-only content still works).
  const candidateFontPaths = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/TTF/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
  ];
  let font;
  for (const p of candidateFontPaths) {
    if (fs.existsSync(p)) {
      font = await pdf.embedFont(fs.readFileSync(p), { subset: true });
      break;
    }
  }
  if (!font) {
    console.warn('[addPdfHeader] No Unicode font found on the system — falling back to Helvetica (Cyrillic will fail).');
    font = await pdf.embedFont(StandardFonts.Helvetica);
  }

  // For each page, find the section it belongs to (largest startPage ≤ page).
  const pages = pdf.getPages();
  for (let i = 0; i < pages.length; i++) {
    const pageNum = i + 1;
    if (pageNum < 2) continue; // no header on the cover
    const pickCurrent = (list) => {
      let cur = null;
      for (const s of list) {
        if (s.startPage <= pageNum) cur = s;
        else break;
      }
      return cur;
    };
    const chapter = pickCurrent(sections);
    const subChapter = pickCurrent(subsections);
    // A sub-chapter is only relevant if it belongs to the current chapter
    // (i.e. it started at/after the chapter's own start page).
    const showSub =
      chapter && subChapter && subChapter.startPage >= chapter.startPage;
    let text = docTitle;
    if (chapter) {
      text = `${docTitle} — ${chapter.title}`;
      if (showSub) text += ` -> ${subChapter.title}`;
    }

    const p = pages[i];
    const { width, height } = p.getSize();
    const fontSize = 9;
    const marginTop = 30; // pt from the top edge
    const marginX = 42;   // pt from the left edge (≈ 15mm)

    // Draw the text near the top-right, muted grey.
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    // Truncate if the header is wider than the printable area.
    let drawText = text;
    let drawWidth = textWidth;
    const maxWidth = width - 2 * marginX;
    if (drawWidth > maxWidth) {
      // Trim from the right until it fits, ending with "…".
      while (drawText.length > 3 && font.widthOfTextAtSize(drawText + '…', fontSize) > maxWidth) {
        drawText = drawText.slice(0, -1);
      }
      drawText += '…';
      drawWidth = font.widthOfTextAtSize(drawText, fontSize);
    }

    p.drawText(drawText, {
      x: (width - drawWidth) / 2,
      y: height - marginTop,
      size: fontSize,
      font,
      color: rgb(0x57 / 255, 0x60 / 255, 0x6a / 255),
    });

    // Thin muted rule below the header text.
    p.drawLine({
      start: { x: marginX, y: height - marginTop - 5 },
      end: { x: width - marginX, y: height - marginTop - 5 },
      thickness: 0.5,
      color: rgb(0x8c / 255, 0x95 / 255, 0x9f / 255),
    });
  }

  fs.writeFileSync(pdfPath, await pdf.save());
}

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'print-export-'));
  const frozenHtmlPath = path.join(tmpDir, `frozen-${lang}.html`);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`[${lang}] Loading ${printURL} ...`);
  await page.goto(printURL, { waitUntil: 'networkidle', timeout: 120_000 });

  // Wait for mermaid to finish rendering (if any diagrams present).
  const mermaidCount = await page.evaluate(() => document.querySelectorAll('.mermaid').length);
  if (mermaidCount > 0) {
    console.log(`[${lang}] Waiting for ${mermaidCount} mermaid diagrams ...`);
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('.mermaid')).every(el => el.querySelector('svg')),
      null,
      { timeout: mermaidTimeout }
    );
  }

  console.log(`[${lang}] Inlining external assets from ${externalBase} ...`);
  await inlineExternalAssets(page);

  console.log(`[${lang}] Computing TOC page numbers ...`);
  const { sections, subsections } = await annotateTocWithPageNumbers(page);

  // Read the document title from the current page so the PDF and DOCX
  // headers stay consistent with whatever pdfTitle Hugo rendered.
  const docTitle = await page.evaluate(() => {
    const el = document.querySelector('.pdf-cover__title');
    return (el ? el.textContent : document.title || '').trim();
  });

  const html = await page.content();
  fs.writeFileSync(frozenHtmlPath, html);
  console.log(`[${lang}] Frozen HTML: ${frozenHtmlPath} (${(html.length / 1024).toFixed(1)} KiB)`);

  console.log(`[${lang}] Writing PDF: ${outPdf}`);
  await page.pdf({
    path: outPdf,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
  });

  await browser.close();

  console.log(`[${lang}] Overlaying PDF header on pages ≥ 2 ...`);
  await addPdfHeader(outPdf, docTitle, sections, subsections);

  // DOCX-specific HTML: drop the HTML TOC (Pandoc's --toc renders a Word-native
  // one), add an explicit page break after the cover, force alert-icon size
  // via SVG attributes, and de-duplicate element ids that repeat across pages.
  const docxHtmlPath = path.join(tmpDir, `docx-${lang}.html`);
  fs.writeFileSync(docxHtmlPath, prepareDocxHtml(html, lang));

  console.log(`[${lang}] Writing DOCX: ${outDocx}`);
  const args = [
    docxHtmlPath,
    '-o', outDocx,
    '--from=html',
    '--to=docx',
    '--standalone',
    '--embed-resources',
    // The HTML we hand to pandoc already includes a hand-built TOC in the
    // right place; don't ask pandoc to generate a second one.
    '--metadata=lang:' + lang,
  ];
  if (fs.existsSync(refDoc)) args.push('--reference-doc=' + refDoc);
  if (fs.existsSync(luaFilter)) args.push('--lua-filter=' + luaFilter);
  const docxTocLua = path.join(scriptDir, 'docx-toc.lua');
  if (fs.existsSync(docxTocLua)) args.push('--lua-filter=' + docxTocLua);

  execSync('pandoc ' + args.map(a => `'${a.replace(/'/g, `'\\''`)}'`).join(' '), {
    stdio: 'inherit',
    env: { ...process.env, PRINT_EXPORT_LANG: lang },
  });

  console.log(`[${lang}] Post-processing DOCX (borders, code font, header) ...`);
  await postProcessDocx(outDocx, docTitle);

  console.log(`[${lang}] Done.`);
})().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
