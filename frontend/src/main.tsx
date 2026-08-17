import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth";
import { PlatformAuthProvider } from "./platformAuth";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PlatformAuthProvider>
          <App />
        </PlatformAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
