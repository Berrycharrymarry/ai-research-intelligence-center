import { lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { ProjectProvider } from "./context/ProjectContext";
import { I18nProvider } from "./i18n";
const Analysis = lazy(() => import("./pages/Analysis"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Discovery = lazy(() => import("./pages/Discovery"));
const KnowledgeGraph = lazy(() => import("./pages/KnowledgeGraph"));
const Landscape = lazy(() => import("./pages/Landscape"));
const PaperExplorer = lazy(() => import("./pages/PaperExplorer"));
const ResearchGaps = lazy(() => import("./pages/ResearchGaps"));
const Setup = lazy(() => import("./pages/Setup"));
const Timeline = lazy(() => import("./pages/Timeline"));
const HardwareLab = lazy(() => import("./pages/HardwareLab"));

export default function App() {
  return (
    <I18nProvider>
      <ProjectProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Discovery />} />
              <Route path="/overview" element={<Dashboard />} />
              <Route path="/explorer" element={<PaperExplorer />} />
              <Route path="/timeline" element={<Timeline />} />
              <Route path="/graph" element={<KnowledgeGraph />} />
              <Route path="/landscape" element={<Landscape />} />
              <Route path="/analysis" element={<Analysis />} />
              <Route path="/gaps" element={<ResearchGaps />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/hardware" element={<HardwareLab />} />
              <Route path="*" element={<Dashboard />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ProjectProvider>
    </I18nProvider>
  );
}
