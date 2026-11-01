// Раскладка ведомости и штампа, правка текста MTEXT — без зависимостей от AutoCAD (проверяется тестами вне AutoCAD).
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Idk.Acad
{
    public static class VedomostLayout
    {
        public static readonly string[] Headers = { "№ п/п", "Наименование", "Тип, марка, обозначение", "Поставщик", "Ед. изм.", "Кол-во", "Примечание" };
        /// <summary>Ширины столбцов, мм листа (сумма 185 — как основная надпись).</summary>
        public static readonly double[] Widths = { 10, 70, 35, 20, 12, 15, 23 };
        public const double TitleHeight = 8, HeaderHeight = 10, RowHeight = 6, TextHeight = 2.5;
        public const string Title = "Ведомость объемов работ";

        public static string Qty(double q) => q.ToString("0.###", CultureInfo.InvariantCulture).Replace('.', ',');

        public static string[] Cells(SheetRow r) =>
            new[] { r.N.ToString(CultureInfo.InvariantCulture), r.Name ?? "", r.Mark ?? "", r.Supplier ?? "", r.Unit ?? "", Qty(r.Quantity), r.Note ?? "" };
    }

    /// <summary>Графа штампа: прямоугольник в мм от левого нижнего угла формы 3 и высота шрифта.</summary>
    public class StampCell
    {
        public string Key; public double X0, Y0, X1, Y1, Height;
        public StampCell(string key, double x0, double y0, double x1, double y1, double h) { Key = key; X0 = x0; Y0 = y0; X1 = x1; Y1 = y1; Height = h; }
        public double Cx => (X0 + X1) / 2; public double Cy => (Y0 + Y1) / 2; public double W => X1 - X0;
    }

    public static class StampLayout
    {
        public const double Width = 185, Height = 55, FrameRight = 5, FrameBottom = 5;
        /// <summary>Графы, которые заполняет конструктор (по листам ИД СУДИО: шифр 2,5, остальное 2,0).</summary>
        public static readonly StampCell[] Cells =
        {
            new StampCell("code", 65, 45, 185, 55, 2.5),
            new StampCell("object", 65, 30, 185, 45, 2.0),
            new StampCell("section", 65, 15, 135, 30, 2.0),
            new StampCell("stage", 135, 15, 150, 25, 2.0),
            new StampCell("title", 65, 0, 135, 15, 2.0),
            new StampCell("org", 135, 0, 185, 15, 2.0),
        };
        /// <summary>Строки подписей (левая часть, строки по 5 мм): «Разработал» — 6-я снизу, «Проверил» — 4-я.</summary>
        public static readonly Dictionary<string, double> SignerRowY = new Dictionary<string, double> { { "Разработал", 25 }, { "Проверил", 15 } };

        /// <summary>Значения граф по заданию.</summary>
        public static Dictionary<string, string> Values(SheetJob j) => new Dictionary<string, string>
        {
            { "code", j.Code ?? "" }, { "object", j.ObjectName ?? "" }, { "section", j.Section ?? "" },
            { "stage", j.Stage ?? "ИД" }, { "title", j.Title ?? "" }, { "org", j.Org ?? "" },
        };

        /// <summary>Текст строки подписи: «Разработал      Рябов Е.А.» — как в листах ИД (роль и фамилия одним MTEXT).</summary>
        public static string SignerLine(Signer s) => string.IsNullOrWhiteSpace(s.Name) ? s.Role : s.Role + "      " + s.Name;
    }

    public static class MTextBody
    {
        // Ведущие коды форматирования MTEXT: \pxqc; { \fISOCPEUR|b0|i0|c204|p34; \C7; \W1; \H2.5; \Q15; \T1.1; \A1; \L \O
        static readonly Regex Lead = new Regex(@"^(?:\\p[^;]*;|\\[fFCcWHQTA][^;]*;|\\[LlOoKk]|\{)*", RegexOptions.Compiled);

        /// <summary>Замена видимого текста с сохранением ведущего форматирования; закрывающие скобки — по числу открытых.</summary>
        public static string Replace(string contents, string text)
        {
            var lead = Lead.Match(contents ?? "").Value;
            int open = lead.Count(ch => ch == '{');
            return lead + Escape(text) + new string('}', open);
        }

        /// <summary>Спецсимволы MTEXT: \ { } — экранируются; перевод строки — \P.</summary>
        public static string Escape(string s)
        {
            var b = new StringBuilder();
            foreach (var ch in s ?? "")
            {
                if (ch == '\\' || ch == '{' || ch == '}') b.Append('\\').Append(ch);
                else if (ch == '\n') b.Append("\\P");
                else if (ch != '\r') b.Append(ch);
            }
            return b.ToString();
        }

        /// <summary>Видимый текст MTEXT без кодов (для поиска «Разработал»).</summary>
        public static string Plain(string contents)
        {
            var s = Regex.Replace(contents ?? "", @"\\[A-Za-z][^;\\{}]*;|\\[LlOoKkP]|[{}]", " ");
            return Regex.Replace(s, @"\s+", " ").Trim();
        }
    }

}
