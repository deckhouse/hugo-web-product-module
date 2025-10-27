# Deckhouse <PRODUCT_NAME> documentation

This is the source for the Deckhouse <PRODUCT_NAME> documentation website.  

To run locally:
1. Install werf and docker.
1. Run:

   ```bash
   make up
   ```

1. Open `http://localhost/products/<PRODUCT_CODE>/documentation/` in your browser (for the english version) or `http://ru.localhost/products/<PRODUCT_CODE>/documentation/` (for the russian version).

The project uses the [hugo-web-product-module](https://github.com/deckhouse/hugo-web-product-module).
