import { useMemo, useRef, useState } from "react";
import { Crosshair, Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { api } from "../api/client";
import PaperDetailModal from "../components/PaperDetailModal";
import { Badge, EmptyState, ErrorBar, Spinner, formatCitations } from "../components/ui";
import { useProject } from "../context/ProjectContext";
import { useApi } from "../hooks/useApi";
import { useI18n } from "../i18n";
import Graph3D, { NODE_COLORS, nodeLabel } from "../viz/Graph3D";

const NODE_TYPES = ["paper", "author", "topic", "technology"];

const REL_KEYS = {
  cites: "kg.citesRel",
  related_to: "kg.relatedRel",
  authored_by: "kg.authoredRel",
  belongs_to: "kg.belongsRel",
  uses: "kg.usesRel",
};

export default function KnowledgeGraph() {
  const { project } = useProject();
  const { t } = useI18n();
  const graphRef = useRef(null);
  const [sel, setSel] = useState(null);
  const [paperId, setPaperId] = useState(null);
  const [visible, setVisible] = useState(() => new Set(NODE_TYPES));
  const [papersLimit, setPapersLimit] = useState(120);

  const { data, loading, error, reload } = useApi(
    () =>
      project
        ? api.get(`/projects/${project.id}/graph?papers_limit=${papersLimit}`)
        : Promise.resolve(null),
    [project ? project.id : null, papersLimit]
  );

  const visibleTypes = useMemo(() => new Set(visible), [visible]);

  const filtered = useMemo(() => {
    if (!data) return null;
    const nodes = data.nodes.filter((n) => visibleTypes.has(n.data.type));
    const ids = new Set(nodes.map((n) => n.data.id));
    const edges = data.edges.filter(
      (e) => ids.has(e.data.source) && ids.has(e.data.target)
    );
    return { nodes, edges };
  }, [data, visibleTypes]);

  const toggle = (nt) =>
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(nt)) next.delete(nt);
      else next.add(nt);
      return next;
    });

  const paperDetail = useApi(
    () => (sel && sel.type === "paper" ? api.get(`/projects/${project.id}/papers/${sel.id.split(":")[1]}`) : Promise.resolve(null)),
    [sel?.id]
  );
  const authorDetail = useApi(
    () => (sel && sel.type === "author" ? api.get(`/projects/${project.id}/authors/${sel.id.split(":")[1]}`) : Promise.resolve(null)),
    [sel?.id]
  );

  if (!project) return <EmptyState title={t("common.noProjectSelected")} hint={t("common.selectHint")} />;
  if (loading) return <Spinner text={t("kg.loading")} />;
  if (error) return <ErrorBar message={error} onRetry={reload} />;

  return (
    <div className="flex h-full min-h-0">
      <div className="relative min-w-0 flex-1">
        {filtered ? (
          <Graph3D
            ref={graphRef}
            data={filtered}
            onSelect={setSel}
            selectedId={sel?.id}
          />
        ) : (
          <Spinner />
        )}
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {[
            { label: t("kg.fit"), icon: Maximize, fn: () => graphRef.current?.fit() },
            { label: t("kg.zoomIn"), icon: ZoomIn, fn: () => graphRef.current?.zoomIn() },
            { label: t("kg.zoomOut"), icon: ZoomOut, fn: () => graphRef.current?.zoomOut() },
          ].map((c) => (
            <button
              key={c.label}
              onClick={c.fn}
              title={c.label}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-panel/95 text-muted hover:border-accent/50 hover:text-accent"
            >
              <c.icon size={14} />
            </button>
          ))}
        </div>
        <div className="absolute bottom-3 left-3 rounded-md border border-line bg-panel/95 p-3">
          <div className="microlabel mb-2">{t("kg.nodeTypes")}</div>
          <div className="flex flex-wrap gap-2">
            {NODE_TYPES.map((nt) => (
              <button
                key={nt}
                onClick={() => toggle(nt)}
                className="flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-[10px] uppercase tracking-wider text-muted hover:border-line2"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: visibleTypes.has(nt) ? NODE_COLORS[nt] : "#2c3650" }}
                />
                {t(`nodeType.${nt}`)}
              </button>
            ))}
          </div>
          <div className="microlabel mb-2 mt-3">{t("kg.relations")}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {Object.entries(REL_KEYS).map(([rel, key]) => (
              <span key={rel} className="font-mono text-[10px] text-faint">
                <span className="text-muted">{rel}</span> — {t(key)}
              </span>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-2">
            <span className="font-mono text-[10px] text-faint">{t("kg.papersLabel")}</span>
            <select
              value={papersLimit}
              onChange={(e) => setPapersLimit(Number(e.target.value))}
              className="rounded-sm border border-line bg-panel2 px-1.5 py-0.5 font-mono text-[10px] text-ink"
            >
              {[60, 120, 200, 300].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <aside className="w-80 shrink-0 overflow-y-auto border-l border-line bg-panel">
        {!sel && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Crosshair size={22} className="text-faint" />
            <div className="text-xs text-faint">
              {t("kg.clickNode")}
              <br />
              {t("kg.hint2")}
            </div>
          </div>
        )}
        {sel && (
          <div className="p-4">
            <div className="microlabel mb-1">{nodeLabel(t, sel.type) || sel.type}</div>
            <div className="text-sm font-semibold leading-snug text-ink">{sel.name || sel.label}</div>

            {sel.type === "paper" && paperDetail.data && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="cyan">{paperDetail.data.publication_year}</Badge>
                  <Badge tone="amber">
                    {t("kg.citations", { count: formatCitations(paperDetail.data.cited_by_count) })}
                  </Badge>
                </div>
                <div className="font-mono text-[11px] text-muted">
                  {paperDetail.data.authors?.map((a) => a.name).join(" · ")}
                </div>
                <div className="flex flex-wrap gap-1">
                  {paperDetail.data.topics?.map((tp) => (
                    <span key={tp.id} className="rounded-sm border border-line2 bg-panel2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                      {tp.name}
                    </span>
                  ))}
                </div>
                {paperDetail.data.ai_summary && (
                  <p className="border-l-2 border-accent/50 pl-2 text-xs leading-relaxed text-muted">
                    {paperDetail.data.ai_summary}
                  </p>
                )}
                <button
                  onClick={() => setPaperId(paperDetail.data.id)}
                  className="rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs text-accent hover:bg-accent/20"
                >
                  {t("kg.fullDetails")}
                </button>
              </div>
            )}

            {sel.type === "author" && authorDetail.data && (
              <div className="mt-3 space-y-2 text-xs text-muted">
                {authorDetail.data.institution && <div>{authorDetail.data.institution}</div>}
                <div className="tnum font-mono text-[11px]">
                  {t("kg.papersMeta", {
                    count: authorDetail.data.paper_count,
                    cites: formatCitations(authorDetail.data.total_citations),
                  })}
                </div>
              </div>
            )}

            {(sel.type === "topic" || sel.type === "technology") && (
              <div className="mt-3 space-y-2 text-xs text-muted">
                <Badge tone={sel.type === "topic" ? "teal" : "slate"}>{sel.kind || sel.type}</Badge>
                <div className="tnum font-mono text-[11px]">{t("kg.nPapers", { count: sel.papers })}</div>
              </div>
            )}
          </div>
        )}
      </aside>

      {paperId && (
        <PaperDetailModal
          projectId={project.id}
          paperId={paperId}
          onClose={() => setPaperId(null)}
          onOpenPaper={setPaperId}
        />
      )}
    </div>
  );
}
