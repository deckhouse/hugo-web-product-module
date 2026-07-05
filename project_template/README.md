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

`make pdf` triggers the werf `print-artifacts` build and extracts the resulting files into
`public/{en,ru}/documentation/downloads/print/<productCode>.{pdf,docx}` via `docker cp` from the
built image.

The print-generation logic lives entirely inside `werf.yaml`:

- `print-base` — an intermediate image with WeasyPrint, Pandoc, Node.js and npm dependencies.
- `print-artifacts` — imports the built site from `web-artifacts`, clones the print scripts
  from `github.com/deckhouse/hugo-web-product-module` at the git tag pinned in `go.mod`,
  runs `print-export.js` for EN and RU, and exports the full site + PDF/DOCX to `/out`.
- `web` — nginx image serving the combined tree.

If `params.pdf` is not `true` in `config/_default/hugo.yaml`, the `print-artifacts` stage
simply copies the site through without running the print pipeline.
