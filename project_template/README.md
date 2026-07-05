# Deckhouse <PRODUCT_NAME> documentation

This is the source for the Deckhouse <PRODUCT_NAME> documentation website.

The project uses [Hugo](gohugo.io) SSG and the [hugo-web-product-module](https://github.com/deckhouse/hugo-web-product-module/) module for a theme (see [README.md](https://github.com/deckhouse/hugo-web-product-module/blob/main/README.md) for details about content markup).

Read [`hugo-web-product-module` README.md](https://github.com/deckhouse/hugo-web-product-module/blob/main/README.md) for information about content markup and other details.
  
## How to run the documentation site locally

To run locally:
1. Install werf and docker.
1. Run:

   ```bash
   make up
   ```

1. Open `http://localhost/products/<PRODUCT_CODE>/documentation/` in your browser (for the english version) or `http://ru.localhost/products/<PRODUCT_CODE>/documentation/` (for the russian version).

## Generating PDF/DOCX exports

`make pdf` builds the site and produces PDF+DOCX files under `public/{en,ru}/documentation/downloads/print/`.

By default, the print scripts are fetched from the git tag pinned in `go.mod`
(`github.com/deckhouse/hugo-web-product-module`) and cached under
`~/.cache/hugo-web-product-module/<version>/scripts`.

To iterate on the scripts locally against a sibling clone of the module, point
`TEMPLATE_DIR` at it (analogous to uncommenting the `replace` directive in
`go.mod`):

```bash
make pdf TEMPLATE_DIR=../hugo-web-product-module
```
