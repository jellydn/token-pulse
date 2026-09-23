# @name    Token Pulse
# @desc    Token usage from Token Pulse GET /api/display
# @author  jellydn
# @version 1.0
# @config  endpoint text "Display URL" default="http://192.168.1.2:3000/api/display" help="Full URL of Token Pulse GET /api/display on your LAN"
# @config  refresh number "Refresh" default=5 min=1 max=60 unit=min help="Minutes between fetches"
# @config  show_today bool "Show today" default=true help="Add a page with today's tokens and cost"

import json

class TokenPulse
  var pages        # finished pages draw() paints: list of {label, pct, color}
  var page         # index of the page currently shown
  var ticks        # loop() calls left until the next fetch
  var in_flight    # true while a request is outstanding
  var stale        # true when the last fetch failed; pages are last-known-good
  var url

  def init()
    self.pages = store.get("pages")
    if !isinstance(self.pages, list) || size(self.pages) == 0
      self.pages = nil
    end
    self.page = 0
    self.stale = store.get("stale", false)
    if type(self.stale) != "bool" self.stale = false end
    self.ticks = 0
    self.in_flight = false
    self.url = store.get("endpoint")
  end

  def compact(v, unit, suffix)
    var whole = 0
    var rem = v
    while rem >= unit
      whole += 1
      rem -= unit
    end
    var tenth = 0
    var step = int(unit / 10)
    while rem >= step
      tenth += 1
      rem -= step
    end
    return str(whole) + "." + str(tenth) + suffix
  end

  def fmt_tokens(t)
    if type(t) != "int" && type(t) != "real" return "--" end
    var v = int(t)
    if v < 0 v = 0 end
    if v >= 1000000 return self.compact(v, 1000000, "M") end
    if v >= 1000 return self.compact(v, 1000, "K") end
    return str(v)
  end

  def fmt_cost(c)
    if type(c) != "int" && type(c) != "real" return "" end
    if c < 0 c = 0 end
    var cents = int(c * 100 + 0.5)
    var dollars = 0
    var rem = cents
    while rem >= 100
      dollars += 1
      rem -= 100
    end
    var s = "$" + str(dollars) + "."
    if rem < 10 s += "0" end
    return s + str(rem)
  end

  def bar_color(pct)
    if pct >= 25 return 0x00FF00 end
    if pct >= 10 return 0xFFAA00 end
    return 0xFF3333
  end

  def mark_stale()
    self.stale = true
    store.set("stale", true)
  end

  def on_body(body, status)
    self.in_flight = false
    # Failures keep last-known pages; mark stale so draw() shows "~".
    if body == nil || (type(status) == "int" && (status < 200 || status >= 300))
      self.mark_stale()
      return
    end

    var data = json.load(body)
    if !isinstance(data, map)
      self.mark_stale()
      return
    end

    var degraded = data.find("degraded") == true
    var pages = []

    var providers = data.find("providers")
    if isinstance(providers, list)
      var n = size(providers)
      if n > 8 n = 8 end
      if n > 0
        for i : 0 .. n - 1
          var p = providers[i]
          if isinstance(p, map)
            var name = p.find("name")
            if type(name) != "string" name = "?" end
            var pct = p.find("remainingPercent")
            if type(pct) == "int" || type(pct) == "real"
              var pcti = int(pct)
              if pcti < 0 pcti = 0 end
              if pcti > 100 pcti = 100 end
              var label = name + " " + str(pcti) + "%"
              if degraded label = "!" + label end
              pages.push({'label': label, 'pct': pcti, 'color': self.bar_color(pcti)})
            end
          end
        end
      end
    end

    if store.get("show_today", true) != false
      var today = data.find("today")
      if isinstance(today, map)
        var label = "T " + self.fmt_tokens(today.find("tokens")) +
                    " " + self.fmt_cost(today.find("cost"))
        if degraded label = "!" + label end
        pages.push({'label': label, 'pct': -1, 'color': 0x00AAFF})
      end
    end

    var top = data.find("topProject")
    if isinstance(top, map)
      var tname = top.find("name")
      if type(tname) == "string"
        var tlabel = tname + " " + self.fmt_tokens(top.find("tokens"))
        if degraded tlabel = "!" + tlabel end
        pages.push({'label': tlabel, 'pct': -1, 'color': 0x888888})
      end
    end

    if size(pages) == 0
      self.mark_stale()
      return
    end

    self.pages = pages
    self.page = 0
    self.stale = false
    store.set("pages", pages)
    store.set("stale", false)
  end

  def loop()
    if self.ticks <= 0
      var mins = store.get("refresh", 5)
      if type(mins) == "string" mins = num(mins, 5) end
      if type(mins) != "int" && type(mins) != "real" mins = 5 end
      mins = int(mins)
      if mins < 1 mins = 1 end
      if mins > 60 mins = 60 end
      self.ticks = mins * 60
      if !self.in_flight
        self.in_flight = true
        http.get(self.url, / b, st -> self.on_body(b, st))
      end
    end
    self.ticks -= 1
  end

  def draw()
    clear()
    if self.pages == nil || size(self.pages) == 0
      text(1, 6, "...", 0x666666)
      return
    end
    if self.page >= size(self.pages) self.page = 0 end

    var p = self.pages[self.page]
    var label = "..."
    var pct = -1
    var color = 0xFFFFFF
    if isinstance(p, map)
      var l = p.find("label")
      if type(l) == "string" label = l end
      var q = p.find("pct")
      if type(q) == "int" || type(q) == "real" pct = int(q) end
      var c = p.find("color")
      if type(c) == "int" || type(c) == "real" color = int(c) end
    end

    if self.stale
      label = "~" + label
      color = 0x666666
    end

    scroll_text(label, color)

    if pct >= 0
      var bar = pct
      if bar > 100 bar = 100 end
      if self.stale
        progress(bar, 0x444444, 0x101010)
      else
        progress(bar, color, 0x101010)
      end
    end
  end

  def on_hide()
    if self.pages != nil && size(self.pages) > 1
      self.page = (self.page + 1) % size(self.pages)
    end
  end

  def on_button(btn)
    if btn == "select"
      self.ticks = 0
    end
  end
end

return TokenPulse()
