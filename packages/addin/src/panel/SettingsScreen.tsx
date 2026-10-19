// Экран «Настройки»: параметры, которые пользователь меняет сам. Хранятся в настройках книги.
import type { PrintOptions } from "@idk/shared/templates";

export function SettingsScreen({ options, onOptions }: { options: PrintOptions; onOptions(o: PrintOptions): void }) {
  const p4 = [
    { each: false, label: "Только перед первой схемой", note: "Как в образце СБД: «Исполнительная схема №1. …; №2. …»" },
    { each: true, label: "Перед каждой схемой", note: "«Исполнительная схема №1. …; Исполнительная схема №2. …»" },
  ];
  return (
    <main className="content settings">
      <h2 className="app-title">Настройки</h2>
      <p className="muted">Настройки сохраняются в книге объекта.</p>
      <fieldset className="setting">
        <legend>П.4 АОСР: «Исполнительная схема» перед номером схемы</legend>
        {p4.map((o) => (
          <label key={String(o.each)} className="setting-option">
            <input type="radio" name="schemeEach" checked={options.schemeEach === o.each}
              onChange={() => onOptions({ ...options, schemeEach: o.each })} />
            <span><b>{o.label}</b><br /><span className="muted">{o.note}</span></span>
          </label>
        ))}
      </fieldset>
    </main>
  );
}
