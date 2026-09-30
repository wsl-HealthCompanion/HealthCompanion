import ReactDOM from 'react-dom/client';
import PoseLabPage from './components/PoseLabPage';
import './pose-lab.scss';

ReactDOM.createRoot(
  document.getElementById('pose-lab-root')!,
).render(<PoseLabPage />);
