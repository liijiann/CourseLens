import { Navigate, Route, Routes } from 'react-router-dom';

import HomePage from './pages/HomePage';
import StudyPage from './pages/StudyPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/study/:sessionId" element={<StudyPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
