{{/*
  openapi/describe.md — description cell of a parameter or a property.

  Input: dict
    text    — description from the spec;
    schema  — schema of the value (enum, default, example are read from it);
    example — example set on the parameter itself, preferred over the schema example.
  Returns: a string for a Markdown table cell, "—" when there is nothing to say.
*/}}
{{- $s := .schema | default dict -}}
{{- $parts := slice -}}
{{- with .text -}}
  {{- $text := partial "openapi/cell.md" . -}}
  {{- if not (strings.HasSuffix $text "..") -}}
    {{- $text = strings.TrimSuffix "." $text -}}
  {{- end -}}
  {{- $parts = $parts | append $text -}}
{{- end -}}
{{- with $s.enum -}}
  {{- $values := slice -}}
  {{- range . -}}
    {{- $values = $values | append (printf "`%s`" (partial "openapi/value.md" .)) -}}
  {{- end -}}
  {{- $parts = $parts | append (printf "%s: %s" "Allowed values" (delimit $values ", ")) -}}
{{- end -}}
{{- if isset $s "default" -}}
  {{- $parts = $parts | append (printf "%s: `%s`" "Default" (partial "openapi/value.md" $s.default)) -}}
{{- end -}}
{{- range $key, $label := dict "minimum" "minimum" "maximum" "maximum" "minLength" "minimum length" "maxLength" "maximum length" "pattern" "pattern" -}}
  {{- if isset $s $key -}}
    {{- $parts = $parts | append (printf "%s: `%s`" (strings.FirstUpper $label) (partial "openapi/value.md" (index $s $key))) -}}
  {{- end -}}
{{- end -}}
{{- $example := cond (ne .example nil) .example $s.example -}}
{{- if ne $example nil -}}
  {{- $parts = $parts | append (printf "%s: `%s`" "Example" (partial "openapi/value.md" $example)) -}}
{{- end -}}
{{- $cell := replace (delimit $parts "<br>") "|" "\\|" | default "—" -}}
{{- return $cell -}}
