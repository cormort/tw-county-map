import { createRoot } from 'react-dom/client';
import { App } from './App';
import { migrateLegacyUrl } from './lib/legacyUrl';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('找不到 #root');
migrateLegacyUrl();
createRoot(root).render(<App />);
