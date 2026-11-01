// Основная надпись листа схемы (форма 3 ГОСТ Р 21.101, 185×55). В листах ИД рамка — блок с надписями «Стадия», «Формат»,
// а значения граф — отдельные MTEXT поверх рамки. Ячейки отсчитываются от правого нижнего угла внутренней рамки:
// найденный в ячейке текст заменяется (форматирование — шрифт, цвет, выравнивание — сохраняется), пустая ячейка заполняется.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;

namespace Idk.Acad
{
    public static class Stamp
    {
        /// <summary>Рамка листа в текущем пространстве: вставка блока, внутри которого есть надпись «Стадия» или «Формат».</summary>
        static BlockReference FindFrame(Transaction tr, BlockTableRecord space)
        {
            BlockReference best = null; double bestArea = 0;
            foreach (ObjectId id in space)
            {
                var br = tr.GetObject(id, OpenMode.ForRead) as BlockReference;
                if (br == null || !IsFrameBlock(tr, br)) continue;
                Extents3d e;
                try { e = br.GeometricExtents; } catch { continue; }
                var area = (e.MaxPoint.X - e.MinPoint.X) * (e.MaxPoint.Y - e.MinPoint.Y);
                if (area > bestArea) { best = br; bestArea = area; }
            }
            return best;
        }

        static bool IsFrameBlock(Transaction tr, BlockReference br)
        {
            var btr = (BlockTableRecord)tr.GetObject(br.BlockTableRecord, OpenMode.ForRead);
            foreach (ObjectId id in btr)
            {
                var o = tr.GetObject(id, OpenMode.ForRead);
                var t = o is DBText dt ? dt.TextString : o is MText mt ? MTextBody.Plain(mt.Contents) : null;
                if (t != null && (t.Trim() == "Стадия" || t.Trim().StartsWith("Формат"))) return true;
            }
            return false;
        }

        /// <summary>Масштаб рамки в текущем пространстве (1 — лист в мм); null — рамки нет.</summary>
        public static double? FindScale(Database db)
        {
            using (var tr = db.TransactionManager.StartOpenCloseTransaction())
            {
                var space = (BlockTableRecord)tr.GetObject(db.CurrentSpaceId, OpenMode.ForRead);
                var f = FindFrame(tr, space);
                return f == null ? (double?)null : Math.Abs(f.ScaleFactors.X);
            }
        }

        public static string Fill(Document doc, SheetJob job)
        {
            var db = doc.Database;
            using (var tr = db.TransactionManager.StartTransaction())
            {
                var space = (BlockTableRecord)tr.GetObject(db.CurrentSpaceId, OpenMode.ForWrite);
                var frame = FindFrame(tr, space);
                if (frame == null) return "Конструктор ИД: на этом листе не найдена рамка (блок с надписью «Стадия»). Перейдите на лист с рамкой.";
                var s = Math.Abs(frame.ScaleFactors.X);
                var e = frame.GeometricExtents;
                // Левый нижний угол формы 3: внутренняя рамка — 5 мм от края листа справа и снизу.
                var origin = new Point3d(e.MaxPoint.X - (StampLayout.FrameRight + StampLayout.Width) * s, e.MinPoint.Y + StampLayout.FrameBottom * s, 0);
                var texts = new List<Entity>();
                foreach (ObjectId id in space)
                {
                    var o = tr.GetObject(id, OpenMode.ForRead) as Entity;
                    if (o is MText || o is DBText) texts.Add(o);
                }
                var style = StyleId(tr, db);
                int replaced = 0, created = 0;
                var values = StampLayout.Values(job);
                foreach (var c in StampLayout.Cells)
                {
                    var v = values[c.Key];
                    if (string.IsNullOrEmpty(v)) continue;
                    var found = texts.FirstOrDefault(t => Inside(Anchor(t), origin, s, c));
                    if (found != null) { SetText(found, v); replaced++; }
                    else { Add(tr, space, origin, s, c, v, style); created++; }
                }
                foreach (var signer in job.Signers ?? new List<Signer>())
                {
                    if (!StampLayout.SignerRowY.ContainsKey(signer.Role) || string.IsNullOrWhiteSpace(signer.Name)) continue;
                    var y0 = StampLayout.SignerRowY[signer.Role];
                    var row = new StampCell("sign", 0, y0, 55, y0 + 5, 2.0);
                    var found = texts.FirstOrDefault(t => MTextBody.Plain(TextOf(t)).StartsWith(signer.Role) && Inside(Anchor(t), origin, s, new StampCell("left", 0, 0, 65, 55, 0)))
                        ?? texts.FirstOrDefault(t => Inside(Anchor(t), origin, s, row));
                    var line = StampLayout.SignerLine(signer);
                    if (found != null) { SetText(found, line); replaced++; }
                    else { AddLeft(tr, space, origin, s, row, line, style); created++; }
                }
                tr.Commit();
                return "Конструктор ИД: штамп схемы " + job.Number + " заполнен (заменено граф: " + replaced + ", добавлено: " + created + ").";
            }
        }

        static string TextOf(Entity t) => t is MText m ? m.Contents : ((DBText)t).TextString;

        static Point3d Anchor(Entity t)
        {
            if (t is MText m) return m.Location;
            var d = (DBText)t;
            return d.HorizontalMode == TextHorizontalMode.TextLeft && d.VerticalMode == TextVerticalMode.TextBase ? d.Position : d.AlignmentPoint;
        }

        static bool Inside(Point3d p, Point3d o, double s, StampCell c) =>
            p.X >= o.X + c.X0 * s && p.X <= o.X + c.X1 * s && p.Y >= o.Y + c.Y0 * s && p.Y <= o.Y + c.Y1 * s;

        static void SetText(Entity t, string v)
        {
            t.UpgradeOpen();
            if (t is MText m) m.Contents = MTextBody.Replace(m.Contents, v);
            else ((DBText)t).TextString = v;
        }

        static void Add(Transaction tr, BlockTableRecord space, Point3d o, double s, StampCell c, string v, ObjectId style)
        {
            var m = new MText
            {
                Location = new Point3d(o.X + c.Cx * s, o.Y + c.Cy * s, 0),
                Attachment = AttachmentPoint.MiddleCenter,
                TextHeight = c.Height * s,
                Width = (c.W - 2) * s,
                Contents = MTextBody.Escape(v),
            };
            if (!style.IsNull) m.TextStyleId = style;
            space.AppendEntity(m);
            tr.AddNewlyCreatedDBObject(m, true);
        }

        static void AddLeft(Transaction tr, BlockTableRecord space, Point3d o, double s, StampCell c, string v, ObjectId style)
        {
            var m = new MText
            {
                Location = new Point3d(o.X + (c.X0 + 0.5) * s, o.Y + c.Cy * s, 0),
                Attachment = AttachmentPoint.MiddleLeft,
                TextHeight = c.Height * s,
                Width = (c.W - 1) * s,
                Contents = MTextBody.Escape(v),
            };
            if (!style.IsNull) m.TextStyleId = style;
            space.AppendEntity(m);
            tr.AddNewlyCreatedDBObject(m, true);
        }

        static ObjectId StyleId(Transaction tr, Database db)
        {
            var ts = (TextStyleTable)tr.GetObject(db.TextStyleTableId, OpenMode.ForRead);
            foreach (var name in new[] { "ISOCPEUR", "GOST", "ГОСТ", "GOST 2.304", "ГОСТ 2.304" })
                if (ts.Has(name)) return ts[name];
            return ObjectId.Null;
        }
    }
}
