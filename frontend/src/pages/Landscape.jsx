import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Box, Maximize, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { api } from "../api/client";
import PaperDetailModal from "../components/PaperDetailModal";
import { Badge, EmptyState, ErrorBar, ErrorBoundary, Spinner, formatCitations } from "../components/ui";
import { useProject } from "../context/ProjectContext";
import { useApi } from "../hooks/useApi";
import { useI18n } from "../i18n";
import { NODE_COLORS } from "../viz/graphMeta";
import { buildLandscapeGraph, topicNodeId } from "../viz/landscapeData";

const Graph3D = lazy(() => import("../viz/Graph3D"));

export default function Landscape() {
  const { project } = useProject();
  const { t, lang } = useI18n();
  const zh = lang === "zh";
  const navigate = useNavigate();
  const graphRef = useRef(null);
  const [paperId, setPaperId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [labels, setLabels] = useState(true);
  const [limit, setLimit] = useState(120);
  const { data, loading, error, reload } = useApi(
    async () => {
      if (!project) return null;
      const [topics, graph] = await Promise.all([
        api.get(`/projects/${project.id}/topics`),
        api.get(`/projects/${project.id}/graph?papers_limit=${limit}`),
      ]);
      return { topics, graph, projectId: project.id };
    }, [project?.id, project?.status, limit]
  );
  const summaries = data?.projectId === project?.id ? data?.topics || [] : [];
  const visible = useMemo(() => summaries.filter((topic) =>
    (kind === "all" || topic.kind === kind) && topic.name.toLowerCase().includes(search.trim().toLowerCase())
  ), [summaries, kind, search]);
  const graph = useMemo(() => buildLandscapeGraph(visible, data?.graph), [visible, data?.graph]);
  const active = visible.find((topic) => topicNodeId(topic) === selected);
  const selectedId = active ? selected : null;
  const paperCount = graph.nodes.filter((node) => node.data.type === "paper").length;

  function selectTopic(topic) {
    const id = topicNodeId(topic);
    setSelected(id);
    graphRef.current?.focus(id);
  }

  if (!project) return <EmptyState title={t("common.noProjectSelected")} hint={t("common.selectHint")} />;
  if (loading) return <Spinner text={t("ls.loading")} />;
  if (error) return <ErrorBar message={error} onRetry={reload} />;
  if (!summaries.length) return <EmptyState title={t("ls.noDirections")} hint={t("common.collectFirst")} />;

  return (
    <div className="landscape-page">
      <div className="landscape-heading">
        <div>
          <div className="eyebrow">RESEARCH ATLAS</div>
          <h1>{zh ? "领域版图" : "Research landscape"}<span className="view-tag">3D</span></h1>
          <p>{zh ? "从研究方向出发，探索知识之间的联系。" : "Explore the connections between research directions and papers."}</p>
        </div>
        <div className="atlas-stats">
          <div><strong>{visible.length}</strong><span>{zh ? "研究方向" : "Directions"}</span></div>
          <div><strong>{paperCount}</strong><span>{zh ? "关联论文" : "Linked papers"}</span></div>
          <div><strong>{graph.edges.length}</strong><span>{zh ? "知识连接" : "Connections"}</span></div>
        </div>
      </div>

      <div className="atlas-toolbar">
        <label className="atlas-search"><Search size={16} /><input aria-label={zh ? "搜索研究方向" : "Search directions"} placeholder={zh ? "搜索研究方向…" : "Search directions…"} value={search} onChange={(e) => setSearch(e.target.value)} />{search && <button aria-label={zh ? "清除搜索" : "Clear search"} onClick={() => setSearch("")}><X size={14} /></button>}</label>
        <div className="atlas-filters">
          {[["all", zh ? "全部方向" : "All"], ["derived", zh ? "研究主题" : "Topics"], ["concept", zh ? "技术概念" : "Concepts"]].map(([value, label]) => <button key={value} aria-pressed={kind === value} className={kind === value ? "active" : ""} onClick={() => setKind(value)}>{label}</button>)}
        </div>
        <label className="atlas-label-toggle"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />{zh ? "显示标签" : "Labels"}</label>
      </div>

      <div className="atlas-workspace">
        <section className="atlas-canvas" aria-label={zh ? "三维领域版图" : "3D research atlas"}>
          {visible.length ? <ErrorBoundary key={project.id}><Suspense fallback={<Spinner />}><Graph3D ref={graphRef} data={graph} selectedId={selectedId} showLabels={labels} onSelect={(node) => {
            if (node?.type === "paper") setPaperId(Number(node.id.split(":")[1]));
            else setSelected(node?.id || null);
          }} /></Suspense></ErrorBoundary> : <EmptyState icon={Search} title={zh ? "没有匹配的研究方向" : "No matching directions"} hint={zh ? "试试其他关键词，或切换到全部方向。" : "Try another keyword or select all directions."} />}
          <div className="atlas-view-label"><Box size={14} />{zh ? "空间视图" : "Spatial view"}</div>
          <div className="atlas-controls">
            {[[Maximize, t("kg.fit"), () => graphRef.current?.fit()], [ZoomIn, t("kg.zoomIn"), () => graphRef.current?.zoomIn()], [ZoomOut, t("kg.zoomOut"), () => graphRef.current?.zoomOut()]].map(([Icon, title, action]) => <button key={title} title={title} aria-label={title} onClick={action}><Icon size={16} /></button>)}
          </div>
          <div className="atlas-legend">{[["topic", zh ? "研究主题" : "Topic"], ["technology", zh ? "技术概念" : "Concept"], ["paper", zh ? "论文" : "Paper"]].map(([type, label]) => <span key={type}><i style={{ backgroundColor: NODE_COLORS[type] }} />{label}</span>)}</div>
          <div className="atlas-hint">{zh ? "拖动旋转 · 滚轮缩放 · 点击探索" : "Drag to rotate · Scroll to zoom · Click to explore"}</div>
        </section>
        <aside className="atlas-sidebar">
          {active ? <>
            <div className="atlas-sidebar-header"><span>{zh ? "方向详情" : "Direction details"}</span><button aria-label={zh ? "返回方向列表" : "Back to directions"} onClick={() => setSelected(null)}><X size={16} /></button></div>
            <div className="atlas-detail">
              <Badge>{active.kind === "concept" ? (zh ? "技术概念" : "Concept") : (zh ? "研究主题" : "Topic")}</Badge>
              <h2>{active.name}</h2>
              {active.description && <p>{active.description}</p>}
              <div className="atlas-detail-stats"><div><strong>{active.paper_count}</strong><span>{zh ? "论文" : "Papers"}</span></div><div><strong>{formatCitations(active.total_citations)}</strong><span>{zh ? "总引用" : "Citations"}</span></div></div>
              <h3>{zh ? "代表作者" : "Leading authors"}</h3><p>{active.top_authors?.join(" · ") || "—"}</p>
              <h3>{zh ? "代表论文" : "Key papers"}</h3>
              {(active.top_papers || []).map((paper) => <button className="atlas-paper" key={paper.id} onClick={() => setPaperId(paper.id)}>{paper.title}<ArrowUpRight size={14} /></button>)}
              <button className="atlas-primary" onClick={() => navigate(`/explorer?topic=${encodeURIComponent(active.name)}`)}>{zh ? "查看该方向全部论文" : "View all papers"}<ArrowUpRight size={15} /></button>
            </div>
          </> : <>
            <div className="atlas-sidebar-header"><span>{zh ? "研究方向" : "Research directions"}</span><span className="text-faint">{visible.length}</span></div>
            <div className="atlas-direction-list">{visible.map((topic, index) => <button className="atlas-direction" key={topic.id} onClick={() => selectTopic(topic)}>
              <span className="atlas-index">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1"><strong>{topic.name}</strong><small>{topic.paper_count} {zh ? "篇论文" : "papers"} · {formatCitations(topic.total_citations)} {zh ? "次引用" : "citations"}</small></span><ArrowUpRight size={14} />
            </button>)}</div>
            <p className="atlas-sidebar-note">{zh ? "点击方向，查看代表论文与关联知识。" : "Select a direction to explore its papers and connections."}</p>
          </>}
        </aside>
      </div>
      <div className="atlas-footnote"><span>{zh ? "连线表示论文与方向的归属关系；空间距离仅用于布局，不代表相似度。" : "Links show paper membership. Spatial distance does not measure similarity."}</span><label>{zh ? "高被引论文样本" : "Top-cited paper sample"}<select aria-label={zh ? "论文样本数量" : "Paper sample size"} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>{[60,120,200,300].map((n) => <option key={n} value={n}>{n}</option>)}</select></label></div>
      {paperId && <PaperDetailModal projectId={project.id} paperId={paperId} onClose={() => setPaperId(null)} onOpenPaper={setPaperId} />}
    </div>
  );
}
