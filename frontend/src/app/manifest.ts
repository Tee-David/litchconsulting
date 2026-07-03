import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Litch Consulting",
    short_name: "Litch",
    description: "Financial reporting, modelling, taxation and advisory — your Litch Consulting portal.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0a0e1a",
    theme_color: "#0a196d",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
