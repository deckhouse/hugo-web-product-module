# Print export scripts

## Files

- **`print-export.js`** — Playwright script. Loads the Hugo `print` output at
  `<baseUrl>/<lang>/documentation/print/`, waits for mermaid diagrams to render,
  inlines every `<img>/`<script>`/`<link>`/`<use>` resource as a `data:` URL
  (fetching from `EXTERNAL_ASSETS_BASE`, default `https://deckhouse.io`), then
  produces both PDF (via `page.pdf()`) and DOCX (via `pandoc`).
- **`alert.lua`** — Pandoc filter. Maps `<div class="alert__wrap info|warning|danger">`
  to Word Custom Styles `AlertInfo` / `AlertWarning` / `AlertDanger`, and
  `pdf-tab__title` / `pdf-details__summary` to `TabTitle`.
- **`reference.docx`** — optional Word reference document defining the Custom
  Styles used by `alert.lua`. If absent, Pandoc will use its built-in defaults
  and Alert/Tab blocks will render as plain paragraphs (content preserved,
  visual distinction lost). Generate a reference doc via
  `pandoc -o reference.docx --print-default-data-file reference.docx`,
  open it in Word/LibreOffice, and add paragraph styles named `AlertInfo`,
  `AlertWarning`, `AlertDanger`, `TabTitle`.

## Usage

Meant to run inside the `mcr.microsoft.com/playwright` container with `pandoc`
and `poppler-utils` installed:

```
export PRODUCT_CODE=stronghold
node print-export.js en http://localhost:8080
node print-export.js ru http://localhost:8080
```

Outputs go to `<PUBLIC_DIR>/<lang>/documentation/downloads/print/<PRODUCT_CODE>.{pdf,docx}`.
`PUBLIC_DIR` defaults to `./public`.
