import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FlaskConical, Trash2 } from "lucide-react";
import { useProject } from "../context/ProjectContext";
import { useI18n } from "../i18n";
import { Badge, ErrorBar, StatusBadge } from "../components/ui";

export default function Setup() {
  const { projects, project, loading, error, createProject, deleteProject, selectProject } =
    useProject();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setFormError(null);
    try {
      await createProject({
        name: name.trim(),
        description: description.trim() || null,
        query: query.trim() || null,
      });
      navigate("/");
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold">{t("setup.title")}</h1>
        <p className="mt-1 text-xs text-faint">{t("setup.subtitle")}</p>
      </div>

      <form
        onSubmit={submit}
        className="space-y-3 rounded-md border border-line bg-panel p-5"
      >
        <div className="microlabel">{t("setup.newProject")}</div>
        <div>
          <label className="mb-1 block text-[11px] text-muted">{t("setup.name")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("setup.namePh")}
            className="w-full rounded-md border border-line bg-panel2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted">
            {t("setup.query")} <span className="text-faint">{t("setup.queryDefault")}</span>
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("setup.queryPh")}
            className="w-full rounded-md border border-line bg-panel2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted">{t("setup.description")}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder={t("setup.descPh")}
            className="w-full resize-none rounded-md border border-line bg-panel2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
          />
        </div>
        {formError && <ErrorBar message={formError} />}
        <button
          disabled={busy || !name.trim()}
          className="inline-flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-medium text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FlaskConical size={13} />
          {busy ? t("setup.creating") : t("setup.create")}
        </button>
      </form>

      {error && <ErrorBar message={error} />}
      {loading ? (
        <div className="py-8 text-center text-xs text-faint">{t("setup.loading")}</div>
      ) : (
        <div className="space-y-2">
          <div className="microlabel">{t("setup.existing")}</div>
          {projects.length === 0 && (
            <div className="rounded-md border border-line bg-panel px-4 py-6 text-center text-xs text-faint">
              {t("setup.noProjects")}
            </div>
          )}
          {projects.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-md border border-line bg-panel px-4 py-3"
            >
              <button
                onClick={() => {
                  selectProject(p.id);
                  navigate("/");
                }}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">{p.name}</span>
                  <StatusBadge status={p.status} />
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-faint">
                  {t("setup.metaPapers", { count: p.paper_count, query: p.query, slug: p.slug })}
                </div>
              </button>
              <Badge tone={p.status === "ready" ? "teal" : "slate"}>
                {t("setup.papersBadge", { count: p.paper_count })}
              </Badge>
              <button
                onClick={async () => {
                  if (window.confirm(t("setup.confirmDelete", { name: p.name }))) {
                    await deleteProject(p.id);
                  }
                }}
                className="rounded-md border border-line p-2 text-faint hover:border-danger/50 hover:text-danger"
                title={t("setup.confirmDelete", { name: p.name })}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
