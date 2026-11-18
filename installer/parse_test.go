package main

import "testing"

func TestParseRegValue(t *testing.T) {
	out := "\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Office\\ClickToRun\\Configuration\r\n    ProductReleaseIds    REG_SZ    ProjectPro2021Volume,ProPlus2021Volume,VisioPro2021Volume\r\n\r\n"
	if got := parseRegValue(out, "ProductReleaseIds"); got != "ProjectPro2021Volume,ProPlus2021Volume,VisioPro2021Volume" {
		t.Fatalf("got %q", got)
	}
	if parseRegValue(out, "Platform") != "" {
		t.Fatal("нет значения — пусто")
	}
}

func TestParseCatalogs(t *testing.T) {
	out := "\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Office\\16.0\\WEF\\TrustedCatalogs\\{9008FEED-78F8-4469-8247-0CCE5232F660}\r\n    Id    REG_SZ    {9008FEED-78F8-4469-8247-0CCE5232F660}\r\n    Url    REG_SZ    \\\\DESKTOP-ROJ88E9\\KonstruktorID\r\n    Flags    REG_DWORD    0x1\r\n\r\n"
	m := parseCatalogs(out)
	if len(m) != 1 {
		t.Fatalf("%v", m)
	}
	for _, u := range m {
		if u != `\\DESKTOP-ROJ88E9\KonstruktorID` {
			t.Fatalf("url %q", u)
		}
	}
}

func TestPerpetualOffice(t *testing.T) {
	for ids, want := range map[string]bool{
		"ProjectPro2021Volume,ProPlus2021Volume,VisioPro2021Volume": true,
		"ProPlus2024Volume":                    true,
		"O365ProPlusRetail":                    false,
		"O365BusinessRetail,ProPlus2021Volume": false,
		"":                                     false,
	} {
		if perpetualOffice(ids) != want {
			t.Errorf("%q: want %v", ids, want)
		}
	}
}

func TestCompareVersions(t *testing.T) {
	if compareVersions("0.31", "0.31.1") >= 0 || compareVersions("0.32", "0.31.9") <= 0 || compareVersions("0.31.0", "0.31") != 0 {
		t.Fatal("compareVersions")
	}
}
