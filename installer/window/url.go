package main

import (
	"net/url"
	"strings"
)

// Адрес сервера программы и страница окна (0.36).
const (
	serverBase = "https://localhost:3443"
	windowPage = serverBase + "/addin/window.html"
	healthURL  = serverBase + "/addin/window.html"
)

var screens = map[string]bool{"home": true, "delivery": true, "assistant": true, "templates": true, "fields": true, "library": true, "normativ": true, "settings": true}

// screenArg: «--screen=assistant» из аргументов запуска (неизвестный экран — главный).
func screenArg(args []string) string {
	for _, a := range args {
		if s, ok := strings.CutPrefix(a, "--screen="); ok && screens[s] {
			return s
		}
	}
	return ""
}

func pageURL(screen string) string {
	if screen == "" {
		return windowPage
	}
	return windowPage + "?screen=" + url.QueryEscape(screen)
}

// windowSize: окно 1360×860 (в точках при 100 %), но не больше 92 % экрана.
func windowSize(screenW, screenH int, scale float64) (int, int) {
	w, h := int(1360*scale), int(860*scale)
	if mw := screenW * 92 / 100; w > mw {
		w = mw
	}
	if mh := screenH * 92 / 100; h > mh {
		h = mh
	}
	return w, h
}
