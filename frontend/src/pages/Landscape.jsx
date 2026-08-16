import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import PaperDetailModal from "../components/PaperDetailModal";
import { Badge, EmptyState, ErrorBar, SectionHeader, Spinner, formatCitations } from "../components/ui";
import { useProject } from "../context/ProjectContext";
import { useApi } from "../hooks/useApi";
import { useI18n } from "../i18n";
import Chart, { AXIS_LABEL, AXIS_LINE, SPLIT_LINE, TOOLTIP } from "../viz/Chart";

const PALETTE = ["#2dd4bf", "#22d3ee", "#a78bfa", "#f59e0b", "#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#818cf8", "#4ade80", "#f87171", "#94a3b8"];

function Sparkline({ series, color = "#2dd4bf" }) {
  const values = (series || []).map((s) => s.count);
  if (!values.length) return <div className="h-8" />;
  const max = Math.max(...values, 1);
  const w = 120;
  const h = 30;
  const pts = values.map((v, i) => [
    (i / Math.max(1, values.length - 1)) * w,
    h - (v / max) * (h - 3) - 1.5,
  ]);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" />
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={color} opacity="0.12" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2" fill={color} />
    </svg>
  );
}

function barOption(summaries) {
  const top = [...summaries].slice(0, 12).reverse();
  return {
    tooltip: { ...TOOLTIP, trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 170, right: 20, top: 10, bottom: 24 },
    xAxis: { type: "value", minInterval: 1, splitLine: SPLIT_LINE, axisLabel: AXIS_LABEL },
    yAxis: {
      type: "category",
      data: top.map((tp) => tp.name),
      axisLine: AXIS_LINE,
      axisLabel: { ...AXIS_LABEL, width: 150, overflow: "truncate" },
    },
    series: [
      {
        type: "bar",
        data: top.map((tp) => tp.paper_count),
        barWidth: 12,
        itemStyle: {
          color: (p) => PALETTE[p.dataIndex % PALETTE.length],
          borderRadius: [0, 2, 2, 0],
        },
      },
    ],
  };
}

export default function Landscape() {
  const { project } = useProject();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [paperId, setPaperId] = useState(null);

  const { data, loading, error, reload } = useApi(
    () => (project ? api.get(`/projects/${project.id}/topics`) : Promise.resolve(null)),
    [project ? project.id : null]
  );

  if (!project) return <EmptyState title={t("common.noProjectSelected")} hint={t("common.selectHint")} />;
  if (loading) return <Spinner text={t("ls.loading")} />;
  if (error) return <ErrorBar message={error} onRetry={reload} />;
  const summaries = data || [];
  if (!summaries.length)
    return <EmptyState title={t("ls.noDirections")} hint={t("common.collectFirst")} />;

  return (
    <div className="mx-auto max-w-[1720px] space-y-5 p-5">
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-1 rounded-md border border-line bg-panel p-4">
          <SectionHeader title={t("ls.size")} meta={t("ls.sizeMeta")} />
          <Chart option={barOption(summaries)} height={Math.max(260, summaries.length * 20)} />
        </div>
        <div className="col-span-2 rounded-md border border-line bg-panel p-4">
          <SectionHeader title={t("ls.summary")} meta={t("ls.summaryMeta")} />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {summaries.map((tp, i) => (
              <div key={tp.id} className="flex flex-col rounded-md border border-line bg-panel2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button
                      onClick={() => navigate(`/explorer?topic=${encodeURIComponent(tp.name)}`)}
                      className="truncate text-left text-[13px] font-semibold text-ink hover:text-accent"
                      title={tp.name}
                    >
                      {tp.name}
                    </button>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge tone={tp.kind === "concept" ? "slate" : "teal"}>{tp.kind}</Badge>
                      <span className="tnum font-mono text-[10px] text-faint">
                        {t("ls.papersCitesMean", {
                          count: tp.paper_count,
                          cites: formatCitations(tp.total_citations),
                          year: tp.mean_year ?? "—",
                        })}
                      </span>
                    </div>
                  </div>
                  <Sparkline series={tp.trend} color={PALETTE[i % PALETTE.length]} />
                </div>
                <div className="mt-2 font-mono text-[10px] text-faint">
                  {(tp.top_authors || []).slice(0, 3).join(", ")}
                </div>
                <div className="mt-2 space-y-1 border-t border-line pt-2">
                  {(tp.top_papers || []).slice(0, 2).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPaperId(p.id)}
                      className="block w-full truncate text-left text-[11px] text-muted hover:text-ink"
                      title={p.title}
                    >
                      · {p.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
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
