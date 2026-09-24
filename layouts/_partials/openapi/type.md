{{/*
  openapi/type.md — human-readable type of a schema for a table cell.

  Input: a schema.
  Returns: a string, empty for an unknown type; a reference to a named schema
           is a link to its section on the same page. Callers capitalize it for a cell.
*/}}
{{- $s := . | default dict -}}
{{- $result := "" -}}
{{- $variants := or $s.oneOf $s.anyOf $s.allOf -}}
{{- $ref := index $s "$ref" -}}
{{- if $ref -}}
  {{- $name := path.Base $ref -}}
  {{- $result = printf "[%s](#%s)" $name (anchorize $name) -}}
{{- else if $variants -}}
  {{- $types := slice -}}
  {{- range $variants -}}
    {{- $types = $types | append (partial "openapi/type.md" .) -}}
  {{- end -}}
  {{- $result = delimit ($types | uniq) " or " -}}
{{- else if eq $s.type "array" -}}
  {{- $items := $s.items | default dict -}}
  {{- if index $items "$ref" -}}
    {{- $result = printf "array of %s" (partial "openapi/type.md" $items) -}}
  {{- else if $items.type -}}
    {{- $result = printf "array of %ss" $items.type -}}
  {{- else -}}
    {{- $result = "array" -}}
  {{- end -}}
{{- else if $s.type -}}
  {{- $result = $s.type -}}
{{- else if $s.additionalProperties -}}
  {{- $result = "object" -}}
{{- end -}}
{{- with $s.format -}}
  {{- $result = printf "%s (%s)" $result . -}}
{{- end -}}
{{- return $result -}}
