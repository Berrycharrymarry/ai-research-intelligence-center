import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Clock3,
  Compass,
  Cpu,
  FlaskConical,
  Map,
  Search,
  Target,
} from "lucide-react";
import { useI18n } from "../i18n";
import { useProject } from "../context/ProjectContext";
import { useApi } from "../hooks/useApi";
import { api } from "../api/client";
import CollectionProgress from "../components/CollectionProgress";
import PaperDetailModal from "../components/PaperDetailModal";
import { EmptyState, ErrorBar, StatusBadge, formatCitations } from "../components/ui";

const ENTRIES = [
  {
    to: "/hardware",
    icon: Cpu,
    title: "3D hardware lab",
    titleZh: "3D 硬件实验室",
    body: "Learn a desktop by taking it apart.",
    bodyZh: "拆开一台电脑，认识每个零件。",
  },
  {
    to: "/landscape",
    icon: Map,
    title: "Research landscape",
    titleZh: "研究领域版图",
    body: "See the directions around your work.",
    bodyZh: "看见你的研究所在的方向与联系。",
  },
  {
    to: "/timeline",
    icon: Clock3,
    title: "Ideas through time",
    titleZh: "思想时间线",
    body: "Trace the field from its beginnings.",
    bodyZh: "从起点回看领域如何走到今天。",
  },
  {
    to: "/gaps",
    icon: Target,
    title: "Open questions",
    titleZh: "未被回答的问题",
    body: "Find opportunities worth pursuing.",
    bodyZh: "发现值得继续追问的研究机会。",
  },
];

function displayCount(value) {
  return value == null ? "—" : formatCitations(value);
}

