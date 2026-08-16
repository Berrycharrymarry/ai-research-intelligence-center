import { useProject } from "../context/ProjectContext";

export default function ProjectSwitcher() {
  const { projects, project, selectProject } = useProject();
  if (!projects.length) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[10px] uppercase tracking-widest text-faint lg:inline">
        Project
      </span>
      <select
        value={project ? project.id : ""}
        onChange={(e) => selectProject(Number(e.target.value))}
        className="max-w-[280px] truncate rounded-md border border-line bg-panel2 px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent/50"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.paper_count} papers
          </option>
        ))}
      </select>
    </div>
  );
}
