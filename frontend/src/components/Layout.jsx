import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Brain,
  Crosshair,
  GitBranch,
  LayoutDashboard,
  Library,
  Plus,
  Radar,
} from "lucide-react";
import { useProject } from "../context/ProjectContext";
import { useI18n } from "../i18n";
import ProjectSwitcher from "./ProjectSwitcher";
import { StatusBadge } from "./ui";

export default function Layout() {
  const { project, collect } = useProject();
  const { t, lang, setLang } = useI18n();
  const location = useLocation();

  const NAV = [
    { to: "/", label: t("nav.dashboard"), icon: LayoutDashboard },
    { to: "/explorer", label: t("nav.explorer"), icon: Library },
    { to: "/timeline", label: t("nav.timeline"), icon: Activity },
    { to: "/graph", label: t("nav.graph"), icon: GitBranch },
    { to: "/landscape", label: t("nav.landscape"), icon: BarChart3 },
    { to: "/analysis", label: t("nav.analysis"), icon: Brain },
    { to: "/gaps", label: t("nav.gaps"), icon: Crosshair },
  ];

  const current = NAV.find((n) => n.to === location.pathname) || {};
  const busy = project && (project.status === "collecting" || project.status === "analyzing");

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-accent/40 bg-accent/10">
            <Radar size={17} className="text-accent" />
          </div>
          <div>
            <div className="text-[13px] font-semibold tracking-wide">{t("layout.brand")}</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-faint">{t("layout.tagline")}</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `mx-2 mb-0.5 flex items-center gap-2.5 rounded-md border px-3 py-2 text-[13px] ${
                  isActive
                    ? "border-line2 bg-panel2 text-accent"
                    : "border-transparent text-muted hover:bg-panel2 hover:text-ink"
                }`
              }
            >
              <n.icon size={15} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <NavLink
            to="/setup"
            className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-xs text-muted hover:border-accent/40 hover:text-accent"
          >
            <Plus size={13} /> {t("layout.newProject")}
          </NavLink>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-panel px-5">
          <div className="microlabel w-44">{current.label || t("nav.dashboard")}</div>
          <div className="flex-1" />
          <div className="flex items-center rounded-md border border-line p-0.5">
            <button
              onClick={() => setLang("zh")}
              title="中文"
              className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                lang === "zh" ? "bg-panel2 text-accent" : "text-faint hover:text-muted"
              }`}
            >
              中
            </button>
            <button
              onClick={() => setLang("en")}
              title="English"
              className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                lang === "en" ? "bg-panel2 text-accent" : "text-faint hover:text-muted"
              }`}
            >
              EN
            </button>
          </div>
          {project && <StatusBadge status={project.status} />}
          <ProjectSwitcher />
          {project && (
            <button
              disabled={busy}
              onClick={() => collect(project.id)}
              className="rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? t("layout.collecting") : t("layout.collectData")}
            </button>
          )}
        </header>
        <main className="grid-bg min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
