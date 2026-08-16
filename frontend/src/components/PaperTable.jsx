import { useI18n } from "../i18n";
import { formatCitations } from "./ui";

export default function PaperTable({ papers, onOpen }) {
  const { t } = useI18n();
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-line bg-panel2 text-[10px] uppercase tracking-wider text-faint">
            <th className="px-4 py-2.5 font-semibold">{t("table.title")}</th>
            <th className="w-24 px-3 py-2.5 font-semibold">{t("table.year")}</th>
            <th className="w-20 px-3 py-2.5 text-right font-semibold">{t("table.citations")}</th>
            <th className="hidden w-56 px-3 py-2.5 font-semibold md:table-cell">{t("table.directions")}</th>
          </tr>
        </thead>
        <tbody>
          {papers.map((p) => (
            <tr
              key={p.id}
              onClick={() => onOpen(p.id)}
              className="cursor-pointer border-b border-line/60 bg-panel transition-colors last:border-0 hover:bg-panel2"
            >
              <td className="max-w-[480px] px-4 py-2.5">
                <div className="truncate font-medium text-ink">{p.title}</div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-faint">
                  {p.authors?.slice(0, 4).map((a) => a.name).join(", ")}
                </div>
              </td>
              <td className="tnum px-3 py-2.5 font-mono text-xs text-muted">{p.publication_year ?? "—"}</td>
              <td className="tnum px-3 py-2.5 text-right font-mono text-xs text-warn">
                {formatCitations(p.cited_by_count)}
              </td>
              <td className="hidden px-3 py-2.5 md:table-cell">
                <div className="flex flex-wrap gap-1">
                  {(p.topics || []).slice(0, 3).map((tp) => (
                    <span
                      key={tp.id}
                      className="rounded-sm border border-line2 bg-panel2 px-1.5 py-0.5 font-mono text-[10px] text-muted"
                    >
                      {tp.name}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
