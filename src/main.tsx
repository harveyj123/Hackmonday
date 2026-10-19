import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./globals.css";
import App from "./App";
import { PetWindow } from "./PetWindow";

createRoot(document.getElementById("root")!).render(
  <StrictMode>{location.hash === "#pet" ? <PetWindow /> : <App />}</StrictMode>,
);
