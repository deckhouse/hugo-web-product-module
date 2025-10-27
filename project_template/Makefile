# Makefile for the Hugo website

# Tools / variables (can be overridden on the command line)
HUGO ?= hugo
BIND ?= 0.0.0.0
SERVE_FLAGS ?= --cleanDestinationDir --bind=$(BIND)
HUGOFLAGS ?= --minify

.PHONY: help serve build clean

help:
	@echo "Usage: make [target]"
	@echo
	@echo "Common targets:"
	@echo "  serve    Start Hugo dev server (hugo serve --cleanDestinationDir)"
	@echo "  build    Build the site to ./public"
	@echo "  clean    Remove generated public files"
	@echo "  help     Show this help"
	@echo
	@echo "Variables (can be overridden):"
	@echo "  HUGO=$(HUGO)"
	@echo "  PORT=$(PORT)"
	@echo "  BIND=$(BIND)"
	@echo "  BASEURL=$(BASEURL)"

up:
	which werf >/dev/null || source $(trdl use werf 2 beta)
	werf compose up --dev

serve:
	$(HUGO) serve $(SERVE_FLAGS)

build:
	@echo "Building site to ./public..."
	$(HUGO) $(HUGOFLAGS)

clean:
	@echo "Removing ./public/*"
	@rm -rf public/*
