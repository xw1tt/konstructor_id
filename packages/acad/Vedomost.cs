// Команда IDKVED: таблица «Ведомость объемов работ» в текущем пространстве по данным листа схемы из Конструктора ИД.
// Столбцы и размеры — как в ведомостях на листах ИД (А3, мм листа); масштаб — как у основной надписи, если она найдена.
using System;
using System.Globalization;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;

namespace Idk.Acad
{
    public class Commands
    {
        [CommandMethod("IDK", "IDKVED", "ИДВЕДОМОСТЬ", CommandFlags.Modal)]
        public void InsertVedomost()
        {
            var doc = Application.DocumentManager.MdiActiveDocument;
            var ed = doc.Editor;
            SheetJob job;
            try { job = Server.LoadSheet(); }
            catch (System.Exception e) { ed.WriteMessage("\nКонструктор ИД: " + e.Message); return; }
            if (job.Rows == null || job.Rows.Count == 0) { ed.WriteMessage("\nКонструктор ИД: в ведомости схемы нет строк."); return; }
            ed.WriteMessage("\nКонструктор ИД: схема " + job.Number + " (акт " + job.Act + "), строк ведомости: " + job.Rows.Count);

            var scale = Stamp.FindScale(doc.Database) ?? 1.0;
            var opt = new PromptPointOptions("\nЛевый верхний угол ведомости (масштаб " + VedomostLayout.Qty(scale) + "): ");
            var pick = ed.GetPoint(opt);
            if (pick.Status != PromptStatus.OK) return;

            using (doc.LockDocument())
            using (var tr = doc.Database.TransactionManager.StartTransaction())
            {
                var space = (BlockTableRecord)tr.GetObject(doc.Database.CurrentSpaceId, OpenMode.ForWrite);
                var t = Build(job, scale, doc.Database);
                t.Position = pick.Value.TransformBy(ed.CurrentUserCoordinateSystem);
                space.AppendEntity(t);
                tr.AddNewlyCreatedDBObject(t, true);
                t.GenerateLayout();
                tr.Commit();
            }
            ed.WriteMessage("\nВедомость вставлена. Проверьте, что в ней только объём, изображённый на этом листе.");
        }

        [CommandMethod("IDK", "IDKSTAMP", "ИДШТАМП", CommandFlags.Modal)]
        public void FillStamp()
        {
            var doc = Application.DocumentManager.MdiActiveDocument;
            var ed = doc.Editor;
            SheetJob job;
            try { job = Server.LoadSheet(); }
            catch (System.Exception e) { ed.WriteMessage("\nКонструктор ИД: " + e.Message); return; }
            using (doc.LockDocument())
            {
                var report = Stamp.Fill(doc, job);
                ed.WriteMessage("\n" + report);
            }
        }

        /// <summary>Таблица ведомости: строка-заголовок, шапка, строки материалов; размеры — мм листа × масштаб.</summary>
        public static Table Build(SheetJob job, double scale, Database db)
        {
            var L = typeof(VedomostLayout);
            int cols = VedomostLayout.Headers.Length, rows = 2 + job.Rows.Count;
            var t = new Table();
            t.TableStyle = db.Tablestyle;
            t.SetSize(rows, cols);
            for (int c = 0; c < cols; c++) t.Columns[c].Width = VedomostLayout.Widths[c] * scale;
            t.Rows[0].Height = VedomostLayout.TitleHeight * scale;
            t.Rows[1].Height = VedomostLayout.HeaderHeight * scale;
            for (int r = 2; r < rows; r++) t.Rows[r].Height = VedomostLayout.RowHeight * scale;

            var textStyle = TextStyleId(db);
            for (int r = 0; r < rows; r++)
                for (int c = 0; c < cols; c++)
                {
                    var cell = t.Cells[r, c];
                    cell.TextHeight = VedomostLayout.TextHeight * scale;
                    if (!textStyle.IsNull) cell.TextStyleId = textStyle;
                    cell.Alignment = (r >= 2 && (c == 1 || c == 2 || c == 6)) ? CellAlignment.MiddleLeft : CellAlignment.MiddleCenter;
                }
            t.MergeCells(CellRange.Create(t, 0, 0, 0, cols - 1));
            t.Cells[0, 0].TextString = VedomostLayout.Title;
            for (int c = 0; c < cols; c++) t.Cells[1, c].TextString = VedomostLayout.Headers[c];
            for (int i = 0; i < job.Rows.Count; i++)
            {
                var cells = VedomostLayout.Cells(job.Rows[i]);
                for (int c = 0; c < cols; c++) t.Cells[2 + i, c].TextString = cells[c];
            }
            return t;
        }

        /// <summary>Стиль текста ГОСТ, если есть в чертеже (как в штампе), иначе текущий.</summary>
        static ObjectId TextStyleId(Database db)
        {
            using (var tr = db.TransactionManager.StartOpenCloseTransaction())
            {
                var ts = (TextStyleTable)tr.GetObject(db.TextStyleTableId, OpenMode.ForRead);
                foreach (var name in new[] { "GOST", "ГОСТ", "GOST 2.304", "ГОСТ 2.304", "ISOCPEUR" })
                    if (ts.Has(name)) return ts[name];
                return db.Textstyle;
            }
        }
    }
}
