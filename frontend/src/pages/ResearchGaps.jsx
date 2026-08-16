import { useState } from "react";
import { ChevronDown, ChevronUp, Lightbulb, Target } from "lucide-react";
import { api } from "../api/client";
import PaperDetailModal from "../components/PaperDetailModal";
import { Badge, EmptyState, ErrorBar, SectionHeader, Spinner } from "../components/ui";
import { useProject } from "../context/ProjectContext";
import { useApi } from "../hooks/useApi";
import { useI18n } from "../i18n";

const SIGNAL_TONE = {
  future_work: "teal",
  undercited_recent: "cyan",
  topic_intersection: "amber",
  single_dominant: "amber",
  mature_decline: "slate",
};

function GapCard({ gap, projectId, onOpenPaper }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const tone = SIGNAL_TONE[gap.signal] || "slate";
  return (
    <div className="rounded-md border border-line bg-panel">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-start justify-between gap-4 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={tone}>{t(`signals.${gap.signal}`)}</Badge>
            <span className="tnum font-mono text-[10px] text-faint">
              {t("gp.confidence", { n: Math.round(gap.confidence * 100) })}
            </span>
          </div>
          <h3 className="mt-2 text-sm font-semibold leading-snug text-ink">{gap.title}</h3>
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">{gap.problem}</p>
        </div>
        {open ? (
          <ChevronUp size={16} className="mt-1 shrink-0 text-faint" />
        ) : (
          <ChevronDown size={16} className="mt-1 shrink-0 text-faint" />
        )}
      </button>
      {open && (
        <div className="space-y-4 border-t border-line p-4">
          <div>
            <div className="microlabel mb-1.5">{t("gp.why")}</div>
            <p className="text-xs leading-relaxed text-muted">{gap.why_worth}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="microlabel mb-1.5">{t("gp.existing")}</div>
              <ul className="space-y-1">
                {(gap.existing_methods || []).map((m, i) => (
                  <li key={i} className="border-l-2 border-line2 pl-2 text-[11px] leading-snug text-muted">
                    {m}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="microlabel mb-1.5 flex items-center gap-1.5 !text-accent">
                <Lightbulb size={11} /> {t("gp.suggested")}
              </div>
              <ul className="space-y-1.5">
                {(gap.proposed_ideas || []).map((idea, i) => (
                  <li key={i} className="border-l-2 border-accent/40 pl-2 text-[11px] leading-snug text-ink">
                    {idea}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {gap.evidence_papers?.length > 0 && (
            <div>
              <div className="microlabel mb-1.5">{t("gp.evidence")}</div>
              <div className="flex flex-wrap gap-1.5">
                {gap.evidence_papers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onOpenPaper(p.id)}
                    className="max-w-xs truncate rounded-sm border border-line bg-panel2 px-2 py-1 text-[11px] text-muted hover:border-accent/40 hover:text-ink"
                    title={p.title}
                  >
                    {p.publication_year} · {p.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ResearchGaps() {
  const { project } = useProject();
  const { t } = useI18n();
  const [paperId, setPaperId] = useState(null);
  const { data, loading, error, reload } = useApi(
    () => (project ? api.get(`/projects/${project.id}/gaps`) : Promise.resolve(null)),
    [project ? project.id : null]
  );

  if (!project) return <EmptyState title={t("common.noProjectSelected")} hint={t("common.selectHint")} />;
  if (loading) return <Spinner text={t("gp.loading")} />;
  if (error) return <ErrorBar message={error} onRetry={reload} />;
  const gaps = data || [];
  if (!gaps.length)
    return (
      <EmptyState
        icon={Target}
        title={t("gp.noGaps")}
        hint={t("gp.noGapsHint")}
      />
    );

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-5">
      <div className="flex items-center gap-2.5 rounded-md border border-accent/25 bg-accent/5 px-4 py-2.5">
        <Target size={15} className="text-accent" />
        <span className="text-[11px] uppercase tracking-[0.16em] text-accent">
          {t("gp.banner")}
        </span>
        <span className="ml-auto font-mono text-[10px] text-faint">
          {t("gp.signalsFound", { count: gaps.length })}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {gaps.map((g) => (
          <GapCard key={g.id} gap={g} projectId={project.id} onOpenPaper={setPaperId} />
        ))}
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
