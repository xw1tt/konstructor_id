//go:build windows

// Окно программы «Конструктор ИД» (0.36): своя иконка на панели задач, внутри — страница окна с сервера программы
// (WebView2, встроен в Windows 10/11). Сервер запускается, если ещё не запущен; второе окно не открывается —
// выводится вперёд уже открытое.
package main

import (
	"crypto/tls"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
	"golang.org/x/sys/windows"
)

const appTitle = "Конструктор ИД"

var (
	user32                 = windows.NewLazySystemDLL("user32.dll")
	procMessageBox         = user32.NewProc("MessageBoxW")
	procEnumWindows        = user32.NewProc("EnumWindows")
	procGetWindowText      = user32.NewProc("GetWindowTextW")
	procGetClassName       = user32.NewProc("GetClassNameW")
	procShowWindow         = user32.NewProc("ShowWindow")
	procIsIconic           = user32.NewProc("IsIconic")
	procSetForeground      = user32.NewProc("SetForegroundWindow")
	procKeybdEvent         = user32.NewProc("keybd_event")
	procLoadImage          = user32.NewProc("LoadImageW")
	procSendMessage        = user32.NewProc("SendMessageW")
	procGetSystemMetrics   = user32.NewProc("GetSystemMetrics")
	procSetDpiAwarenessCtx = user32.NewProc("SetProcessDpiAwarenessContext")
	procGetDpiForSystem    = user32.NewProc("GetDpiForSystem")
	kernel32               = windows.NewLazySystemDLL("kernel32.dll")
	procCreateMutex        = kernel32.NewProc("CreateMutexW")
	shell32                = windows.NewLazySystemDLL("shell32.dll")
	procSetAppUserModelID  = shell32.NewProc("SetCurrentProcessExplicitAppUserModelID")
)

func utf16(s string) *uint16 { p, _ := windows.UTF16PtrFromString(s); return p }

func msg(text string, flags uintptr) {
	_, _, _ = procMessageBox.Call(0, uintptr(unsafe.Pointer(utf16(text))), uintptr(unsafe.Pointer(utf16(appTitle))), flags)
}

// findOurWindow: окно класса webview, заголовок которого кончается на «Конструктор ИД».
func findOurWindow() uintptr {
	var found uintptr
	cb := syscall.NewCallback(func(hwnd, _ uintptr) uintptr {
		cls := make([]uint16, 64)
		_, _, _ = procGetClassName.Call(hwnd, uintptr(unsafe.Pointer(&cls[0])), 64)
		if windows.UTF16ToString(cls) != "webview" {
			return 1
		}
		buf := make([]uint16, 512)
		_, _, _ = procGetWindowText.Call(hwnd, uintptr(unsafe.Pointer(&buf[0])), 512)
		if strings.HasSuffix(windows.UTF16ToString(buf), appTitle) {
			found = hwnd
			return 0
		}
		return 1
	})
	_, _, _ = procEnumWindows.Call(cb, 0)
	return found
}

// bringToFront: Windows не даёт фоновому процессу (окно запускает сервер) выйти поверх Excel;
// нажатие Alt снимает этот запрет для SetForegroundWindow.
func bringToFront(hwnd uintptr) {
	if r, _, _ := procIsIconic.Call(hwnd); r != 0 {
		_, _, _ = procShowWindow.Call(hwnd, 9) // SW_RESTORE
	}
	_, _, _ = procKeybdEvent.Call(0x12, 0, 0, 0)      // Alt down
	_, _, _ = procKeybdEvent.Call(0x12, 0, 0x0002, 0) // Alt up
	_, _, _ = procSetForeground.Call(hwnd)
}

func serverUp() bool {
	c := &http.Client{Timeout: 2 * time.Second, Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}} // только localhost
	r, err := c.Get(healthURL)
	if err != nil {
		return false
	}
	r.Body.Close()
	return r.StatusCode == 200
}

