# Hugo module for the Deckhouse websites

This is the source for the Hugo module, used in Deckhouse documentation websites of the Deckhouse products.

Some ideas and code snippets are borrowed from the [Docsy](https://www.docsy.dev/) Hugo theme.

## Usage

Add it in your hugo configuration.

For the local development, you can use the following replace directive in your `go.mod`:

```go
replace github.com/deckhouse/hugo-web-product-module => ../hugo-web-product-module
```

or use use the modules configuration [replacements](https://gohugo.io/configuration/module/#replacements) option.

The minimum required Hugo version is `v0.163.3` (uses the official `ghcr.io/gohugoio/hugo` image). The template relies on Hugo APIs introduced in `v0.156.0` (e.g. `hugo.Data`), so older versions are not supported.

## Creating new Deckhouse product website

1. Use the folder `project_template` as a template for your new Deckhouse product website.
1. Add content in the `content` folder and customize the configuration in the `config` folder.
   - Define product name and baseURL the `config/_default/hugo.yaml` file.

## Structure of the content

...coming soon...

## Markup

The project uses [Hugo](gohugo.io) SSG and the [hugo-web-product-module](https://github.com/deckhouse/hugo-web-product-module/) module for a theme.

The documentation content is written in Markdown with some custom shortcodes.

### Page parameters (front matter)

#### Search index for documentation section

To generate `documentation/search.json` for offline search, add `search` to the outputs of the `documentation/_index.*` pages:

```yaml
---
title: Deckhouse <PRODUCT_NAME>
outputs:
  - HTML
  - search
---
```

#### AI-friendly documentation exports

The module can publish machine-readable documentation for AI agents and RAG pipelines:

| Artifact | URL | Purpose |
|----------|-----|---------|
| `llms.txt` | `/{lang}/documentation/llms.txt` | Curated index (llms.txt spec): title, summary, links to Markdown pages |
| Per-page Markdown | `/{lang}/documentation/.../index.md` | Page body with shortcodes expanded to Markdown |
| `corpus.json` | `/{lang}/documentation/corpus.json` | JSON array of documents (`title`, `url`, `mdUrl`, `path`, `breadcrumbs`, `keywords`, `markdown`) for RAG |

There is no `llms-full.txt` (full-tree dump); use `corpus.json` or individual `index.md` files instead.

##### Enabling in a consumer site

1. **Default page/section outputs** in `config/_default/hugo.yaml` (do not enable `home`):

   ```yaml
   outputs:
     page: [HTML, markdown]
     section: [HTML, markdown]
   ```

2. **Documentation root front matter** (`content/documentation/_index.md` and `_index.ru.md`):

   ```yaml
   outputs:
     - HTML
     - markdown
     - search
     - llms
     - corpus
     # - print   # optional PDF/DOCX pipeline
   ```

3. **Optional summary** for the `llms.txt` blockquote. The H1 is always
   `languages.<lang>.title` (`site.Title`). Summary resolution order:
   `params.llms.summary` → `languages.<lang>.params.description` →
   `Documentation for <site.Title>.`

   ```yaml
   params:
     llms:
       summary: "Official documentation for Deckhouse Stronghold."
   ```

##### Shortcodes in Markdown / corpus

Per-page `index.md` and the `markdown` field in `corpus.json` use Hugo `.RenderShortcodes` with format-specific templates (`*.markdown.md` / `*.corpus.json`). Module shortcodes are rewritten to Markdown:

- `alert` → blockquote with level label
- `tabs` / `tab` → `### Tab name` sections (all tabs included)
- `details` → heading + body
- `mermaid` → fenced `mermaid` code block
- `translate` → translated string
- `downloads` → Markdown links to PDF/DOCX (when `params.pdf` is enabled)

Custom shortcodes in a product repo need matching `*.markdown.md` (and ideally `*.corpus.json`) variants; otherwise they stay as raw Hugo shortcode syntax in the export.

Section pages get the same auto-generated list of child pages as the HTML output, rendered as a
`Section contents` Markdown list that links to the child `.md` documents. It honours the
`no_list` and `hide_summary` page parameters, so a section that hides its list in HTML hides it
in the Markdown export too.

Note on shortcode notation: prefer `{{</* … */>}}` for AI export when practical (output is not re-parsed as Markdown). `{{%/* tab */%}}` / `{{%/* details */%}}` still work; tab bodies that arrive as HTML are flattened to plain text in the Markdown export.

##### `corpus.json` vs `search.json`

- `search.json` — plain text for the site search UI (`.Plain`, compact).
- `corpus.json` — structured RAG corpus with Markdown bodies and `mdUrl` pointers.

##### Sitemap

Hugo generates `sitemap.xml` for search engines. The module's sitemap contains only
canonical HTML URLs and excludes pages marked `hidden`, `noindex`, `external`, or
`sitemap.disable: true`. AI-oriented outputs (`.md`, `llms.txt`, `corpus.json`),
the search index, and print outputs are deliberately omitted; agents discover the
Markdown documents through `llms.txt`.

#### PDF/DOCX exports

The module registers a `print` Hugo output format and ships a single-page
`documentation/list.print.html` template that WeasyPrint + Pandoc convert into PDF and DOCX
files at `/{en,ru}/documentation/downloads/print/<productCode>.{pdf,docx}`.

##### Enabling in a consumer site

1. **Enable the switch** in `config/_default/hugo.yaml`:

   ```yaml
   params:
     productCode: <product-code>   # lower-case slug used as the output filename
     pdf: true
   ```

   If `params.pdf` is missing or `false`, the werf `print-artifacts` stage passes the site
   through unchanged and no PDF/DOCX are produced. Sidebar download buttons are also hidden.

2. **Enable the `print` Hugo output** in the front matter of the documentation root
   (`content/documentation/_index.md` and `_index.ru.md`):

   ```yaml
   outputs:
     - HTML
     - markdown
     - search
     - llms
     - corpus
     - print
   ```

   Without `print` in `outputs`, Hugo does not render
   `/{en,ru}/print/documentation/index.html` and WeasyPrint has nothing to convert.

3. **Add download buttons** where needed. The module's sidebar renders `Download PDF` /
   `Download DOCX` links automatically once `params.pdf: true` is set
   (`layouts/_partials/sidebar.html`). To add an in-content block on the documentation
   landing page, ship a `downloads` shortcode in the consumer repo (see
   [`website-stronghold` for an example](https://github.com/deckhouse/website-stronghold/blob/main/layouts/shortcodes/downloads.html)),
   or write your own using i18n keys `download_pdf` / `download_docx` (defined in
   `i18n/{en,ru}.yaml`).

##### How it works

The consumer's `werf.yaml` defines three images:

- `print-base` — intermediate image with WeasyPrint, Pandoc, Node.js and npm dependencies.
  Cached separately from the site so content changes don't rebuild the toolchain.
- `print-artifacts` — imports the built site from `web-artifacts`, clones the print scripts
  from this repository at the git tag pinned in the consumer's `go.mod`, runs
  `.github/scripts/print-export.js` for EN and RU, and exports the full site + PDF/DOCX to
  `/out`.
- `web` — nginx image importing `/out` from `print-artifacts` into `/app`.

Locally, `make pdf` triggers `werf build print-artifacts` and `docker cp`s the resulting
files out of the built image into `public/{en,ru}/documentation/downloads/print/`.

##### Requirements

- `werf` and `docker` on the host.
- Outbound access to `github.com` during the build (to clone the print scripts at the tag
  pinned in `go.mod`).
- Enough disk space for the intermediate `print-base` image (~1 GB with Node.js and
  Pandoc + WeasyPrint dependencies).

##### Disabling

Omit `params.pdf` in `config/_default/hugo.yaml` or set it to `false`. The werf build still
succeeds — the print pipeline is skipped and the site is served without the download paths.

#### Related links

```yaml
params:
  relatedLinks:
    - title: "Link"
      url: link.html
    - title: "External link"
      url: "http://domain/external/link.html"
    - url: /modules/monitoring-kubernetes/
```

#### Edition availability badge in the sidebar

Set the `params.edition` front-matter parameter to mark a sidebar entry as available in a specific product edition. The known edition codes (`ee`, `se`, `be`, `fe`, `cse` by default) live in `data/editions.yaml`; the badge text comes from there and the tooltip is looked up by the corresponding `titleKey` in `i18n/{en,ru}.yaml`.

For a single page:

```yaml
---
title: "Enterprise-only feature"
params:
  edition: ee
---
```

For a whole section — set it once on `_index.md` via Hugo `cascade`, it will be inherited by all descendant pages (and can be overridden in any child):

```yaml
---
title: "Enterprise features"
weight: 40
cascade:
  params:
    edition: ee
---
```

A child can override the inherited edition:

```yaml
---
title: "Available also in SE"
params:
  edition: se
---
```

##### Overriding the badge tooltip in i18n

Tooltip texts use Hugo translations and can be overridden per product in the consuming site's own `i18n/{en,ru}.yaml`. Hugo merges translation files from all modules and gives precedence to the consuming site, so defining the same key locally is enough — no need to edit the module.

Example — change the EE tooltip just for Stronghold by adding to the product site's `i18n/en.yaml`:

```yaml
edition_ee_title: "Available in Stronghold Enterprise Edition"
```

And the Russian variant in `i18n/ru.yaml`:

```yaml
edition_ee_title: "Доступно в Stronghold Enterprise Edition"
```

The default keys provided by the module are:

| Edition code | i18n key             |
|--------------|----------------------|
| `ee`         | `edition_ee_title`   |
| `se`         | `edition_se_title`   |
| `be`         | `edition_be_title`   |
| `fe`         | `edition_fe_title`   |
| `cse`        | `edition_cse_title`  |

##### Adding a custom edition or changing the badge text

To introduce a new edition code or change the short label shown inside the badge, add (or override) an entry in the product site's own `data/editions.yaml`. Hugo merges data files from modules and the consuming site's entries win on key conflict.

Example — add a custom `pro` edition in the product site's `data/editions.yaml`:

```yaml
pro:
  text: PRO
  titleKey: edition_pro_title
```

And register the tooltip text in the product site's `i18n/{en,ru}.yaml`:

```yaml
edition_pro_title: "Available in the Pro plan"
```

After that, `params.edition: pro` in any page's front-matter (directly or via `cascade`) produces the badge. If a code from front-matter is missing in `data/editions.yaml`, the badge is silently skipped — this protects against typos.

### Shortcodes

<div id="alert-details"></div>

#### Alert

There are following levels of alerts: `info`, `warning`, `danger`. The default level is `info`.

```go
{{< alert level="warning" >}}
The warning message...
{{< /alert >}}
```

#### Tabs

```go
{{< tabs name="tabs_uniq_name" >}}
{{% tab name="Tab caption 1" %}}Tab 1 Content {{% /tab %}}
{{% tab name="Tab caption 2" %}}Tab 2 Content {{% /tab %}}
{{< /tabs >}}
```

#### Translate

Translates content based on the current language using the translations defined in the `i18n` folder.

```go
{{< translate "version_of_module" >}}
```

<div id="shortcode-details"></div>

#### Details

```go
{{% details "Summary..."%}}
## Markdown content

Markdown content...
{{% /details %}}
```

### Partials

#### Details

The same as the [details shortcode](#user-content-shortcode-details), but used in templates.

```
{{ partial "details" ( dict "summary" "Summary..." "content" "Markdown content..." ) }}
```

#### Alert

The same as the [alert shortcode](#user-content-alert-details), but used in templates.

```
{{ partial "alert" ( dict "level" "warning" "content" "Markdown content..." ) }}
```
