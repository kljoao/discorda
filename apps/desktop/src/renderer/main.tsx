import {applyAccessibility,readAccessibility} from './features/Accessibility';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './refinements.css';
import './community.css';
import './server-navigation.css';
import './conversation-layout.css';
import './reliability.css';
import './features.css';

applyAccessibility(readAccessibility());
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
