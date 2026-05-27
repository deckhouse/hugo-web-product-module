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

The minimum required Hugo version is `v0.162.0` (uses the official `ghcr.io/gohugoio/hugo` image). The template relies on Hugo APIs introduced in `v0.156.0` (e.g. `hugo.Data`), so older versions are not supported.

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
