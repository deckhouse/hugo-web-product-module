{{/*
  openapi/props.md — flattened list of object properties.

  Input: dict
    schema — object schema;
    prefix — prefix for property names of nested objects (`parent.`, `parent[].`);
    depth  — nesting depth, starts at 0.
  Returns: a slice of dicts {name, type, required, desc}.
  Properties of inline nested objects and of arrays of inline objects follow their parent.
*/}}
{{- $rows := slice -}}
{{- $required := .schema.required | default slice -}}
{{- range $name, $prop := .schema.properties -}}
  {{- $full := printf "%s%s" $.prefix $name -}}
  {{- $rows = $rows | append (dict
    "name" $full
    "type" (partial "openapi/type.md" $prop | strings.FirstUpper | default "—")
    "required" (in $required $name)
    "desc" (partial "openapi/describe.md" (dict "text" $prop.description "schema" $prop "example" $prop.example))
  ) -}}
  {{- if lt $.depth 5 -}}
    {{- if $prop.properties -}}
      {{- $rows = $rows | append (partial "openapi/props.md" (dict "schema" $prop "prefix" (printf "%s." $full) "depth" (add $.depth 1))) -}}
    {{- else if and $prop.items $prop.items.properties -}}
      {{- $rows = $rows | append (partial "openapi/props.md" (dict "schema" $prop.items "prefix" (printf "%s[]." $full) "depth" (add $.depth 1))) -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
{{- return $rows -}}
