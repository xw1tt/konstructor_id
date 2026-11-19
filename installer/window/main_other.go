//go:build !windows

// Окно программы есть только для Windows (WebView2); на других системах — для сборки и тестов.
package main

import "fmt"

func main() {
	fmt.Println("Окно «Конструктор ИД» работает только в Windows")
}
