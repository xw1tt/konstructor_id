package main

// 0.32: разбор вывода reg.exe и правила выбора — без Windows API, проверяются тестами на любой системе.

import (
	"fmt"
	"strings"
)

// parseRegValue — значение name из вывода «reg query <ключ> /v name».
func parseRegValue(out, name string) string {
	for _, l := range strings.Split(out, "\n") {
		f := strings.Fields(strings.TrimRight(l, "\r"))
		if len(f) >= 3 && strings.EqualFold(f[0], name) && strings.HasPrefix(f[1], "REG_") {
			return strings.TrimSpace(strings.Join(f[2:], " "))
		}
	}
	return ""
}

// parseCatalogs — доверенные каталоги из вывода «reg query …\TrustedCatalogs /s»: подраздел → Url.
func parseCatalogs(out string) map[string]string {
	res := map[string]string{}
	key := ""
	for _, l := range strings.Split(out, "\n") {
		l = strings.TrimRight(l, "\r")
		if strings.HasPrefix(strings.ToUpper(l), "HKEY_") {
			key = strings.TrimSpace(l)
			continue
		}
		f := strings.Fields(l)
		if key != "" && len(f) >= 3 && strings.EqualFold(f[0], "Url") {
			res[key] = strings.Join(f[2:], " ")
		}
	}
	return res
}

// perpetualOffice — бессрочный Office (LTSC/2019/2021/2024, лицензия на объём) по ProductReleaseIds.
func perpetualOffice(ids string) bool {
	ids = strings.ToLower(ids)
	return ids != "" && !strings.Contains(ids, "o365") &&
		(strings.Contains(ids, "volume") || strings.Contains(ids, "2019") || strings.Contains(ids, "2021") || strings.Contains(ids, "2024"))
}

// compareVersions сравнивает версии вида 0.30.1: <0 — a старше b, 0 — равны, >0 — a новее.
func compareVersions(a, b string) int {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(pa) || i < len(pb); i++ {
		var x, y int
		if i < len(pa) {
			fmt.Sscanf(pa[i], "%d", &x)
		}
		if i < len(pb) {
			fmt.Sscanf(pb[i], "%d", &y)
		}
		if x != y {
			if x < y {
				return -1
			}
			return 1
		}
	}
	return 0
}
