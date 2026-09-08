import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "../api/client";

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestVersion = useRef(0);

  const loadProjects = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const list = await api.get("/projects");
      if (version !== requestVersion.current) return;
      setProjects(list);
      const stored = Number(localStorage.getItem("research.projectId"));
      const target = list.find((p) => p.id === stored) || list[0] || null;
      if (target) {
        localStorage.setItem("research.projectId", String(target.id));
        const detail = await api.get(`/projects/${target.id}`);
        if (version !== requestVersion.current) return;
        setProject(detail);
      } else {
        setProject(null);
      }
      setError(null);
    } catch (e) {
      if (version === requestVersion.current) setError(e.message || String(e));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  // Initial load — the app never fetched the project list before this fix,
  // so the dashboard showed "Loading projects…" forever.
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const selectProject = useCallback(
    (id) => {
      localStorage.setItem("research.projectId", String(id));
      setProject(null);
      setLoading(true);
      loadProjects();
    },
    [loadProjects]
  );

  const refreshProject = useCallback(async (id) => {
    const detail = await api.get(`/projects/${id}`);
    setProject(detail);
    return detail;
  }, []);

  // poll while the active project is being collected/analyzed
  const activeId = project ? project.id : null;
  const activeStatus = project ? project.status : null;
  useEffect(() => {
    if (!activeId) return undefined;
    if (activeStatus !== "collecting" && activeStatus !== "analyzing") return undefined;
    let canceled = false;
    let timer;
    const poll = async () => {
      try {
        const detail = await api.get(`/projects/${activeId}`);
        if (canceled) return;
        setProject((current) => current?.id === activeId ? detail : current);
        setProjects((list) => list.map((item) => item.id === activeId ? { ...item, ...detail } : item));
        if (!["collecting", "analyzing"].includes(detail.status)) return;
      } catch {
        /* Retry transient failures without accumulating overlapping requests. */
      }
      if (!canceled) timer = setTimeout(poll, 2000);
    };
    timer = setTimeout(poll, 1200);
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [activeId, activeStatus]);

  const collect = useCallback(
    async (id) => {
      await api.post(`/projects/${id}/collect`);
      const detail = await api.get(`/projects/${id}`);
      setProject(detail);
    },
    []
  );

  const createProject = useCallback(
    async (payload) => {
      const p = await api.post("/projects", payload);
      localStorage.setItem("research.projectId", String(p.id));
      await loadProjects();
      return p;
    },
    [loadProjects]
  );

  const deleteProject = useCallback(
    async (id) => {
      await api.del(`/projects/${id}`);
      await loadProjects();
    },
    [loadProjects]
  );

  const value = {
    projects,
    project,
    loading,
    error,
    loadProjects,
    selectProject,
    refreshProject,
    collect,
    createProject,
    deleteProject,
  };
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}
