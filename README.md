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
