import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stellora — Premium Finds",
    short_name: "Stellora",
    description:
      "Sterling & artificial jewellery, hair extensions, vanity essentials and handbags.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b0d",
    theme_color: "#801d3f",
    icons: [
      {
        src: "/images/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
