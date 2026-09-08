import { Suspense, useEffect, useRef, useState } from "react";
import { ErrorBoundary, Spinner } from "./ui";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ArrowUpRight, ArrowDownToLine, Menu, Plus, X, Orbit } from "lucide-react";
import { useProject } from "../context/ProjectContext";
import { useI18n } from "../i18n";
import ProjectSwitcher from "./ProjectSwitcher";
import CollectionProgress from "./CollectionProgress";

export default function Layout() {
  const { project, collect } = useProject();
  const { t, lang, setLang } = useI18n();
  const location = useLocation();
  const menu = useRef(null);
  const main = useRef(null);
  const [collectError, setCollectError] = useState(null);
  const [starting, setStarting] = useState(false);
  const zh = lang === "zh";
  const home = location.pathname === "/";
  const busy = ["collecting", "analyzing"].includes(project?.status);
  const links = [["/", zh ? "发现" : "Discover"], ["/overview", t("nav.dashboard")], ["/landscape", t("nav.landscape")], ["/graph", t("nav.graph")], ["/explorer", t("nav.explorer")], ["/timeline", t("nav.timeline")], ["/analysis", t("nav.analysis")], ["/gaps", t("nav.gaps")]];

  useEffect(() => { menu.current?.close(); main.current?.scrollTo(0, 0); }, [location.pathname]);
  useEffect(() => { setCollectError(null); }, [project?.id]);

  async function startCollection() {
    setStarting(true); setCollectError(null);
    try { await collect(project.id); } catch (error) { setCollectError(error.message); } finally { setStarting(false); }
  }

  return <div className={`experience-shell ${home ? "is-discovery" : "is-workspace"}`}>
    <a href="#main-content" className="skip-link">{zh ? "跳到内容" : "Skip to content"}</a>
    <header className="experience-header">
      <NavLink to="/" className="experience-brand" aria-label={zh ? "科研情报 · 发现首页" : "Research Intelligence · Discover"}><span className="brand-symbol"><Orbit size={24} strokeWidth={1.3} /></span><span>RESEARCH<span>INTELLIGENCE</span></span><i>科研情报</i></NavLink>
      <nav className="experience-nav" aria-label={zh ? "主导航" : "Main navigation"}>{[["/", zh ? "发现" : "Discover"], ["/landscape", zh ? "版图" : "Atlas"], ["/explorer", zh ? "文献" : "Papers"]].map(([to, label]) => <NavLink key={to} to={to} end={to === "/"}>{label}</NavLink>)}</nav>
      <div className="header-utilities"><button className="language-toggle" onClick={() => setLang(zh ? "en" : "zh")} aria-label={zh ? "Switch to English" : "切换中文"}>{zh ? "EN" : "中"}</button><button className="experience-menu-button" aria-label={zh ? "打开工作空间菜单" : "Open workspace menu"} aria-haspopup="dialog" onClick={() => menu.current?.showModal()}><span>{zh ? "工作空间" : "Workspace"}</span><Menu size={16} /></button></div>
    </header>
    {!home && <div className="workspace-bar"><span className="workspace-breadcrumb">{zh ? "研究空间" : "WORKSPACE"}<span>/</span><strong>{links.find(([to]) => to === location.pathname)?.[1] || t("layout.newProject")}</strong></span><div className="workspace-actions"><CollectionProgress compact /><ProjectSwitcher />{project && <button onClick={startCollection} disabled={busy || starting} className="collect-button"><ArrowDownToLine size={14} />{busy ? (zh ? "采集中" : "Collecting") : starting ? (zh ? "正在启动" : "Starting") : t("layout.collectData")}</button>}</div></div>}
    {collectError && <div role="alert" className="collect-error">{collectError}<button onClick={() => setCollectError(null)} aria-label={zh ? "关闭" : "Close"}><X size={14} /></button></div>}
    <main id="main-content" className="experience-main app-main" ref={main}><div key={location.pathname} className={`route-content ${home ? "route-discovery" : "route-workspace"}`}><ErrorBoundary><Suspense fallback={<Spinner />}><Outlet /></Suspense></ErrorBoundary></div></main>
    <dialog ref={menu} className="workspace-dialog" aria-label={zh ? "研究工作空间" : "Research workspace"} onClick={(event) => { if (event.target === menu.current) menu.current.close(); }}>
      <div className="workspace-dialog-inner"><div className="dialog-top"><span className="experience-kicker">YOUR NEXT DISCOVERY</span><button autoFocus onClick={() => menu.current.close()} aria-label={zh ? "关闭菜单" : "Close menu"}><X size={23} /></button></div><nav>{links.map(([to, label], i) => <NavLink to={to} key={to} end={to === "/"} onClick={() => menu.current.close()}><span>{String(i + 1).padStart(2, "0")}</span><strong>{label}</strong><ArrowUpRight size={24} /></NavLink>)}</nav><div className="dialog-bottom"><ProjectSwitcher /><NavLink to="/setup" onClick={() => menu.current.close()}><Plus size={16} />{t("layout.newProject")}</NavLink></div></div>
    </dialog>
  </div>;
}
