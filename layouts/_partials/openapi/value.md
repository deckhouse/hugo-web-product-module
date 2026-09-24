{{/*
  openapi/value.md — a default, example or enum value as text.

  Input: any value from the spec.
  Returns: strings and numbers as is, objects and arrays as compact JSON.
*/}}
{{- $text := "" -}}
{{- if or (reflect.IsMap .) (reflect.IsSlice .) -}}
  {{- $text = jsonify . -}}
{{- else -}}
  {{- $text = printf "%v" . | replaceRE `\s*\n\s*` " " -}}
{{- end -}}
{{- return $text -}}
