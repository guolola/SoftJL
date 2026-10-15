import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import "./app/styles/index.css";

const root = document.getElementById("root")!;
const application = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (root.dataset.prerendered === "true") {
  ReactDOM.hydrateRoot(root, application);
} else {
  ReactDOM.createRoot(root).render(application);
}
