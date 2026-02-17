package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

const widget = `/**
 * Alive Badge Widget
 * Usage: <script src="https://alive.best/widget.js" defer></script>
 */
;(function () {
  "use strict"

  var i18n = {
    en: { badge: "Built with Alive", builtWith: "is built with Alive", cta: "Build your own", edit: "Edit me" },
    pt: { badge: "Feito com Alive", builtWith: "é feito com Alive", cta: "Crie o seu", edit: "Editar" }
  }

  function detectLang() {
    var h = location.hostname.toLowerCase()
    if (h.includes("cafecomcacao") || h.includes(".com.br") || h.endsWith(".br")) return "pt"
    var bl = (navigator.language || "").slice(0, 2)
    return i18n[bl] ? bl : "en"
  }
  var L = i18n[detectLang()] || i18n.en

  var isOpen = false
  var box = null

  function createBadge() {
    var a = document.createElement("a")
    a.href = "#"
    a.textContent = L.badge
    a.style.cssText = "position:fixed;bottom:12px;right:12px;font-size:11px;color:#666;text-decoration:none;opacity:0.7;transition:opacity 0.2s;font-family:system-ui,sans-serif;z-index:9999;cursor:pointer"
    a.onmouseover = function () { this.style.opacity = "1" }
    a.onmouseout = function () { if (!isOpen) this.style.opacity = "0.7" }
    a.onclick = function (e) { e.preventDefault(); toggleBox() }
    document.body.appendChild(a)
  }

  function toggleBox() {
    if (isOpen && box) { box.remove(); box = null; isOpen = false; return }

    var hostname = window.location.hostname
    var siteUrl = encodeURIComponent(window.location.origin)
    var qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=" + siteUrl
    var editUrl = "https://terminal.alive.best/chat?wk=" + encodeURIComponent(hostname)

    box = document.createElement("div")
    box.style.cssText = "position:fixed;bottom:36px;right:12px;width:240px;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.15);font-family:system-ui,sans-serif;z-index:9998;overflow:hidden;animation:aliveSlideUp 0.2s ease-out"

    box.innerHTML =
      "<style>@keyframes aliveSlideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }</style>" +
      '<div style="padding:16px">' +
      '<div style="font-size:13px;color:#333;margin-bottom:12px"><strong>' + hostname + '</strong><div style="color:#666;font-size:11px;margin-top:4px">' + L.builtWith + '</div></div>' +
      '<div style="text-align:center;margin-bottom:12px"><img src="' + qrUrl + '" alt="QR Code" loading="lazy" style="width:100px;height:100px;border-radius:8px;border:1px solid #eee"></div>' +
      '<div style="display:flex;justify-content:center;gap:16px;font-size:12px;font-style:italic">' +
      '<a href="' + editUrl + '" target="_blank" rel="noopener" style="color:#666;text-decoration:underline">' + L.edit + '</a>' +
      '<a href="https://terminal.alive.best/chat" target="_blank" rel="noopener" style="color:#666;text-decoration:underline">' + L.cta + '</a>' +
      '</div></div>'

    document.body.appendChild(box)
    isOpen = true
    setTimeout(function () { document.addEventListener("click", closeOnOutside) }, 0)
  }

  function closeOnOutside(e) {
    if (box && !box.contains(e.target) && e.target.textContent !== L.badge) {
      box.remove(); box = null; isOpen = false
      document.removeEventListener("click", closeOnOutside)
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createBadge)
  } else {
    createBadge()
  }
})();`

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "5050"
	}

	// Widget endpoint
	http.HandleFunc("/widget.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=3600") // 1 hour cache
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Write([]byte(widget))
	})

	// Health check
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","time":"%s"}`, time.Now().UTC().Format(time.RFC3339))
	})

	// Root redirect
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		http.Redirect(w, r, "https://alive.best", http.StatusFound)
	})

	log.Printf("Widget server starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
