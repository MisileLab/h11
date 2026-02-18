import React from "react";
import ReactDOM from "react-dom/client";
import CaptureBar from "./pages/CaptureBar";
import PileWindow from "./pages/PileWindow";

const path = window.location.pathname;
const root = document.getElementById("root") as HTMLElement;

if (path === "/capture") {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <CaptureBar />
    </React.StrictMode>,
  );
} else {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <PileWindow />
    </React.StrictMode>,
  );
}
