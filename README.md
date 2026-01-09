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

The Hugo version assumed to be 0.150.1. But it maybe will work with higher versions as well.

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
{{< tabs >}}
{{% tab "MacOS" %}} # MacOS Content {{% /tab %}}
{{% tab "Linux" %}} # Linux Content {{% /tab %}}
{{% tab "Windows" %}} # Windows Content {{% /tab %}}
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
