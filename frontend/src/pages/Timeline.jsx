import { useState } from "react";
import { api } from "../api/client";
import PaperDetailModal from "../components/PaperDetailModal";
import { EmptyState, ErrorBar, SectionHeader, Spinner, formatCitations } from "../components/ui";
import { useProject } from "../context/ProjectContext";
import { useApi } from "../hooks/useApi";
import { useI18n } from "../i18n";
import Chart, { AXIS_LABEL, AXIS_LINE, SPLIT_LINE, TOOLTIP, areaGradient } from "../viz/Chart";

const PALETTE = ["#2dd4bf", "#22d3ee", "#a78bfa", "#f59e0b", "#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#818cf8", "#4ade80"];

function mainOption(series, seriesName) {
  const years = series.map((s) => s.year);
  const counts = series.map((s) => s.count);
  return {
    tooltip: { ...TOOLTIP, trigger: "axis" },
    grid: { left: 40, right: 16, top: 30, bottom: 24 },
    xAxis: { type: "category", data: years, axisLine: AXIS_LINE, axisLabel: AXIS_LABEL },
    yAxis: { type: "value", minInterval: 1, splitLine: SPLIT_LINE, axisLabel: AXIS_LABEL },
    series: [
      {
        name: seriesName,
        type: "line",
        data: counts,
        smooth: 0.3,
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { color: "#2dd4bf", width: 2 },
        itemStyle: { color: "#2dd4bf" },
        areaStyle: { color: areaGradient("45,212,191") },
      },
    ],
  };
}

function topicStackOption(byTopic, years) {
  const lookup = byTopic.map((tp) => {
    const m = {};
    tp.series.forEach((s) => (m[s.year] = s.count));
    return { name: tp.topic, map: m };
  });
  return {
    tooltip: { ...TOOLTIP, trigger: "axis" },
    legend: { textStyle: { color: "#94a3b8", fontSize: 10 }, top: 0, icon: "roundRect" },
    grid: { left: 40, right: 16, top: 34, bottom: 24 },
    xAxis: { type: "category", data: years, axisLine: AXIS_LINE, axisLabel: AXIS_LABEL },
    yAxis: { type: "value", minInterval: 1, splitLine: SPLIT_LINE, axisLabel: AXIS_LABEL },
    series: lookup.map((tp, i) => ({
      name: tp.name,
      type: "line",
      stack: "total",
      smooth: 0.25,
      symbol: "none",
      lineStyle: { width: 1.4, color: PALETTE[i % PALETTE.length] },
      itemStyle: { color: PALETTE[i % PALETTE.length] },
      areaStyle: { opacity: 0.55, color: PALETTE[i % PALETTE.length] },
      emphasis: { focus: "series" },
      data: years.map((y) => tp.map[y] || 0),
    })),
  };
}

export default function Timeline() {
  const { project } = useProject();
  const { t } = useI18n();
  const [paperId, setPaperId] = useState(null);
  const { data, loading, error, reload } = useApi(
    () => (project ? api.get(`/projects/${project.id}/timeline`) : Promise.resolve(null)),
    [project ? project.id : null]
  );

  if (!project) return <EmptyState title={t("common.noProjectSelected")} hint={t("common.selectHint")} />;
  if (loading) return <Spinner text={t("tl.loading")} />;
  if (error) return <ErrorBar message={error} onRetry={reload} />;
  if (!data || !data.series.length) return <EmptyState title={t("tl.noData")} hint={t("common.collectFirst")} />;

  return (
    <div className="mx-auto max-w-[1720px] space-y-5 p-5">
      <div className="grid grid-cols-2 gap-5">
        <div className="rounded-md border border-line bg-panel p-4">
          <SectionHeader title={t("tl.volume")} meta={t("tl.volumeMeta")} />
          <Chart option={mainOption(data.series, t("tl.seriesPapers"))} height={250} />
        </div>
        <div className="rounded-md border border-line bg-panel p-4">
          <SectionHeader title={t("tl.growth")} meta={t("tl.growthMeta")} />
          <Chart option={topicStackOption(data.by_topic || [], data.years || [])} height={250} />
        </div>
      </div>

      <div className="rounded-md border border-line bg-panel p-4">
        <SectionHeader title={t("tl.milestones")} meta={t("tl.milestonesMeta")} />
        <div className="relative">
          <div className="absolute left-0 right-0 top-[26px] h-px bg-line2" />
          <div className="flex min-w-max gap-0 overflow-x-auto pb-2">
            {(data.milestones || []).map((m, i) => (
              <div key={i} className="w-60 shrink-0 px-3">
                <div className="tnum text-center font-mono text-xs text-accent2">{m.year}</div>
                <div className="relative mt-[13px] flex justify-center">
                  <span className="h-3 w-3 rounded-full border-2 border-accent bg-bg" />
                </div>
                <button
                  onClick={() => setPaperId(m.paper_id)}
                  className="mt-2 block w-full rounded-md border border-line px-3 py-2 text-left text-xs leading-snug text-ink hover:border-accent/40"
                >
                  <span className="line-clamp-3">{m.title}</span>
                  <span className="mt-1 block font-mono text-[10px] text-faint">
                    {t("tl.citations", { count: formatCitations(m.citations) })}
                  </span>
                </button>
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
