import { createInertiaApp } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';
import App from '../../../src/App';
import '../../../src/index.css';

createInertiaApp({
  resolve: () => App,
  setup({ el, App: Page, props }) {
    createRoot(el).render(<Page {...props} />);
  },
  progress: {
    color: '#53715f',
  },
});
