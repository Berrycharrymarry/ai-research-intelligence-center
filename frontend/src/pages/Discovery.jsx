import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play, Search } from "lucide-react";
import { useI18n } from "../i18n";
import { useProject } from "../context/ProjectContext";
import { useApi } from "../hooks/useApi";
import { api } from "../api/client";
import CollectionProgress from "../components/CollectionProgress";
import { ErrorBar, ErrorBoundary, formatCitations } from "../components/ui";

const DiscoveryScene = lazy(() => import("../viz/DiscoveryScene"));
const CHAPTERS = [
  { title: ["让好奇，", "抵达前沿。"], en: ["Follow curiosity.", "Find what's next."], tag: "01 / DISCOVER", to: "/landscape", cta: "探索领域版图", ctaEn: "Explore the landscape", body: "穿过论文、方向与观点，看见下一次突破的可能。", bodyEn: "Travel through papers, ideas and connections. See the possibilities ahead." },
  { title: ["让知识，", "彼此相连。"], en: ["Connect ideas.", "Expand your world."], tag: "02 / CONNECT", to: "/graph", cta: "进入知识图谱", ctaEn: "Enter the knowledge graph", body: "从一个节点出发，沿着真实的论文关系，拓展研究视野。", bodyEn: "Start with a single node. Follow real paper relationships into new directions." },
  { title: ["让未知，", "成为方向。"], en: ["Explore the gaps.", "Begin something new."], tag: "03 / IMAGINE", to: "/gaps", cta: "寻找研究机会", ctaEn: "Find research opportunities", body: "观察趋势的交汇处，为值得追问的问题，找到新的入口。", bodyEn: "Look where research paths converge. Find a new way into questions worth asking." },
];

