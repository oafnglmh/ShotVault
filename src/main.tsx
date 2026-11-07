import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { VenueProvider } from "@/app/VenueContext";
import { router } from "@/app/router";
import { pruneOldHighlights } from "@/features/highlights/highlightRepository";
import "./index.css";

void pruneOldHighlights();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VenueProvider>
      <RouterProvider router={router} />
    </VenueProvider>
  </StrictMode>,
);