// ensureServer: сервер не отвечает — запустить его скриптом установки и подождать до 40 с.
func ensureServer(dir string) bool {
	if serverUp() {
		return true
	}
	cmd := exec.Command("wscript.exe", filepath.Join(dir, "start-server.vbs"))
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = cmd.Start()
	for i := 0; i < 80; i++ {
		time.Sleep(500 * time.Millisecond)
		if serverUp() {
			return true
		}
	}
	return false
}

func setIcon(hwnd uintptr, ico string) {
	if _, err := os.Stat(ico); err != nil {
		return
	}
	for _, s := range []struct{ kind, size uintptr }{{1, 32}, {0, 16}} { // ICON_BIG, ICON_SMALL
		h, _, _ := procLoadImage.Call(0, uintptr(unsafe.Pointer(utf16(ico))), 1, s.size, s.size, 0x10) // IMAGE_ICON, LR_LOADFROMFILE
		if h != 0 {
			_, _, _ = procSendMessage.Call(hwnd, 0x80, s.kind, h) // WM_SETICON
		}
	}
}

func main() {
	exe, _ := os.Executable()
	dir := filepath.Dir(exe)
	screen := screenArg(os.Args[1:])

	// Одно окно: второй запуск выводит вперёд первое.
	_, _, err := procCreateMutex.Call(0, 0, uintptr(unsafe.Pointer(utf16("Local\\KonstruktorIDWindow"))))
	if err == windows.ERROR_ALREADY_EXISTS {
		for i := 0; i < 20; i++ {
			if h := findOurWindow(); h != 0 {
				bringToFront(h)
				return
			}
			time.Sleep(250 * time.Millisecond)
		}
		return
	}

	if !ensureServer(dir) {
		msg("Сервер программы не запустился.\n\nПерезагрузите компьютер или переустановите «Конструктор ИД». Журнал сервера: %LOCALAPPDATA%\\KonstruktorID\\server.log", 0x10)
		return
	}

	// Своя группа на панели задач (не вместе с другими окнами WebView2) и чёткий текст на мониторах с масштабом.
	_, _, _ = procSetAppUserModelID.Call(uintptr(unsafe.Pointer(utf16("KonstruktorID.Window"))))
	_, _, _ = procSetDpiAwarenessCtx.Call(^uintptr(3)) // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 (-4)
	scale := 1.0
	if dpi, _, _ := procGetDpiForSystem.Call(); dpi > 0 {
		scale = float64(dpi) / 96
	}
	sw, _, _ := procGetSystemMetrics.Call(0)
	sh, _, _ := procGetSystemMetrics.Call(1)
	width, height := windowSize(int(sw), int(sh), scale)

	data := filepath.Join(os.Getenv("LOCALAPPDATA"), "KonstruktorID", "webview")
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:         true, // меню правой кнопки (вставить, копировать) включается только вместе с этим
		DataPath:      data,
		AutoFocus:     true,
		WindowOptions: webview2.WindowOptions{Title: appTitle, Width: uint(width), Height: uint(height), Center: true},
	})
	if w == nil {
		msg("Для окна программы нужен компонент Windows «Microsoft Edge WebView2 Runtime».\n\nОн есть в Windows 10 и 11 с обновлениями; установить можно с сайта Microsoft (Microsoft Edge WebView2, «Evergreen Bootstrapper»). Панель в Excel работает и без него.", 0x30)
		return
	}
	defer w.Destroy()
	hwnd := uintptr(w.Window())
	setIcon(hwnd, filepath.Join(dir, "app.ico"))
	w.SetSize(int(900*scale), int(600*scale), webview2.HintMin)
	_ = w.Bind("idkSetTitle", func(t string) {
		if t = strings.TrimSpace(t); t == "" || len(t) > 300 {
			t = appTitle
		}
		w.SetTitle(t)
	})
	w.Navigate(pageURL(screen))
	bringToFront(hwnd)
	w.Run()
}
