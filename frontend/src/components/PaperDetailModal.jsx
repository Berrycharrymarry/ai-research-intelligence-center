import { ExternalLink, FileText, X } from "lucide-react";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { useI18n } from "../i18n";
import { Badge, ErrorBar, Spinner, formatCitations } from "./ui";

export default function PaperDetailModal({ projectId, paperId, onClose, onOpenPaper }) {
  const { t } = useI18n();
  const { data, loading, error } = useApi(
    () => api.get(`/projects/${projectId}/papers/${paperId}`),
    [projectId, paperId]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-6 pt-[7vh]"
      onClick={onClose}
    >
      <div
        className="max-h-[84vh] w-full max-w-3xl overflow-y-auto rounded-md border border-line2 bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && <Spinner />}
        {error && (
          <div className="p-6">
            <ErrorBar message={error} />
          </div>
        )}
        {data && (
          <div className="p-6">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold leading-snug text-ink">{data.title}</h2>
              <button
                onClick={onClose}
                className="rounded-md border border-line p-1.5 text-muted hover:border-line2 hover:text-ink"
                aria-label={t("md.close")}
              >
                <X size={15} />
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone="cyan">{data.publication_year || t("md.na")}</Badge>
              <Badge tone="teal">{data.type || t("nodeType.paper")}</Badge>
              {data.kind === "expand" && <Badge tone="slate">{t("md.foundational")}</Badge>}
              <Badge tone="amber">
                {t("md.citations", { count: formatCitations(data.cited_by_count) })}
              </Badge>
              {data.topics?.map((tp) => (
                <Badge key={tp.id}>{tp.name}</Badge>
              ))}
            </div>

            <div className="mt-3 font-mono text-xs text-muted">
              {data.authors?.map((a) => a.name).join(" · ")}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {data.url && (
                <a
                  href={data.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-accent2 hover:border-accent2/50"
                >
                  <ExternalLink size={12} /> {t("md.source")}
                </a>
              )}
              {data.pdf_url && (
                <a
                  href={data.pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-accent2 hover:border-accent2/50"
                >
                  <FileText size={12} /> PDF
                </a>
              )}
              {data.doi && (
                <span className="inline-flex items-center rounded-md border border-line px-2.5 py-1.5 font-mono text-[11px] text-faint">
                  {data.doi}
                </span>
              )}
              {data.arxiv_id && (
                <span className="inline-flex items-center rounded-md border border-line px-2.5 py-1.5 font-mono text-[11px] text-faint">
                  arXiv:{data.arxiv_id}
                </span>
              )}
            </div>

            {data.ai_summary && (
              <div className="mt-5 rounded-md border border-accent/25 bg-accent/5 p-4">
                <div className="microlabel mb-1.5 !text-accent">{t("md.summaryLabel")}</div>
                <p className="text-[13px] leading-relaxed text-ink">{data.ai_summary}</p>
              </div>
            )}

            {data.abstract && (
              <div className="mt-5">
                <div className="microlabel mb-1.5">{t("md.abstract")}</div>
                <p className="text-[13px] leading-relaxed text-muted">{data.abstract}</p>
              </div>
            )}

            {data.related?.length > 0 && (
              <div className="mt-6">
                <div className="microlabel mb-2">{t("md.related")}</div>
                <div className="space-y-1.5">
                  {data.related.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => onOpenPaper?.(r.id)}
                      className="block w-full rounded-md border border-line px-3 py-2 text-left text-xs text-muted hover:border-accent/40 hover:text-ink"
                    >
                      <span className="text-ink">{r.title}</span>
                      <span className="ml-2 font-mono text-faint">
                        {r.publication_year} · {t("md.cites", { count: formatCitations(r.cited_by_count) })}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
