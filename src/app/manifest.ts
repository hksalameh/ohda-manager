import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "نظام إدارة العُهَد",
    short_name: "إدارة العهد",
    description: "نظام إدارة العهد واللوازم لعدة مراكز",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f172a",
    dir: "rtl",
    lang: "ar",
    icons: [
      {
        src: "/ohda-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
