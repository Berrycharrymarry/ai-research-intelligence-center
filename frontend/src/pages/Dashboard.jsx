import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, FileSearch, FlaskConical, GitBranch, Library, Users } from "lucide-react";
import { api } from "../api/client";
import PaperDetailModal from "../components/PaperDetailModal";
import { Badge, EmptyState, ErrorBar, SectionHeader, Spinner, StatCard, formatCitations } from "../components/ui";
import { useProject } from "../context/ProjectContext";
import { useApi } from "../hooks/useApi";
import { useI18n } from "../i18n";
import Chart, { AXIS_LABEL, AXIS_LINE, SPLIT_LINE, TOOLTIP, areaGradient } from "../viz/Chart";
import Graph3D from "../viz/Graph3D";

function activityOption(activity) {
  const years = (activity || []).map((s) => s.year);
  const counts = (activity || []).map((s) => s.count);
  return {
    tooltip: { ...TOOLTIP, trigger: "axis" },
    grid: { left: 38, right: 14, top: 30, bottom: 24 },
    xAxis: { type: "category", data: years, axisLine: AXIS_LINE, axisLabel: AXIS_LABEL },
    yAxis: { type: "value", minInterval: 1, splitLine: SPLIT_LINE, axisLabel: AXIS_LABEL },
    series: [
      {
        type: "line",
        data: counts,
        smooth: 0.35,
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { color: "#2dd4bf", width: 2 },
        itemStyle: { color: "#2dd4bf" },
        areaStyle: { color: areaGradient("45,212,191") },
      },
    ],
  };
}

