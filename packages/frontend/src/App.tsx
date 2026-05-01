import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Works from './pages/Works';
import NovelDetail from './pages/NovelDetail';
import ChapterWorkspace from './pages/ChapterWorkspace';
import AgentConfig from './pages/AgentConfig';
import ModelConfig from './pages/ModelConfig';
import Subscription from './pages/Subscription';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/works" element={<Works />} />
      <Route path="/novels/:id" element={<NovelDetail />} />
      <Route path="/novels/:id/chapters/:chapterNumber" element={<ChapterWorkspace />} />
      <Route path="/agents" element={<AgentConfig />} />
      <Route path="/models" element={<ModelConfig />} />
      <Route path="/subscription" element={<Subscription />} />
    </Routes>
  );
}
