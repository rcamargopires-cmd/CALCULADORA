import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import OperationalTools from './components/OperationalTools';
import TradeCheckShell from './components/TradeCheckShell';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
    <OperationalTools />
    <TradeCheckShell />
  </React.StrictMode>
);