export default function Dashboard() {
  const { project, loading: projectLoading } = useProject();
  const { t } = useI18n();
  const [paperId, setPaperId] = useState(null);
  const [graphSel, setGraphSel] = useState(null);

  const { data, loading, error, reload } = useApi(
    () => (project ? api.get(`/projects/${project.id}/overview`) : Promise.resolve(null)),
    [project ? project.id : null, project ? project.status : null]
  );

  if (projectLoading) return <Spinner text={t("dash.loadingProjects")} />;
  if (!project)
    return (
      <EmptyState
        icon={FlaskConical}
        title={t("dash.noProject")}
        hint={t("dash.noProjectHint")}
      />
    );

  const busy = project.status === "collecting" || project.status === "analyzing";
  if (busy) return <Spinner text={`${project.status === "collecting" ? t("dash.collecting") : t("dash.analyzing")}…`} />;
  if (error) return <ErrorBar message={error} onRetry={reload} />;
  if (loading || !data) return <Spinner text={t("dash.assembling")} />;

  const s = data.stats;

  return (
    <div className="mx-auto max-w-[1720px] space-y-5 p-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-wide">{project.name}</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-faint">
            {project.description || project.query}
          </p>
        </div>
        <div className="font-mono text-[11px] text-faint">
          {s.year_span ? t("dash.coverage", { a: s.year_span[0], b: s.year_span[1] }) : ""}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 xl:grid-cols-6">
        <StatCard label={t("dash.papers")} value={s.papers} accent="text-accent" />
        <StatCard label={t("dash.authors")} value={s.authors} />
        <StatCard label={t("dash.directions")} value={s.topics} />
        <StatCard label={t("dash.opportunities")} value={s.gaps} accent="text-accent2" />
        <StatCard label={t("dash.citations")} value={formatCitations(s.citations)} />
        <StatCard label={t("dash.avgPerPaper")} value={s.avg_citations} />
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 rounded-md border border-line bg-panel p-4">
          <SectionHeader title={t("dash.activity")} meta={t("dash.activityMeta")} />
          <Chart option={activityOption(data.activity)} height={230} />
        </div>
        <div className="rounded-md border border-line bg-panel p-4">
          <SectionHeader title={t("dash.trending")} meta={t("dash.trendingMeta")} />
          <div className="space-y-2">
            {(data.trending_topics || []).slice(0, 6).map((tp) => (
              <div
                key={tp.name}
                className="flex items-center justify-between rounded-md border border-line bg-panel2 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-ink">{tp.name}</div>
                  <div className="font-mono text-[10px] text-faint">{t("dash.nPapers", { count: tp.count })}</div>
                </div>
                {tp.growth > 0.15 ? (
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-accent">
                    <ArrowUpRight size={12} /> +{Math.round(tp.growth * 100)}%
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-faint">
                    <ArrowDownRight size={12} /> {Math.round(tp.growth * 100)}%
                  </span>
                )}
              </div>
            ))}
            {(!data.trending_topics || !data.trending_topics.length) && (
              <div className="py-8 text-center text-xs text-faint">{t("dash.noTrend")}</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 rounded-md border border-line bg-panel p-4">
          <SectionHeader
            title={t("dash.latest")}
            meta={t("dash.latestMeta")}
            right={
              <Link to="/explorer" className="text-xs text-accent2 hover:underline">
                {t("dash.explorer")}
              </Link>
            }
          />
          <div className="space-y-1.5">
            {(data.latest_papers || []).map((p) => (
              <button
                key={p.id}
                onClick={() => setPaperId(p.id)}
                className="flex w-full items-center gap-3 rounded-md border border-line px-3 py-2 text-left hover:border-accent/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-ink">{p.title}</div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-faint">
                    {p.authors?.slice(0, 3).map((a) => a.name).join(", ")}
                  </div>
                </div>
                <div className="tnum font-mono text-[11px] text-muted">{p.publication_year}</div>
                <div className="tnum w-14 text-right font-mono text-[11px] text-warn">
                  {formatCitations(p.cited_by_count)}
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-line bg-panel p-4">
          <SectionHeader title={t("dash.topPapers")} meta={t("dash.topMeta")} />
          <div className="space-y-2">
            {(data.top_papers || []).map((p, i) => (
              <button
                key={p.id}
                onClick={() => setPaperId(p.id)}
                className="flex w-full items-center gap-3 rounded-md border border-line px-3 py-2 text-left hover:border-accent/40"
              >
                <span className="tnum font-mono text-sm text-faint">0{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-ink">{p.title}</div>
                  <div className="font-mono text-[10px] text-faint">
                    {t("dash.nCitations", { count: formatCitations(p.cited_by_count) })}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 rounded-md border border-line bg-panel p-4">
          <SectionHeader
            title={t("dash.graphPreview")}
            meta={t("dash.graphMeta")}
            right={
              <Link to="/graph" className="text-xs text-accent2 hover:underline">
                {t("dash.fullGraph")}
              </Link>
            }
          />
          <div style={{ height: 440 }}>
            <Graph3D data={data.graph} onSelect={setGraphSel} selectedId={graphSel?.id} />
          </div>
        </div>
        <div className="space-y-5">
          <div className="rounded-md border border-line bg-panel p-4">
            <SectionHeader
              title={t("dash.timeline")}
              right={
                <Link to="/timeline" className="text-xs text-accent2 hover:underline">
                  {t("dash.detail")}
                </Link>
              }
            />
            <Chart option={activityOption(data.timeline?.series || [])} height={150} />
            <div className="mt-2 space-y-1">
              {(data.timeline?.milestones || []).slice(-3).map((m) => (
                <button
                  key={m.paper_id}
                  onClick={() => setPaperId(m.paper_id)}
                  className="block w-full truncate rounded-md border border-line px-2.5 py-1.5 text-left text-[11px] text-muted hover:border-accent/40"
                >
                  <span className="font-mono text-faint">{m.year}</span> {m.title}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-line bg-panel p-4">
            <SectionHeader
              title={t("dash.gaps")}
              right={
                <Link to="/gaps" className="text-xs text-accent2 hover:underline">
                  {t("dash.all")}
                </Link>
              }
            />
            <div className="space-y-2">
              {(data.gaps || []).slice(0, 3).map((g) => (
                <div key={g.id} className="rounded-md border border-line bg-panel2 px-3 py-2">
                  <div className="text-xs font-medium leading-snug text-ink">{g.title}</div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Badge tone={g.signal === "future_work" ? "teal" : "amber"}>{g.signal}</Badge>
                    <span className="font-mono text-[10px] text-faint">
                      conf {Math.round(g.confidence * 100)}%
                    </span>
                  </div>
                </div>
              ))}
              {(!data.gaps || !data.gaps.length) && (
                <div className="py-6 text-center text-xs text-faint">{t("dash.noGaps")}</div>
              )}
            </div>
          </div>
        </div>
      </div>

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
