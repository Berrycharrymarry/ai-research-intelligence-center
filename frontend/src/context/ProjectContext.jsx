import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "../api/client";

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const loadProjects = useCallback(async () => {
    try {
      const list = await api.get("/projects");
      setProjects(list);
      const stored = Number(localStorage.getItem("research.projectId"));
      const target = list.find((p) => p.id === stored) || list[0] || null;
      if (target) {
        localStorage.setItem("research.projectId", String(target.id));
        const detail = await api.get(`/projects/${target.id}`);
        setProject(detail);
      } else {
        setProject(null);
      }
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
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
    if (pollRef.current) return undefined;
    pollRef.current = setInterval(async () => {
      try {
        const detail = await api.get(`/projects/${activeId}`);
        setProject(detail);
        if (detail.status === "ready" || detail.status === "error") {
          clearInterval(pollRef.current);
          pollRef.current = null;
          loadProjects();
        }
      } catch {
        /* transient — keep polling */
      }
    }, 1500);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeId, activeStatus, loadProjects]);

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
