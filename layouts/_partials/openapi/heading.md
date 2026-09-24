{{/*
  openapi/heading.md — heading of an operation section.

  Input: dict {path, method, op} of an operation.
  Returns: dict
    title — the first sentence of the summary without code marks and the final period;
            without a summary, the last path segment that is not a parameter,
            e.g. "Reset to project defaults" for .../{merge_request_iid}/reset-to-project-defaults;
    rest  — the rest of the summary, shown under the heading, or "".
*/}}
{{- $title := "" -}}
{{- $rest := "" -}}
{{- with .op.summary -}}
  {{- $sentences := split (strings.TrimSpace .) ". " -}}
  {{- $title = index $sentences 0 -}}
  {{- $rest = delimit (after 1 $sentences) ". " -}}
{{- else -}}
  {{- range split .path "/" -}}
    {{- if and . (not (strings.HasPrefix . "{")) -}}
      {{- $title = . -}}
    {{- end -}}
  {{- end -}}
  {{- $title = replaceRE `[-_]+` " " $title -}}
{{- end -}}
{{- $title = replace $title "`" "" | strings.TrimSuffix "." | strings.FirstUpper | default .op.operationId -}}
{{- $result := dict "title" $title "rest" $rest -}}
{{- return $result -}}
