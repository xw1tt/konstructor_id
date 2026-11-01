// Запуск: dotnet run --project packages/acad/test. Строки MTEXT — из листа ИД «Схема кабель в ИТП -1 эт.dwg».
using System;
using System.Linq;
using Idk.Acad;

int fails = 0;
void Eq<T>(T a, T b, string what) { if (!Equals(a, b)) { fails++; Console.WriteLine($"FAIL {what}: «{a}» != «{b}»"); } else Console.WriteLine($"ok   {what}"); }

// Правка MTEXT с сохранением форматирования.
Eq(MTextBody.Replace(@"\pxqc;{\fISOCPEUR|b0|i0|c204|p34;\C7;АТ-4182-03-РД3.9.15-СУДИО}", "АТ-1"), @"\pxqc;{\fISOCPEUR|b0|i0|c204|p34;\C7;АТ-1}", "шифр: шрифт и цвет сохранены");
Eq(MTextBody.Replace(@"\pxqc;{\C7;Исполнительная схема №2. Монтаж кабеля до шкафа ШУ-ИТП на отм. -4.500 в осях В-Д/2-4}", "Исполнительная схема №1. {x}"),
   @"\pxqc;{\C7;Исполнительная схема №1. \{x\}}", "наименование: скобки экранированы");
Eq(MTextBody.Replace(@"{\W1;\C7;ООО «ТехноИнжиниринг»}", "ООО «ТИ»"), @"{\W1;\C7;ООО «ТИ»}", "организация");
Eq(MTextBody.Replace(@"\pxql;Разработал      Рябов Е.А.", "Разработал      Иванов И.И."), @"\pxql;Разработал      Иванов И.И.", "подпись");
Eq(MTextBody.Replace(@"{\fISOCPEUR|b0|i0|c204|p34;ИД}", "ИД"), @"{\fISOCPEUR|b0|i0|c204|p34;ИД}", "стадия");
Eq(MTextBody.Replace("простой текст", "новый"), "новый", "без кодов");
Eq(MTextBody.Plain(@"\pxql;Разработал      Рябов Е.А."), "Разработал Рябов Е.А.", "видимый текст");
Eq(MTextBody.Plain(@"{\fISOCPEUR|b0|i0|c204|p34;Система управления и диспетчеризации \Pинженерного оборудования}"), "Система управления и диспетчеризации инженерного оборудования", "видимый текст с \\P");

// Графы штампа: положения MTEXT листа ИД (относительно левого нижнего угла формы 3 — 230;5 на листе A3) попадают в свои графы.
var at = new (string key, double x, double y)[] {
  ("code", 355 - 230, 54.93 - 5), ("object", 355 - 230, 42.57 - 5), ("section", 330 - 230, 27.5 - 5), ("stage", 372.5 - 230, 25 - 5),
  ("title", 330 - 230, 12.5 - 5), ("org", 390.03 - 230, 12.57 - 5) };
foreach (var (key, x, y) in at)
{
  var hit = StampLayout.Cells.Where(c => x >= c.X0 && x <= c.X1 && y >= c.Y0 && y <= c.Y1).Select(c => c.Key).ToArray();
  Eq(string.Join(",", hit), key, $"графа {key}");
}
Eq(StampLayout.Cells.Sum(c => 0) + StampLayout.Width, 185.0, "ширина формы 3");
Eq(VedomostLayout.Widths.Sum(), 185.0, "ширина ведомости = ширине штампа");
Eq(StampLayout.SignerLine(new Signer { Role = "Разработал", Name = "Рябов Е.А." }), "Разработал      Рябов Е.А.", "строка подписи");

// Задание с сервера (тот же JSON, что отдаёт GET /api/acad/sheet).
var job = SheetJob.Parse(@"{""act"":""15"",""number"":""1"",""title"":""Исполнительная схема №1. Монтаж"",""code"":""АТ-4182"",""object"":""Аэропорт"",""section"":""СУДИО"",""org"":""ООО «ТИ»"",""stage"":""ИД"",""date"":""10.26"",""signers"":[{""role"":""Разработал"",""name"":""Рябов Е.А.""}],""rows"":[{""n"":1,""name"":""Лоток перфорированный 100х50х3000"",""mark"":""Код: 35262"",""supplier"":""ДКС"",""unit"":""м"",""quantity"":20.5,""note"":""""}],""sentAt"":""2026-11-01T12:00:00Z""}");
Eq(job.Rows.Count, 1, "строки ведомости");
Eq(string.Join("|", VedomostLayout.Cells(job.Rows[0])), "1|Лоток перфорированный 100х50х3000|Код: 35262|ДКС|м|20,5|", "ячейки строки");
Eq(StampLayout.Values(job)["title"], "Исполнительная схема №1. Монтаж", "наименование листа");

Console.WriteLine(fails == 0 ? "ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ" : $"ОШИБОК: {fails}");
return fails == 0 ? 0 : 1;
