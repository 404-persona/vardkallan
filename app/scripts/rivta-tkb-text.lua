-- Gör om en tjänstekontraktsbeskrivning (TKB) till läsbar text som kan pinnas med sha256.
-- Rubrikerna numreras som Word gör (1, 1.1, 1.1.1), så att avsnitten i texten har samma nummer som i TKB. Rubriker för
-- innehållsförteckningen och tabellerna i början (Revisionshistorik, Referenser) är inte numrerade i TKB, och tomma
-- rubriker tas bort. Varje rad i en tabell blir en rad med cellerna åtskilda av |, och stycken inom en cell åtskilda av ¶.
-- Bilder tas bort, och bildtexten står kvar. Radbrytningar inom ett stycke blir mellanslag.
local n = {0, 0, 0, 0, 0, 0}
local onumrerade = { ['TOC-Heading'] = true, ['Tabell-titel'] = true, ['mark'] = true }
function Header(h)
  if pandoc.utils.stringify(h.content):match("^%s*$") then return {} end
  for _, k in ipairs(h.classes) do if onumrerade[k] then h.attr = pandoc.Attr() return h end end
  n[h.level] = n[h.level] + 1
  for i = h.level + 1, 6 do n[i] = 0 end
  local delar = {}
  for i = 1, h.level do delar[#delar + 1] = tostring(n[i]) end
  table.insert(h.content, 1, pandoc.Space())
  table.insert(h.content, 1, pandoc.Str(table.concat(delar, '.')))
  h.attr = pandoc.Attr()
  return h
end
function Image(i) return i.caption end
-- En radbrytning inom ett stycke (till exempel mellan koderna i en lista i en tabellcell) blir ett mellanslag, så att
-- orden inte skrivs ihop.
function LineBreak() return pandoc.Space() end
function SoftBreak() return pandoc.Space() end
-- Styckena i en cell, också inuti citat (indragna stycken), avsnitt och listor, så att varje stycke blir för sig.
local function stycken(block, delar)
  for _, b in ipairs(block) do
    if b.t == 'BlockQuote' or b.t == 'Div' then stycken(b.content, delar)
    elseif b.t == 'BulletList' or b.t == 'OrderedList' then for _, punkt in ipairs(b.content) do stycken(punkt, delar) end
    else
      local s = pandoc.utils.stringify(b):gsub('%s+', ' '):gsub('^ ', ''):gsub(' $', '')
      if s ~= '' then delar[#delar + 1] = s end
    end
  end
end
local function cell(c)
  local delar = {}
  stycken(c.contents, delar)
  return table.concat(delar, ' ¶ ')
end
local function rad(r)
  local celler = {}
  for _, c in ipairs(r.cells) do celler[#celler + 1] = cell(c) end
  return '| ' .. table.concat(celler, ' | ') .. ' |'
end
function Table(t)
  local rader = {}
  for _, r in ipairs(t.head.rows) do rader[#rader + 1] = rad(r) end
  for _, b in ipairs(t.bodies) do
    for _, r in ipairs(b.head) do rader[#rader + 1] = rad(r) end
    for _, r in ipairs(b.body) do rader[#rader + 1] = rad(r) end
  end
  for _, r in ipairs(t.foot.rows) do rader[#rader + 1] = rad(r) end
  return pandoc.RawBlock('markdown', table.concat(rader, '\n'))
end