export default function Discovery() {
  const { project, loading: projectLoading, error: projectError, loadProjects } = useProject();
  const { lang } = useI18n();
  const zh = lang === "zh";
  const navigate = useNavigate();
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(() => {
    try { return localStorage.getItem("research.motion") === "off" || matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; }
  });
  const gallery = useRef(null);
  const pointerStart = useRef(null);
  const { data, error, reload } = useApi(() => project ? api.get(`/projects/${project.id}/overview`).then((result) => ({ ...result, projectId: project.id })) : Promise.resolve(null), [project?.id, project?.status]);
  const currentData = data?.projectId === project?.id ? data : null;
  const stats = currentData?.stats;
  const topic = currentData?.trending_topics?.[active];
  const paper = currentData?.top_papers?.[active];
  const chapter = CHAPTERS[active];
  const cycle = (direction) => setActive((index) => (index + direction + CHAPTERS.length) % CHAPTERS.length);

  useEffect(() => {
    try { localStorage.setItem("research.motion", paused ? "off" : "on"); } catch { /* optional preference */ }
  }, [paused]);

  return <div className={`discovery-page ${paused ? "motion-paused" : ""}`}>
    <section className="discovery-hero" ref={gallery} aria-label={zh ? "研究发现空间" : "Research discovery space"}>
      <div className="discovery-ambient" aria-hidden="true" />
      <div className="discovery-art"><ErrorBoundary fallback={() => <div className="scene-fallback" />}><Suspense fallback={<div className="scene-fallback" />}><DiscoveryScene activeIndex={active} paused={paused} /></Suspense></ErrorBoundary></div>
      <div className="discovery-topline"><span>INDEPENDENT CURIOSITY. CONNECTED KNOWLEDGE.</span><span className="discovery-project"><i />{project?.name || (projectLoading ? (zh ? "加载研究空间" : "Loading workspace") : (zh ? "你的研究空间" : "Your research space"))}</span></div>
      <div className="discovery-copy" key={active}>
        <span className="experience-kicker">{chapter.tag}</span>
        <h1>{(zh ? chapter.title : chapter.en).map((line, i) => <span key={line} className={i ? "ink-gradient" : ""}>{line}</span>)}</h1>
        <p>{zh ? chapter.body : chapter.bodyEn}</p>
        <Link className="discovery-cta" to={project ? chapter.to : "/setup"}><span>{project ? (zh ? chapter.cta : chapter.ctaEn) : (zh ? "开启第一项研究" : "Start your first research")}</span><span className="cta-circle"><ArrowUpRight size={21} /></span></Link>
        <form className="discovery-search" onSubmit={(event) => { event.preventDefault(); navigate(`/explorer?q=${encodeURIComponent(query.trim())}`); }}><Search size={15} /><input aria-label={zh ? "搜索论文" : "Search papers"} placeholder={zh ? "从一个问题，或一篇论文开始" : "Start with a question or a paper"} value={query} onChange={(event) => setQuery(event.target.value)} /><button aria-label={zh ? "开始搜索" : "Search"}><ArrowRight size={16} /></button></form>
      </div>
      <div className="discovery-cards" onPointerDown={(event) => { pointerStart.current = { x: event.clientX, y: event.clientY }; }} onPointerUp={(event) => {
        const start = pointerStart.current; pointerStart.current = null;
        if (start && Math.abs(event.clientX - start.x) > 70 && Math.abs(event.clientY - start.y) < 50) cycle(event.clientX < start.x ? 1 : -1);
      }}>
        <Link to={topic ? `/explorer?topic=${encodeURIComponent(topic.name)}` : "/landscape"} className="floating-card card-direction" key={`topic-${active}`}>
          <span className="card-overline"><span className="status-spark" />{zh ? "研究信号" : "RESEARCH SIGNAL"}<ArrowUpRight size={13} /></span>
          <div className={`signal-art signal-art-${active}`} aria-hidden="true"><div /><div /><div /></div>
          <span className="floating-card-title">{topic?.name || (zh ? ["方向之间，新的联系", "知识边界，自由延伸", "下一次突破，从此开始"][active] : ["New connections", "Beyond the boundaries", "The next breakthrough"][active])}</span>
          <span className="floating-card-meta">{topic ? `${topic.count} ${zh ? "篇相关论文" : "related papers"}` : (zh ? "探索你的研究领域" : "Explore your research field")}<span>0{active + 1}</span></span>
        </Link>
        <Link to="/explorer" className="floating-card card-paper" key={`paper-${active}`}><span className="card-overline">{zh ? "文献视野" : "PAPER PERSPECTIVE"}<ArrowUpRight size={13} /></span><span className="paper-card-lines" aria-hidden="true"><i /><i /><i /></span><span className="floating-card-title">{paper?.title || (zh ? "每一个想法，都有迹可循。" : "Every idea has a beginning.")}</span><span className="floating-card-meta">{paper ? `${paper.publication_year || "—"} · ${formatCitations(paper.cited_by_count)} ${zh ? "次引用" : "citations"}` : (zh ? "从文献出发" : "Start with the literature")}</span></Link>
        <div className="orbit-coordinate" aria-hidden="true"><span>KNOWLEDGE IS IN MOTION</span><i />{String(active + 1).padStart(2, "0")} / 03</div>
      </div>
      <div className="discovery-bottomline"><button className="explore-down" aria-label={zh ? "向下，深入研究" : "Scroll to explore"} onClick={() => document.getElementById("research-overview")?.scrollIntoView({ behavior: paused ? "auto" : "smooth" })}><span>{zh ? "向下，深入研究" : "SCROLL TO EXPLORE"}</span><ArrowDown size={15} /></button><div className="chapter-controls"><button onClick={() => cycle(-1)} aria-label={zh ? "上一场景" : "Previous scene"}><ChevronLeft size={18} /></button><div>{CHAPTERS.map((item, i) => <button key={item.tag} aria-label={`${zh ? "场景" : "Scene"} ${i + 1}`} aria-pressed={active === i} onClick={() => setActive(i)}><span /></button>)}</div><button onClick={() => cycle(1)} aria-label={zh ? "下一场景" : "Next scene"}><ChevronRight size={18} /></button><span className="chapter-count">0{active + 1} <i>/ 03</i></span></div><button className="motion-toggle" onClick={() => setPaused((value) => !value)} aria-pressed={paused}>{paused ? <Play size={12} /> : <Pause size={12} />}{paused ? (zh ? "播放动效" : "PLAY MOTION") : (zh ? "暂停动效" : "PAUSE MOTION")}</button></div>
    </section>
    <section id="research-overview" className="discovery-overview">
      <CollectionProgress />
      {(projectError || error) && <ErrorBar message={projectError || error} onRetry={projectError ? loadProjects : reload} />}
      <div className="overview-intro"><div><span className="experience-kicker">YOUR RESEARCH, IN PERSPECTIVE</span><h2>{zh ? "在这里，把线索连成洞见。" : "Turn connections into perspective."}</h2></div><Link to="/overview">{zh ? "查看完整总览" : "View full overview"}<ArrowUpRight size={17} /></Link></div>
      <div className="discovery-stats">{[[project?.paper_count ?? stats?.papers, zh ? "篇研究论文" : "Research papers"], [stats?.authors, zh ? "位研究作者" : "Researchers"], [stats?.topics, zh ? "个研究方向" : "Research directions"], [stats?.citations, zh ? "次学术引用" : "Citations"]].map(([value, label]) => <div key={label}><strong>{value == null ? "—" : formatCitations(value)}</strong><span>{label}</span></div>)}</div>
      <div className="discovery-portals">{[["/landscape", "01", "map", zh ? "领域版图" : "Research atlas", zh ? "看见整个领域，也看见其中的你。" : "See the field. Find your place in it."], ["/timeline", "02", "time", zh ? "思想的时间线" : "Ideas through time", zh ? "回到起点，走向下一次突破。" : "Trace the beginnings. Follow the breakthroughs."], ["/gaps", "03", "gap", zh ? "未被回答的问题" : "Questions still open", zh ? "让好问题，成为你的新起点。" : "Let a good question become your starting point."]].map(([to, no, art, title, body]) => <Link to={to} key={to} className={`discovery-portal portal-${art}`}><span className="portal-number">{no} / EXPLORE</span><div className="portal-art" aria-hidden="true"><i /><i /><i /><i /></div><h3>{title}<ArrowUpRight size={20} /></h3><p>{body}</p></Link>)}</div>
      <footer className="experience-footer"><span>RESEARCH INTELLIGENCE</span><span>{zh ? "保持好奇。持续探索。" : "STAY CURIOUS. KEEP EXPLORING."}</span><span>OPENALEX + CROSSREF</span></footer>
    </section>
  </div>;
}
