{{/*
  openapi/name.md — name cell of a parameter or a request body property.

  Input: dict
    name     — parameter or property name;
    in       — where a parameter is passed (path, query, header), empty for a property;
    required — whether the value is required.
  Returns: the name as code, followed on a new line by where it is passed and whether it is required,
           e.g. "`id`<br>Path, required".
*/}}
{{- $notes := slice -}}
{{- with .in -}}
  {{- $notes = $notes | append . -}}
{{- end -}}
{{- if .required -}}
  {{- $notes = $notes | append "required" -}}
{{- end -}}
{{- $cell := printf "`%s`" .name -}}
{{- with $notes -}}
  {{- $cell = printf "%s<br>%s" $cell (delimit . ", " | strings.FirstUpper) -}}
{{- end -}}
{{- return $cell -}}
