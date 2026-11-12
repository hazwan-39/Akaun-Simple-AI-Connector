import { CASH_FLOW_SKILL_ID } from "@akaun/shared";
import { useState } from "react";
import { AppProvider } from "./app-context";
import { AccessKeyPanel } from "./components/AccessKeyPanel";
import { Header } from "./components/Header";
import { CashFlowPage } from "./pages/CashFlowPage";
import { HomePage } from "./pages/HomePage";

type View = { name: "home" } | { name: "skill"; id: string } | { name: "settings"; back: View };

export function App() {
  const [view, setView] = useState<View>({ name: "home" });
  return (
    <AppProvider>
      <div className="app">
        <Header onSettings={() => setView(view.name === "settings" ? view.back : { name: "settings", back: view })} />
        <main>
          {view.name === "home" && <HomePage onOpenSkill={(id) => setView({ name: "skill", id })} />}
          {view.name === "skill" && view.id === CASH_FLOW_SKILL_ID && <CashFlowPage onBack={() => setView({ name: "home" })} />}
          {view.name === "settings" && <AccessKeyPanel onClose={() => setView(view.back)} />}
        </main>
      </div>
    </AppProvider>
  );
}
