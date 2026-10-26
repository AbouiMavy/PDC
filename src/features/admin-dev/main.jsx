import React from 'react';
import { createRoot } from 'react-dom/client';
import AdminDev from './AdminDev.jsx';
import './admin-dev.css';

createRoot(document.getElementById('admin-dev-root')).render(
  <React.StrictMode><AdminDev /></React.StrictMode>
);
