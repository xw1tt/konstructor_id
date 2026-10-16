import { test } from "node:test";
import assert from "node:assert/strict";
import { NORM_SECTIONS, parseListPage, statusTone } from "@idk/shared/normCatalog";

const SP = `<html><body><p>Найдено: 758</p><table><tr><th>Обозначение</th><th>Наименование</th><th>Стр.</th><th>Статус</th></tr>
<tr><td><a href="/sp/details/582947c1-4171-4b75-b5d8-1a0bcb0f0968">СП 19.13330.2010</a></td><td>Генеральные планы сельскохозяйственных предприятий</td><td>0</td><td><i class="i"></i> Заменен</td></tr>
<tr><td><a href="/sp/details/bac9e1fe-45f1-401b-8e32-949f4ee27821">СП 20.13330.2016</a></td><td>Нагрузки и воздействия</td><td>148</td><td>✓ Действует</td></tr>
</table><a href="/sp?&search=&page=2">2</a><a href="/sp?&search=&page=38">38</a></body></html>`;
const FOUND = `<p>Стр. 1 из 2 • Всего: 34</p><table><tr><td>1</td><td><a href="/gost/details/a8608e17-1ca1-4945-98e2-7044d5bc11ac">ГОСТ 1.0-2015</a></td>
<td>Межгосударственная система стандартизации. Основные положения</td><td>13</td><td>✓ Действует</td></tr></table>
<div class="card"><a href="/gost/details/a8608e17-1ca1-4945-98e2-7044d5bc11ac">ГОСТ 1.0-2015</a> Действует 13</div>`;

test("список СП", () => {
  const p = parseListPage(SP);
  assert.equal(p.totalPages, 38);
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[1], { designation: "СП 20.13330.2016", title: "Нагрузки и воздействия", pages: 148, status: "Действует",
    url: "https://protect.gost.ru/sp/details/bac9e1fe-45f1-401b-8e32-949f4ee27821" });
  assert.equal(p.rows[0].status, "Заменен");
  assert.equal(p.rows[0].pages, 0);
});

test("основополагающие: № не страницы, блоки-повторы не дублируют", () => {
  const p = parseListPage(FOUND);
  assert.equal(p.totalPages, 2);
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].pages, 13);
  assert.equal(p.rows[0].title, "Межгосударственная система стандартизации. Основные положения");
  assert.equal(p.rows[0].url, "https://protect.gost.ru/gost/details/a8608e17-1ca1-4945-98e2-7044d5bc11ac");
});

test("сущности и пустая страница", () => {
  assert.equal(parseListPage(`<tr><td><a href="/tr/details/11111111-1111-1111-1111-111111111111">ТР ТС 004/2011</a></td><td>О безопасности &quot;низковольтного&quot;&nbsp;оборудования</td><td>20</td><td>Действует</td></tr>`).rows[0].title,
    'О безопасности "низковольтного" оборудования');
  assert.deepEqual(parseListPage("<html><body>Войдите</body></html>"), { rows: [], totalPages: null });
});

test("разделы и тон статуса", () => {
  assert.deepEqual(NORM_SECTIONS.map((s) => s.label), ["СП", "ГОСТ", "Правила", "Классиф.", "Техрегл.", "Основопол."]);
  assert.equal(NORM_SECTIONS[0].url, "https://protect.gost.ru/sp");
  assert.equal(statusTone("Заменён"), "replaced");
  assert.equal(statusTone("Действует"), "ok");
  assert.equal(statusTone("Отменен"), "other");
});

test("ревью: ссылки с параметрами, без ведущего «/», абсолютные и в /foundational/details", () => {
  const u = "a8608e17-1ca1-4945-98e2-7044d5bc11ac";
  const row = (href: string) => parseListPage(`<tr><td><a class="x" href="${href}">ГОСТ 1.0-2015</a></td><td>Основные положения</td><td>13</td><td>Действует</td></tr>`).rows;
  assert.equal(row(`https://protect.gost.ru/gost/details/${u}?lang=ru`)[0].url, `https://protect.gost.ru/gost/details/${u}?lang=ru`);
  assert.equal(row(`gost/details/${u}`)[0].url, `https://protect.gost.ru/gost/details/${u}`);
  assert.equal(row(`/foundational/details/${u}`)[0].url, `https://protect.gost.ru/foundational/details/${u}`);
  assert.equal(row(`/gost/details/${u}#top`).length, 1);
});
