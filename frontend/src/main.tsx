import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth";
import { LocaleProvider } from "./locale";
import { PlatformAuthProvider } from "./platformAuth";
import "./index.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LocaleProvider>
          <PlatformAuthProvider>
            <App />
          </PlatformAuthProvider>
        </LocaleProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
