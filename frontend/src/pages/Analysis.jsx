import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, BrainCircuit } from "lucide-react";
import { api } from "../api/client";
import PaperDetailModal from "../components/PaperDetailModal";
import { Badge, EmptyState, ErrorBar, SectionHeader, Spinner, formatCitations } from "../components/ui";
import { useProject } from "../context/ProjectContext";
import { useApi } from "../hooks/useApi";
import { useI18n } from "../i18n";
import Chart, { AXIS_LABEL, AXIS_LINE, SPLIT_LINE, TOOLTIP, areaGradient } from "../viz/Chart";

const PHASE_TONE = {
  foundational: "slate",
  growth: "teal",
  frontier: "cyan",
};

function trendOption(series) {
  const years = series.map((s) => s.year);
  return {
    tooltip: { ...TOOLTIP, trigger: "axis" },
    grid: { left: 38, right: 14, top: 26, bottom: 22 },
    xAxis: { type: "category", data: years, axisLine: AXIS_LINE, axisLabel: AXIS_LABEL },
    yAxis: { type: "value", minInterval: 1, splitLine: SPLIT_LINE, axisLabel: AXIS_LABEL },
    series: [
      {
        type: "line",
        data: series.map((s) => s.count),
        smooth: 0.3,
        symbol: "circle",
        symbolSize: 4,
        lineStyle: { color: "#22d3ee", width: 2 },
        itemStyle: { color: "#22d3ee" },
        areaStyle: { color: areaGradient("34,211,238") },
      },
    ],
  };
}

export default function Analysis() {
  const { project } = useProject();
  const { t, lang } = useI18n();
  const [paperId, setPaperId] = useState(null);
  const { data, loading, error, reload } = useApi(
    () => (project ? api.get(`/projects/${project.id}/analysis`) : Promise.resolve(null)),
    [project ? project.id : null]
  );

  if (!project) return <EmptyState title={t("common.noProjectSelected")} hint={t("common.selectHint")} />;
  if (loading) return <Spinner text={t("an.loading")} />;
  if (error) return <ErrorBar message={error} onRetry={reload} />;
  if (!data || !data.overview)
    return <EmptyState title={t("an.noAnalysis")} hint={t("common.collectFirst")} />;

  const { overview, trends, roadmap } = data;

  return (
    <div className="mx-auto max-w-[1720px] space-y-5 p-5">
      <div className="flex items-center justify-between rounded-md border border-accent/25 bg-accent/5 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <BrainCircuit size={16} className="text-accent" />
          <span className="text-[11px] uppercase tracking-[0.16em] text-accent">
            {t("an.banner")}
          </span>
        </div>
        <span className="font-mono text-[10px] text-faint">
          {data.generated_at
            ? t("an.generated", { time: data.generated_at.slice(0, 19).replace("T", " ") })
            : ""}
        </span>
      </div>

      <div className="rounded-md border border-line bg-panel p-5">
        <SectionHeader title={t("an.overview")} />
        <p className="max-w-4xl text-sm leading-relaxed text-ink">
          {lang === "zh" && overview.summary_zh ? overview.summary_zh : overview.summary}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div>
            <div className="microlabel mb-2">{t("an.keyDirections")}</div>
            <div className="flex flex-wrap gap-1.5">
              {(overview.stats.top_topics || []).map((tp) => (
                <Badge key={tp} tone="teal">{tp}</Badge>
              ))}
            </div>
          </div>
          <div>
            <div className="microlabel mb-2">{t("an.institutions")}</div>
            <ul className="space-y-1 font-mono text-[11px] text-muted">
              {(overview.stats.top_institutions || []).slice(0, 5).map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="microlabel mb-2">{t("an.mostCited")}</div>
            {(overview.stats.top_papers || []).slice(0, 3).map((p) => (
              <button
                key={p.id}
                onClick={() => setPaperId(p.id)}
                className="block w-full truncate text-left text-xs text-ink hover:text-accent"
                title={p.title}
              >
                <span className="mr-1.5 font-mono text-[10px] text-warn">
                  {formatCitations(p.cited_by_count)}
                </span>
                {p.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 rounded-md border border-line bg-panel p-4">
          <SectionHeader title={t("an.trend")} meta={t("an.trendMeta")} />
          <Chart option={trendOption(trends?.series || [])} height={220} />
        </div>
        <div className="grid grid-rows-2 gap-5">
          <div className="rounded-md border border-line bg-panel p-4">
            <SectionHeader title={t("an.fastest")} />
            <div className="space-y-1.5">
              {(trends?.fastest_growing || []).map((tp) => (
                <div key={tp.topic} className="flex items-center justify-between text-xs">
                  <span className="truncate text-ink">{tp.topic}</span>
                  <span className="ml-2 inline-flex items-center gap-1 font-mono text-[11px] text-accent">
                    <ArrowUpRight size={12} /> +{Math.round(tp.growth * 100)}%
                  </span>
                </div>
              ))}
              {(!trends?.fastest_growing || !trends.fastest_growing.length) && (
                <div className="text-xs text-faint">—</div>
              )}
            </div>
          </div>
          <div className="rounded-md border border-line bg-panel p-4">
            <SectionHeader title={t("an.declining")} />
            <div className="space-y-1.5">
              {(trends?.declining || []).map((tp) => (
                <div key={tp.topic} className="flex items-center justify-between text-xs">
                  <span className="truncate text-ink">{tp.topic}</span>
                  <span className="ml-2 inline-flex items-center gap-1 font-mono text-[11px] text-danger">
                    <ArrowDownRight size={12} /> {Math.round(tp.growth * 100)}%
                  </span>
                </div>
              ))}
              {(!trends?.declining || !trends.declining.length) && (
                <div className="text-xs text-faint">—</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-line bg-panel p-5">
        <SectionHeader title={t("an.route")} meta={t("an.routeMeta")} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {(roadmap?.phases || []).map((ph) => (
            <div key={ph.phase} className="rounded-md border border-line bg-panel2 p-4">
              <div className="flex items-center justify-between">
                <Badge tone={PHASE_TONE[ph.phase] || "slate"}>
                  {t(`phases.${ph.phase}`) !== `phases.${ph.phase}` ? t(`phases.${ph.phase}`) : ph.phase}
                </Badge>
                <span className="tnum font-mono text-[10px] text-faint">
                  {ph.years ? `${ph.years[0]}–${ph.years[1]}` : ""}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                {lang === "zh" && ph.description_zh ? ph.description_zh : ph.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(ph.topics || []).map((tp) => (
                  <Badge key={tp}>{tp}</Badge>
                ))}
              </div>
              <div className="mt-3 space-y-1.5 border-t border-line pt-2">
                {(ph.papers || []).slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPaperId(p.id)}
                    className="block w-full truncate text-left text-[11px] text-muted hover:text-ink"
                    title={p.title}
                  >
                    <span className="mr-1.5 font-mono text-[10px] text-warn">
                      {formatCitations(p.cited_by_count)}
                    </span>
                    {p.title}
                  </button>
                ))}
              </div>
            </div>
          ))}
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
