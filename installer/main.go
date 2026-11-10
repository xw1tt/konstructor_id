// Установщик «Конструктора ИД» для Windows: без прав администратора, в профиль пользователя.
// Внутри (payload.zip): Node.js, сервер одним файлом, панель Excel, скрипты запуска.
//
//	KonstruktorID-Setup.exe             — установка или обновление
//	KonstruktorID-Setup.exe /uninstall  — удаление (так его вызывает «Установка и удаление программ»)
package main

import (
	"archive/zip"
	"bytes"
	"crypto/sha1"
	"crypto/tls"
	"crypto/x509"
	_ "embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unicode/utf16"
	"unsafe"
)

//go:embed payload.zip
var payload []byte

var version = "dev"

const (
	appName    = "Конструктор ИД"
	regUninst  = `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\KonstruktorID`
	regRun     = `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
	regAddins  = `HKCU\Software\Microsoft\Office\16.0\WEF\Developer`
	serverURL  = "https://localhost:3443/addin/index.html"
	mbOK       = 0x00000000
	mbYesNo    = 0x00000004
	mbIconInfo = 0x00000040
	mbIconWarn = 0x00000030
	mbIconErr  = 0x00000010
	mbIconQ    = 0x00000020
	mbDefBtn2  = 0x00000100
	idYes      = 6
)

var (
	user32      = syscall.NewLazyDLL("user32.dll")
	messageBoxW = user32.NewProc("MessageBoxW")
)

func msg(text string, flags uintptr) int {
	t, _ := syscall.UTF16PtrFromString(text)
	c, _ := syscall.UTF16PtrFromString(appName)
	r, _, _ := messageBoxW.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), flags)
	return int(r)
}

func fail(step string, err error) {
	msg(fmt.Sprintf("Не удалось: %s.\n\n%v\n\nЗакройте Excel и запустите установщик ещё раз. Если ошибка повторится — пришлите этот текст разработчику.", step, err), mbOK|mbIconErr)
	os.Exit(1)
}

// hidden — команда без окна консоли.
func hidden(name string, args ...string) *exec.Cmd {
	c := exec.Command(name, args...)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	return c
}

// ps выполняет скрипт PowerShell (передаётся в UTF-16 — пути с кириллицей не портятся).
func ps(script string) (string, error) {
	u := utf16.Encode([]rune(script))
	b := make([]byte, len(u)*2)
	for i, v := range u {
		b[2*i], b[2*i+1] = byte(v), byte(v>>8)
	}
	out, err := hidden("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
		"-EncodedCommand", base64.StdEncoding.EncodeToString(b)).CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

// interactive — без окна консоли, но с видимыми окнами Windows (вопрос о сертификате): HideWindow скрыл бы и его.
func interactive(name string, args ...string) *exec.Cmd {
	c := exec.Command(name, args...)
	c.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x08000000}
	return c
}

func psq(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }

type dirs struct{ install, data, startup, menu string }

func paths() dirs {
	local, roaming := os.Getenv("LOCALAPPDATA"), os.Getenv("APPDATA")
	return dirs{
		install: filepath.Join(local, "Programs", "KonstruktorID"),
		data:    filepath.Join(local, "KonstruktorID"),
		startup: filepath.Join(roaming, `Microsoft\Windows\Start Menu\Programs\Startup`),
		menu:    filepath.Join(roaming, `Microsoft\Windows\Start Menu\Programs`, appName),
	}
}

func stopServer(d dirs) {
	script := filepath.Join(d.install, "stop-server.ps1")
	if _, err := os.Stat(script); err == nil {
		_ = hidden("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script).Run()
		return
	}
	// Сервер, запущенный прежней версией из исходников (npm start).
	_, _ = ps(`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*packages*server*src*main.ts*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Milliseconds 500`)
}

func unzip(dst string) error {
	r, err := zip.NewReader(bytes.NewReader(payload), int64(len(payload)))
	if err != nil {
		return err
	}
	for _, f := range r.File {
		p := filepath.Join(dst, filepath.FromSlash(f.Name))
		if !strings.HasPrefix(p, filepath.Clean(dst)+string(os.PathSeparator)) {
			return fmt.Errorf("неверный путь в архиве: %s", f.Name)
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(p, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			return err
		}
		src, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.Create(p)
		if err != nil {
			src.Close()
			return err
		}
		_, err = io.Copy(out, src)
		src.Close()
		if cerr := out.Close(); err == nil {
			err = cerr
		}
		if err != nil {
			return err
		}
	}
	return nil
}

func thumbprint(pemPath string) (string, error) {
	b, err := os.ReadFile(pemPath)
	if err != nil {
		return "", err
	}
	blk, _ := pem.Decode(b)
	if blk == nil {
		return "", fmt.Errorf("нет сертификата в %s", pemPath)
	}
	if _, err := x509.ParseCertificate(blk.Bytes); err != nil {
		return "", err
	}
	s := sha1.Sum(blk.Bytes)
	return strings.ToUpper(hex.EncodeToString(s[:])), nil
}

func certTrusted(thumb string) bool {
	out, _ := ps(`Test-Path ` + psq(`Cert:\CurrentUser\Root\`+thumb))
	return strings.EqualFold(out, "True")
}

func shortcut(link, target, args, dir, desc string) error {
	_ = os.MkdirAll(filepath.Dir(link), 0o755)
	out, err := ps(fmt.Sprintf(`[Console]::OutputEncoding = [Text.Encoding]::UTF8; $ErrorActionPreference = 'Stop'; $s = (New-Object -ComObject WScript.Shell).CreateShortcut(%s); $s.TargetPath = %s; $s.Arguments = %s; $s.WorkingDirectory = %s; $s.Description = %s; $s.Save()`,
		psq(link), psq(target), psq(args), psq(dir), psq(desc)))
	if err != nil && out != "" {
		return fmt.Errorf("%v: %s", err, out)
	}
	return err
}

func reg(args ...string) error {
	out, err := hidden("reg.exe", args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%v: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func waitServer() bool {
	// Проверка своего сервера на этом компьютере: сертификат может быть ещё не доверенным.
	c := &http.Client{Timeout: 3 * time.Second, Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}}
	for i := 0; i < 30; i++ {
		if r, err := c.Get(serverURL); err == nil {
			r.Body.Close()
			if r.StatusCode == 200 {
				return true
			}
		}
		time.Sleep(time.Second)
	}
	return false
}

func install() {
	d := paths()
	_, err := os.Stat(filepath.Join(d.install, "app", "server.mjs"))
	upgrade := err == nil
	q := fmt.Sprintf("Установить «%s» %s?\n\nПрограмма будет установлена в\n%s\n\nДанные (сканы, справочник нормативов) остаются в\n%s", appName, version, d.install, d.data)
	flags := uintptr(mbYesNo | mbIconQ)
	if upgrade {
		q = fmt.Sprintf("Обновить «%s» до версии %s?\n\nКниги Excel и данные не изменятся. Если Excel открыт — после обновления закройте его и откройте снова.", appName, version)
		// Поверх более новой версии — предупреждение; по умолчанию кнопка «Нет».
		if b, err := os.ReadFile(filepath.Join(d.install, "VERSION")); err == nil {
			have := strings.TrimSpace(string(b))
			switch c := compareVersions(version, have); {
			case c < 0:
				q = fmt.Sprintf("Внимание: установлена более новая версия «%s» — %s.\n\nЭтот установщик — старая версия %s. Если продолжить, программа вернётся к версии %s (книги и данные не изменятся).\n\nУстановить старую версию %s?", appName, have, version, version, version)
				flags = mbYesNo | mbIconWarn | mbDefBtn2
			case c == 0:
				q = fmt.Sprintf("Версия %s «%s» уже установлена.\n\nПереустановить её?", version, appName)
			}
		}
	}
	if msg(q, flags) != idYes {
		return
	}

	stopServer(d)
	for _, sub := range []string{"app", "addin", "node"} {
		if err := os.RemoveAll(filepath.Join(d.install, sub)); err != nil {
			fail("удалить прежнюю версию (возможно, сервер ещё работает — перезагрузите компьютер)", err)
		}
	}
	if err := os.MkdirAll(d.install, 0o755); err != nil {
		fail("создать папку программы", err)
	}
	if err := unzip(d.install); err != nil {
		fail("распаковать программу", err)
	}
	self, _ := os.Executable()
	if b, err := os.ReadFile(self); err == nil {
		_ = os.WriteFile(filepath.Join(d.install, "uninstall.exe"), b, 0o755)
	}

	// Сертификат сервера (https://localhost) — в доверенные корневые текущего пользователя.
	node, server := filepath.Join(d.install, "node", "node.exe"), filepath.Join(d.install, "app", "server.mjs")
	out, err := hidden(node, server, "--setup").Output()
	if err != nil {
		fail("подготовить сертификат сервера", err)
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	ca := strings.TrimSpace(lines[len(lines)-1])
	thumb, err := thumbprint(ca)
	if err != nil {
		fail("прочитать сертификат сервера", err)
	}
	if !certTrusted(thumb) {
		msg("Сейчас Windows спросит, установить ли сертификат «Konstruktor ID Local CA».\n\nНажмите «Да» — без него панель в Excel не откроется. Сертификат действует только для адресов этого компьютера (localhost).", mbOK|mbIconInfo)
		_ = interactive("certutil.exe", "-user", "-addstore", "Root", ca).Run()
		if !certTrusted(thumb) {
			msg("Сертификат не установлен — панель в Excel не откроется.\n\nЗапустите установщик ещё раз и в окне Windows нажмите «Да».", mbOK|mbIconWarn)
		}
	}

	// Надстройка Excel: регистрация манифеста (кнопка «Конструктор ИД» появится сама).
	manifest := filepath.Join(d.install, "addin", "manifest.xml")
	if err := reg("add", regAddins, "/v", manifest, "/t", "REG_SZ", "/d", manifest, "/f"); err != nil {
		fail("подключить надстройку к Excel", err)
	}

	// Автозапуск сервера, ярлыки в меню «Пуск», запись в «Установке и удалении программ».
	wscript := filepath.Join(os.Getenv("WINDIR"), "System32", "wscript.exe")
	start := filepath.Join(d.install, "start-server.vbs")
	// Автозагрузка: ярлык в папке «Автозагрузка»; не вышло (папка перенесена, PowerShell или COM запрещены политикой,
	// антивирус) — запись в HKCU\...\Run; не вышло и это — предупреждение, установка продолжается.
	_ = os.Remove(filepath.Join(d.startup, appName+".lnk"))
	_ = reg("delete", regRun, "/v", appName, "/f")
	autostartWarn := ""
	if err := shortcut(filepath.Join(d.startup, appName+".lnk"), wscript, `"`+start+`"`, d.install, "Запуск сервера Конструктора ИД"); err != nil {
		if err2 := reg("add", regRun, "/v", appName, "/t", "REG_SZ", "/d", `"`+wscript+`" "`+start+`"`, "/f"); err2 != nil {
			autostartWarn = fmt.Sprintf("\n\nНе удалось добавить сервер в автозагрузку (%v; %v). После перезагрузки компьютера запускайте его вручную: «Пуск» → «%s» → «Перезапустить сервер».", err, err2, appName)
		}
	}
	_ = os.MkdirAll(d.menu, 0o755)
	_ = shortcut(filepath.Join(d.menu, "Перезапустить сервер.lnk"), wscript, `"`+filepath.Join(d.install, "restart-server.vbs")+`"`, d.install, "Перезапуск сервера Конструктора ИД")
	_ = shortcut(filepath.Join(d.menu, "Папка данных.lnk"), d.data, "", d.data, "Сканы, справочник, резервные копии, журнал сервера")
	_ = shortcut(filepath.Join(d.menu, "Удалить Конструктор ИД.lnk"), filepath.Join(d.install, "uninstall.exe"), "/uninstall", d.install, "Удаление программы")
	for k, v := range map[string]string{
		"DisplayName": appName, "DisplayVersion": version, "Publisher": appName, "InstallLocation": d.install,
		"UninstallString": `"` + filepath.Join(d.install, "uninstall.exe") + `" /uninstall`,
		"DisplayIcon":     filepath.Join(d.install, "uninstall.exe"),
	} {
		_ = reg("add", regUninst, "/v", k, "/t", "REG_SZ", "/d", v, "/f")
	}
	for _, k := range []string{"NoModify", "NoRepair"} {
		_ = reg("add", regUninst, "/v", k, "/t", "REG_DWORD", "/d", "1", "/f")
	}

	// Запуск сервера сейчас.
	_ = hidden(wscript, start).Start()
	if !waitServer() {
		msg(fmt.Sprintf("Программа установлена, но сервер не ответил за 30 секунд.\n\nПерезагрузите компьютер или выберите в меню «Пуск» → «%s» → «Перезапустить сервер». Журнал сервера: %s%s", appName, filepath.Join(d.data, "server.log"), autostartWarn), mbOK|mbIconWarn)
		return
	}
	msg(fmt.Sprintf("Готово! «%s» %s установлен.\n\n1. Закройте Excel, если он открыт, и откройте снова.\n2. На вкладке «Главная» нажмите кнопку «Конструктор ИД» — справа откроется панель.\n\nСервер запускается сам при входе в Windows.", appName, version)+autostartWarn, map[bool]uintptr{true: mbOK | mbIconInfo, false: mbOK | mbIconWarn}[autostartWarn == ""])
}

func uninstall() {
	d := paths()
	if msg(fmt.Sprintf("Удалить «%s»?\n\nКниги Excel и папка данных\n%s\nостанутся на месте.", appName, d.data), mbYesNo|mbIconQ) != idYes {
		return
	}
	stopServer(d)
	manifest := filepath.Join(d.install, "addin", "manifest.xml")
	_ = reg("delete", regAddins, "/v", manifest, "/f")
	_ = reg("delete", regUninst, "/f")
	_ = os.Remove(filepath.Join(d.startup, appName+".lnk"))
	_ = reg("delete", regRun, "/v", appName, "/f")
	_ = os.RemoveAll(d.menu)
	if thumb, err := thumbprint(filepath.Join(d.data, "tls", "ca.pem")); err == nil && certTrusted(thumb) {
		if msg("Удалить и сертификат «Konstruktor ID Local CA»? Windows попросит подтвердить.", mbYesNo|mbIconQ) == idYes {
			_ = interactive("certutil.exe", "-user", "-delstore", "Root", thumb).Run()
		}
	}
	// Сам uninstall.exe лежит в папке программы — папку удаляет cmd после выхода.
	_ = hidden("cmd.exe", "/c", "ping 127.0.0.1 -n 3 > nul & rmdir /s /q \""+d.install+"\"").Start()
	msg(fmt.Sprintf("«%s» удалён. Папка данных: %s", appName, d.data), mbOK|mbIconInfo)
}

func main() {
	for _, a := range os.Args[1:] {
		if strings.EqualFold(a, "/uninstall") || a == "--uninstall" {
			uninstall()
			return
		}
	}
	install()
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
