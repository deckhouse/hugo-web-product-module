{{/*
  openapi/cell.md — Markdown text squeezed into one table cell.

  Input: a Markdown string.
  Returns: the text on one line; paragraphs and list items are separated by <br>.
  Pipes are escaped by the caller.
*/}}
{{- $text := partial "openapi/text.md" . | strings.TrimSpace -}}
{{- $text = $text | replaceRE `\n\s*\n\s*` "<br>" | replaceRE `\n\s*([-*] )` "<br>$1" | replaceRE `\s*\n\s*` " " -}}
{{- return $text -}}
