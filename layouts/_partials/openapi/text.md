{{/*
  openapi/text.md — description text from the spec prepared for Markdown.

  Input: a Markdown string.
  Returns: the string with placeholders like <version> outside code spans escaped,
           so that they are shown instead of being taken for HTML tags.
*/}}
{{- $parts := slice -}}
{{- range $i, $part := split . "`" -}}
  {{- if modBool $i 2 -}}
    {{- $part = replaceRE `<([a-z0-9_]+)>` "&lt;$1&gt;" $part -}}
  {{- end -}}
  {{- $parts = $parts | append $part -}}
{{- end -}}
{{- return delimit $parts "`" -}}
