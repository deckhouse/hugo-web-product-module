-- docx-toc.lua — replace <div class="docx-toc-here"></div> in the input HTML
-- with a raw Word TOC field. Word/LibreOffice populate the field on first
-- open. Used instead of Pandoc's own `--toc` because `--toc` always puts the
-- TOC before the body, colliding with our cover page.
--
-- Reads the language from env var PRINT_EXPORT_LANG (set by print-export.js);
-- falls back to "en".

local LANG = os.getenv("PRINT_EXPORT_LANG") or "en"

local TOC_TITLE = ({
  en = "Table of Contents",
  ru = "Содержание",
})[LANG] or "Table of Contents"

local HINT = ({
  en = 'Right-click and choose "Update Field" to populate the table of contents.',
  ru = 'Обновите поле, чтобы отобразить содержание (правая кнопка мыши → «Обновить поле»).',
})[LANG] or 'Right-click and choose "Update Field" to populate the table of contents.'

local function toc_field_xml()
  return table.concat({
    '<w:p>',
      '<w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr>',
      '<w:r><w:t xml:space="preserve">', TOC_TITLE, '</w:t></w:r>',
    '</w:p>',
    '<w:p>',
      '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>',
      '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>',
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>',
      '<w:r><w:t xml:space="preserve">', HINT, '</w:t></w:r>',
      '<w:r><w:fldChar w:fldCharType="end"/></w:r>',
    '</w:p>',
  })
end

local PAGE_BREAK = pandoc.RawBlock("openxml",
  '<w:p><w:r><w:br w:type="page"/></w:r></w:p>')

function Div(el)
  local hasClass = function(name)
    for _, c in ipairs(el.attr.classes) do
      if c == name then return true end
    end
    return false
  end

  if hasClass("docx-toc-here") or el.attr.identifier == "docx-toc-here" then
    return pandoc.RawBlock("openxml", toc_field_xml())
  end
  if hasClass("page-break") then
    return PAGE_BREAK
  end
end
