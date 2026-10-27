// Ошибка отрисовки панели: React без перехватчика оставляет белый экран. Здесь — текст ошибки, «Перезагрузить»
// и подсказка про «Сообщить о проблеме» (в настройках), чтобы причину было видно.
import { Component, type ReactNode } from "react";

export class PanelGuard extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("Панель:", error); }
  render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    return (
      <main className="content">
        <h2 className="app-title">Конструктор ИД</h2>
        <p className="error" role="alert">Сбой панели: {e.message}</p>
        <pre className="muted" style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>{(e.stack ?? "").split("\n").slice(0, 6).join("\n")}</pre>
        <p>Сделайте снимок этого текста и пришлите разработчику.</p>
        <div className="row-actions">
          <button className="btn btn-primary" onClick={() => location.reload()}>Перезагрузить панель</button>
          <button className="btn" onClick={() => this.setState({ error: null })}>Продолжить</button>
        </div>
      </main>
    );
  }
}
