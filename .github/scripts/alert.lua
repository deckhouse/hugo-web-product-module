-- alert.lua — Pandoc filter for the print → DOCX pipeline.
--
-- Maps <div class="{info,warning,danger} alert__wrap">…</div> to Custom Word
-- styles AlertInfo/AlertWarning/AlertDanger (predefined in reference.docx).
-- Maps elements with class pdf-tab__title / pdf-details__summary to Custom
-- Style TabTitle — so tab/details labels stand out but do NOT enter the TOC.

local ALERT_STYLE = {
  info    = "AlertInfo",
  warning = "AlertWarning",
  warn    = "AlertWarning",
  danger  = "AlertDanger",
}

local function hasClass(el, cls)
  if not el.attr or not el.attr.classes then return false end
  for _, c in ipairs(el.attr.classes) do
    if c == cls then return true end
  end
  return false
end

local function applyStyle(el, style)
  el.attr.attributes["custom-style"] = style
  return el
end

function Div(el)
  if hasClass(el, "alert__wrap") then
    local style = "AlertInfo"
    for level, name in pairs(ALERT_STYLE) do
      if hasClass(el, level) then style = name; break end
    end
    return applyStyle(el, style)
  end
  if hasClass(el, "pdf-tab__title") or hasClass(el, "pdf-details__summary") then
    return applyStyle(el, "TabTitle")
  end
end

function Para(el)
  -- Paragraphs from raw HTML may keep the class as an attribute. Pandoc's HTML
  -- reader wraps <p class="…"> in a Div for us most of the time, but handle the
  -- direct case as well.
  if hasClass(el, "pdf-tab__title") or hasClass(el, "pdf-details__summary") then
    return pandoc.Div({ el }, pandoc.Attr("", {}, { ["custom-style"] = "TabTitle" }))
  end
end
