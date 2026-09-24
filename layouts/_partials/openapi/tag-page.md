{{/*
  openapi/tag-page.md — Markdown body of a REST API reference page for one tag.

  Input: dict
    tag  — tag object from the spec (name, description);
    ops  — slice of dicts {path, method, op} with the operations of the tag;
    spec — the whole spec.
  Returns: a Markdown string.
*/}}
{{- $schemas := .spec.components.schemas -}}
{{- $blocks := slice -}}
{{- $refs := slice -}}

{{- with .tag.description -}}
  {{- $blocks = $blocks | append (partial "openapi/text.md" .) -}}
{{- end -}}

{{- range .ops -}}
  {{- $op := .op -}}
  {{- $heading := partial "openapi/heading.md" . -}}
  {{- $title := $heading.title -}}
  {{- if $op.deprecated -}}
    {{- $title = printf "%s (%s)" $title "deprecated" -}}
  {{- end -}}
  {{- $blocks = $blocks | append (printf "## %s" $title) (printf "`%s %s`" (upper .method) .path) -}}
  {{- with $heading.rest -}}
    {{- $blocks = $blocks | append (partial "openapi/text.md" .) -}}
  {{- end -}}
  {{- with $op.description -}}
    {{- if ne . $op.summary -}}
      {{- $blocks = $blocks | append (partial "openapi/text.md" .) -}}
    {{- end -}}
  {{- end -}}

  {{- with $op.parameters -}}
    {{- $rows := slice
      "| Name | Type | Description |"
      "|---|---|---|"
    -}}
    {{- range . -}}
      {{- $rows = $rows | append (printf "| %s | %s | %s |"
        (partial "openapi/name.md" (dict "name" .name "in" .in "required" .required))
        (partial "openapi/type.md" .schema | strings.FirstUpper | default "—")
        (partial "openapi/describe.md" (dict "text" .description "schema" .schema "example" .example))
      ) -}}
    {{- end -}}
    {{- $blocks = $blocks | append "**Parameters**" (delimit $rows "\n") -}}
  {{- end -}}

  {{- with $op.requestBody -}}
    {{- range $mediaType, $content := .content -}}
      {{- $name := path.Base (index $content.schema "$ref") -}}
      {{- $schema := index $schemas $name -}}
      {{- $refs = union $refs (partial "openapi/refs.md" $schema) -}}
      {{- $blocks = $blocks | append (printf "**Request body** (`%s`)" $mediaType) -}}
      {{- $props := partial "openapi/props.md" (dict "schema" $schema "prefix" "" "depth" 0) -}}
      {{- with $props -}}
        {{- $rows := slice
          "| Property | Type | Description |"
          "|---|---|---|"
        -}}
        {{- range . -}}
          {{- $rows = $rows | append (printf "| %s | %s | %s |" (partial "openapi/name.md" .) .type .desc) -}}
        {{- end -}}
        {{- $blocks = $blocks | append (delimit $rows "\n") -}}
      {{- end -}}
    {{- end -}}
  {{- end -}}

  {{- $rows := slice
    "| Code | Description | Schema |"
    "|---|---|---|"
  -}}
  {{- range $code, $response := $op.responses -}}
    {{- $types := slice -}}
    {{- range $mediaType, $content := $response.content -}}
      {{- $type := partial "openapi/type.md" $content.schema | strings.FirstUpper -}}
      {{- if ne $mediaType "application/json" -}}
        {{- $type = printf "%s (`%s`)" $type $mediaType -}}
      {{- end -}}
      {{- $types = $types | append $type -}}
      {{- $refs = union $refs (partial "openapi/refs.md" $content.schema) -}}
    {{- end -}}
    {{- $description := replace (partial "openapi/cell.md" $response.description) "|" "\\|" | default "—" -}}
    {{- $rows = $rows | append (printf "| `%s` | %s | %s |" $code $description (delimit $types "<br>" | default "—")) -}}
  {{- end -}}
  {{- $blocks = $blocks | append "**Responses**" (delimit $rows "\n") -}}
{{- end -}}

{{/* Schemas referenced by the operations, including nested references. */}}
{{- $seen := slice -}}
{{- $queue := $refs -}}
{{- range seq 10 -}}
  {{- if not $queue -}}{{- break -}}{{- end -}}
  {{- $next := slice -}}
  {{- range $queue -}}
    {{- if not (in $seen .) -}}
      {{- $seen = $seen | append . -}}
      {{- $next = union $next (partial "openapi/refs.md" (index $schemas .)) -}}
    {{- end -}}
  {{- end -}}
  {{- $queue = $next -}}
{{- end -}}

{{- with sort $seen -}}
  {{- $blocks = $blocks | append "## Schemas" "Objects returned by the operations above and objects nested in their request bodies." -}}
  {{- range . -}}
    {{- $schema := index $schemas . -}}
    {{- $blocks = $blocks | append (printf "### %s" .) -}}
    {{- with $schema.description -}}
      {{- $blocks = $blocks | append (partial "openapi/text.md" .) -}}
    {{- end -}}
    {{- $props := partial "openapi/props.md" (dict "schema" $schema "prefix" "" "depth" 0) -}}
    {{- with $props -}}
      {{- $rows := slice
        "| Property | Type | Description |"
        "|---|---|---|"
      -}}
      {{- range . -}}
        {{- $rows = $rows | append (printf "| `%s` | %s | %s |" .name .type .desc) -}}
      {{- end -}}
      {{- $blocks = $blocks | append (delimit $rows "\n") -}}
    {{- end -}}
  {{- end -}}
{{- end -}}

{{- return delimit $blocks "\n\n" -}}
