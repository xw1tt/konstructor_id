package main

import "testing"

func TestScreenArg(t *testing.T) {
	if s := screenArg([]string{"--screen=assistant"}); s != "assistant" {
		t.Fatal(s)
	}
	if s := screenArg([]string{"--screen=evil&x=1"}); s != "" {
		t.Fatal(s)
	}
	if u := pageURL("delivery"); u != "https://localhost:3443/addin/window.html?screen=delivery" {
		t.Fatal(u)
	}
	if u := pageURL(""); u != windowPage {
		t.Fatal(u)
	}
}

func TestWindowSize(t *testing.T) {
	if w, h := windowSize(1920, 1080, 1); w != 1360 || h != 860 {
		t.Fatal(w, h)
	}
	if w, h := windowSize(1366, 768, 1); w != 1256 || h != 706 {
		t.Fatal(w, h)
	}
	if w, h := windowSize(3840, 2160, 1.5); w != 2040 || h != 1290 {
		t.Fatal(w, h)
	}
}
