import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initDashboardTheme } from "./dashboard-theme";
import "./dashboard.css";
import "./styles.css";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
// The Web clinical theme is the single source of truth for both surfaces.
import "../../frontend/src/app/dashboard-theme.css";

initDashboardTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
