import { createRoot } from "react-dom/client";
import { ThemeProvider } from "../src/components/theme-provider";
import { Gallery } from "./Gallery";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultColorMode="dark">
    <Gallery />
  </ThemeProvider>,
);