export default function Discovery() {
  const { project, loading: projectLoading, error: projectError, loadProjects } = useProject();
  const { lang } = useI18n();
  const zh = lang === "zh";
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [paperId, setPaperId] = useState(null);
  const { data, loading, error, reload } = useApi(
    () => project
      ? api.get(`/projects/${project.id}/overview`).then((result) => ({ ...result, projectId: project.id }))
      : Promise.resolve(null),
    [project?.id, project?.status, project?.paper_count]
  );

  const currentData = data?.projectId === project?.id ? data : null;
  const stats = currentData?.stats;
  const topics = currentData?.trending_topics || [];
  const latest = currentData?.latest_papers || [];
  const title = zh ? "把研究，" : "See your research";
  const titleSecond = zh ? "看得更清楚。" : "clearly.";

  function submitSearch(event) {
    event.preventDefault();
    navigate(`/explorer?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <div className="clear-home">
      <section className="clear-hero" aria-labelledby="discovery-title">
        <div className="clear-hero-copy">
          <div className="clear-eyebrow">
            <span>{zh ? "研究工作空间" : "RESEARCH WORKSPACE"}</span>
            {project && <StatusBadge status={project.status} />}
          </div>
          <div className="clear-project-line">
            <span className="clear-project-dot" aria-hidden="true" />
            <span>
              {project?.name || (projectLoading
                ? (zh ? "正在加载研究空间" : "Loading workspace")
                : (zh ? "尚未选择研究项目" : "No research project selected"))}
            </span>
          </div>
          <h1 id="discovery-title"><span>{title}</span><em>{titleSecond}</em></h1>
          <p className="clear-hero-description">
            {zh ? "检索论文，梳理方向，发现值得继续追问的问题。" : "Search papers, map directions, and find the questions worth pursuing."}
          </p>
          <form className="clear-search" onSubmit={submitSearch}>
            <Search size={18} aria-hidden="true" />
            <input
              aria-label={zh ? "搜索论文" : "Search papers"}
              placeholder={zh ? "输入问题、主题或论文标题" : "Search a question, topic, or paper title"}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit" aria-label={zh ? "开始搜索" : "Search"}><ArrowRight size={18} /></button>
          </form>
          <div className="clear-hero-actions">
            <Link className="clear-button clear-button-primary" to={project ? "/explorer" : "/setup"}>
              <BookOpen size={16} />
              {project ? (zh ? "浏览已收录论文" : "Browse collected papers") : (zh ? "创建研究项目" : "Create a research project")}
            </Link>
            <Link className="clear-button clear-button-secondary" to={project ? "/landscape" : "/setup"}>
              <Compass size={16} />
              {project ? (zh ? "探索研究方向" : "Explore directions") : (zh ? "开始第一项研究" : "Start your first research")}
            </Link>
            <Link className="clear-button clear-button-secondary" to="/hardware">
              <Cpu size={16} />
              {zh ? "进入硬件实验室" : "Open hardware lab"}
            </Link>
          </div>
          {projectError && <ErrorBar message={projectError} onRetry={loadProjects} />}
          {error && <ErrorBar message={error} onRetry={reload} />}
        </div>

        <aside className="clear-project-panel" aria-label={zh ? "当前研究项目" : "Active research project"}>
          <div className="clear-panel-heading">
            <span>{zh ? "当前项目" : "ACTIVE PROJECT"}</span>
            <FlaskConical size={17} aria-hidden="true" />
          </div>
          <h2>{project?.name || (projectLoading ? "…" : (zh ? "还没有研究项目" : "No project yet"))}</h2>
          <p>{project?.query || (zh ? "创建项目后，论文和研究方向会显示在这里。" : "Create a project to bring your papers and directions here.")}</p>
          <dl className="clear-project-stats">
            <div><dt>{zh ? "论文" : "PAPERS"}</dt><dd>{displayCount(project?.paper_count)}</dd></div>
            <div><dt>{zh ? "作者" : "AUTHORS"}</dt><dd>{displayCount(stats?.authors)}</dd></div>
            <div><dt>{zh ? "方向" : "DIRECTIONS"}</dt><dd>{displayCount(stats?.topics)}</dd></div>
            <div><dt>{zh ? "引用" : "CITATIONS"}</dt><dd>{displayCount(stats?.citations)}</dd></div>
          </dl>
          <Link className="clear-panel-link" to={project ? "/overview" : "/setup"}>
            {project ? (zh ? "查看项目总览" : "View project overview") : (zh ? "设置研究项目" : "Set up a research project")}<ArrowUpRight size={16} />
          </Link>
        </aside>
      </section>

      {project && <CollectionProgress />}

      <section className="clear-home-body" aria-labelledby="signals-title">
        <div className="clear-section-heading">
          <div>
            <span className="clear-eyebrow">{zh ? "研究线索" : "RESEARCH SIGNALS"}</span>
            <h2 id="signals-title">{zh ? "从已知出发，继续向前。" : "Start with what you know."}</h2>
          </div>
          <Link to={project ? "/overview" : "/setup"}>
            {project ? (zh ? "查看完整总览" : "View full overview") : (zh ? "创建项目" : "Create a project")}<ArrowUpRight size={16} />
          </Link>
        </div>

        {!project && !projectLoading ? (
          <EmptyState
            icon={FlaskConical}
            title={zh ? "先创建一个研究项目" : "Create your first research project"}
            hint={zh ? "你的论文、方向和研究机会会在这里汇总。" : "Your papers, directions, and opportunities will appear here."}
          />
        ) : (
          <>
            <div className="clear-signal-grid">
              <section className="clear-data-panel" aria-labelledby="directions-title">
                <div className="clear-data-panel-heading">
                  <div><span className="clear-panel-label">{zh ? "研究方向" : "DIRECTIONS"}</span><h3 id="directions-title">{zh ? "领域正在谈论什么" : "What the field is discussing"}</h3></div>
                  <span>{stats ? displayCount(stats.topics) : "—"}</span>
                </div>
                <div className="clear-topic-list">
                  {topics.slice(0, 5).map((topic, index) => (
                    <Link className="clear-topic-row" key={topic.name} to={`/explorer?topic=${encodeURIComponent(topic.name)}`}>
                      <span className="clear-row-index">{String(index + 1).padStart(2, "0")}</span>
                      <span className="clear-row-main"><strong>{topic.name}</strong><small>{topic.count} {zh ? "篇论文" : "papers"}{topic.growth ? ` · ${Math.round(topic.growth * 100)}% ${zh ? "增长" : "growth"}` : ""}</small></span>
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </Link>
                  ))}
                  {!topics.length && <div className="clear-empty-row">{loading ? (zh ? "正在加载研究方向…" : "Loading research directions…") : (zh ? "暂时没有可显示的研究方向。" : "No research directions are available yet.")}</div>}
                </div>
              </section>

              <section className="clear-data-panel" aria-labelledby="recent-title">
                <div className="clear-data-panel-heading">
                  <div><span className="clear-panel-label">{zh ? "最近论文" : "RECENT PAPERS"}</span><h3 id="recent-title">{zh ? "继续阅读已收录内容" : "Continue where you left off"}</h3></div>
                  <Link to="/explorer" aria-label={zh ? "查看全部论文" : "View all papers"}><ArrowUpRight size={17} /></Link>
                </div>
                <div className="clear-paper-list">
                  {latest.slice(0, 5).map((paper) => (
                    <button className="clear-paper-row" key={paper.id} onClick={() => setPaperId(paper.id)}>
                      <span className="clear-paper-year">{paper.publication_year || "—"}</span>
                      <span className="clear-row-main"><strong>{paper.title}</strong><small>{paper.authors?.slice(0, 2).map((author) => author.name).join(" · ") || (zh ? "作者信息暂无" : "Author information unavailable")} · {formatCitations(paper.cited_by_count)} {zh ? "次引用" : "citations"}</small></span>
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </button>
                  ))}
                  {!latest.length && <div className="clear-empty-row">{loading ? (zh ? "正在加载论文…" : "Loading papers…") : (zh ? "暂时没有可阅读的论文。" : "No readable papers are available yet.")}</div>}
                </div>
              </section>
            </div>

            <div className="clear-entry-grid">
              {ENTRIES.map(({ to, icon: Icon, title: titleEn, titleZh, body: bodyEn, bodyZh }) => (
                <Link className="clear-entry" to={to} key={to}>
                  <span className="clear-entry-icon"><Icon size={19} /></span>
                  <span className="clear-entry-copy"><strong>{zh ? titleZh : titleEn}</strong><small>{zh ? bodyZh : bodyEn}</small></span>
                  <ArrowUpRight size={17} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      {paperId && <PaperDetailModal projectId={project.id} paperId={paperId} onClose={() => setPaperId(null)} onOpenPaper={setPaperId} />}
    </div>
  );
}
