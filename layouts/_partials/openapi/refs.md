{{/*
  openapi/refs.md — names of the schemas a schema refers to.

  Input: a schema.
  Returns: a slice of schema names from `#/components/schemas/<name>` references.
*/}}
{{- $names := slice -}}
{{- range findRE `#/components/schemas/[A-Za-z0-9_]+` (jsonify .) -}}
  {{- $names = $names | append (path.Base .) -}}
{{- end -}}
{{- return $names -}}
