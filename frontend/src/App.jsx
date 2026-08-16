import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { ProjectProvider } from "./context/ProjectContext";
import { I18nProvider } from "./i18n";
import Analysis from "./pages/Analysis";
import Dashboard from "./pages/Dashboard";
import KnowledgeGraph from "./pages/KnowledgeGraph";
import Landscape from "./pages/Landscape";
import PaperExplorer from "./pages/PaperExplorer";
import ResearchGaps from "./pages/ResearchGaps";
import Setup from "./pages/Setup";
import Timeline from "./pages/Timeline";

export default function App() {
  return (
    <I18nProvider>
      <ProjectProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/explorer" element={<PaperExplorer />} />
              <Route path="/timeline" element={<Timeline />} />
              <Route path="/graph" element={<KnowledgeGraph />} />
              <Route path="/landscape" element={<Landscape />} />
              <Route path="/analysis" element={<Analysis />} />
              <Route path="/gaps" element={<ResearchGaps />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="*" element={<Dashboard />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ProjectProvider>
    </I18nProvider>
  );
}
