import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDownWideNarrow, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { api, qs } from "../api/client";
import PaperDetailModal from "../components/PaperDetailModal";
import PaperTable from "../components/PaperTable";
import { EmptyState, ErrorBar, Spinner } from "../components/ui";
import { useProject } from "../context/ProjectContext";
import { useApi } from "../hooks/useApi";
import { useI18n } from "../i18n";

export default function PaperExplorer() {
  const { project } = useProject();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [topic, setTopic] = useState(searchParams.get("topic") || "");
  const [sort, setSort] = useState("date");
  const [order, setOrder] = useState("desc");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [minCites, setMinCites] = useState("");
  const [page, setPage] = useState(1);
  const [paperId, setPaperId] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  // sync topic filter when navigating from Landscape links
  useEffect(() => {
    const tp = searchParams.get("topic");
    if (tp) {
      setTopic(tp);
      setPage(1);
    }
  }, [searchParams]);

  const { data, loading, error, reload } = useApi(
    () =>
      project
        ? api.get(
            `/projects/${project.id}/papers${qs({
              q: debouncedQ || undefined,
              topic: topic || undefined,
              sort,
              order,
              year_from: yearFrom || undefined,
              year_to: yearTo || undefined,
              min_citations: minCites || undefined,
              page,
              page_size: 20,
            })}`
          )
        : Promise.resolve(null),
    [project ? project.id : null, debouncedQ, topic, sort, order, yearFrom, yearTo, minCites, page]
  );

  if (!project)
    return <EmptyState title={t("common.noProjectSelected")} hint={t("common.selectHint")} />;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="mx-auto max-w-[1720px] space-y-4 p-5">
      <div className="rounded-md border border-line bg-panel p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("exp.searchPh")}
              className="w-full rounded-md border border-line bg-panel2 py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
            />
          </div>

          <select
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-line bg-panel2 px-2.5 py-2 text-xs text-ink focus:border-accent/50 focus:outline-none"
          >
            <option value="">{t("exp.allDirections")}</option>
            {(data?.facets?.topics || []).map((tp) => (
              <option key={tp} value={tp}>{tp}</option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-line bg-panel2 px-2.5 py-2 text-xs text-ink focus:border-accent/50 focus:outline-none"
          >
            <option value="date">{t("exp.sortDate")}</option>
            <option value="cited">{t("exp.sortCited")}</option>
            <option value="title">{t("exp.sortTitle")}</option>
          </select>

          <button
            onClick={() => {
              setOrder(order === "desc" ? "asc" : "desc");
              setPage(1);
            }}
            title={t("exp.toggleOrder")}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-muted hover:border-accent/40 hover:text-accent"
          >
            <ArrowDownWideNarrow size={14} className={order === "asc" ? "rotate-180" : ""} />
          </button>

          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={yearFrom}
              onChange={(e) => {
                setYearFrom(e.target.value);
                setPage(1);
              }}
              placeholder={t("exp.from")}
              className="w-20 rounded-md border border-line bg-panel2 px-2 py-2 font-mono text-xs text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
            />
            <span className="text-faint">–</span>
            <input
              type="number"
              value={yearTo}
              onChange={(e) => {
                setYearTo(e.target.value);
                setPage(1);
              }}
              placeholder={t("exp.to")}
              className="w-20 rounded-md border border-line bg-panel2 px-2 py-2 font-mono text-xs text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
            />
            <input
              type="number"
              value={minCites}
              onChange={(e) => {
                setMinCites(e.target.value);
                setPage(1);
              }}
              placeholder={t("exp.minCites")}
              className="w-24 rounded-md border border-line bg-panel2 px-2 py-2 font-mono text-xs text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <div className="tnum font-mono text-[11px] text-faint">
          {data ? t("exp.nPapers", { count: data.total }) : ""}
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs text-muted hover:border-accent/40 hover:text-accent disabled:opacity-30"
          >
            <ChevronLeft size={13} /> {t("exp.prev")}
          </button>
          <span className="tnum font-mono text-[11px] text-faint">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs text-muted hover:border-accent/40 hover:text-accent disabled:opacity-30"
          >
            {t("exp.next")} <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {loading ? (
        <Spinner text={t("exp.querying")} />
      ) : error ? (
        <ErrorBar message={error} onRetry={reload} />
      ) : !data?.items?.length ? (
        <EmptyState
          title={t("exp.noMatch")}
          hint={t("exp.noMatchHint")}
        />
      ) : (
        <PaperTable papers={data.items} onOpen={setPaperId} />
      )}

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
