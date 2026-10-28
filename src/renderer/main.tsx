import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/app.css';

const container = document.getElementById('root');
if (!container) throw new Error('Renderer root element is missing');

createRoot(container).render(<App />);
