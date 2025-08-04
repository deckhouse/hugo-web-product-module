# Hugo module for the Deckhouse websites

This is the source for the Hugo module, used in Deckhouse documentation websites.  

Add it in your hugo configuration.

For the local development, you can use the following replace directive in your `go.mod`:

```go
replace github.com/deckhouse/hugo-web-product-module => ../hugo-web-product-module
```

or use use the modules configuration [replacements](https://gohugo.io/configuration/module/#replacements) option.