import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Navbar from './components/Navbar';
import Scripts from './pages/Scripts';
import Queue from './pages/Queue';
import Schedule from './pages/Schedule';
import Settings from './pages/Settings';

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <div className="min-h-screen bg-[#0f0f0f] text-gray-100">
          <Navbar />
          <Routes>
            <Route path="/" element={<Scripts />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </HashRouter>
    </AppProvider>
  );
}
