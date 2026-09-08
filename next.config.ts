import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Cloudinary delivers every image on the site. next/image will only
    // optimise remote URLs from hosts listed here.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
  // 301 redirects from the WordPress crawl will live here at migration time.
};

export default nextConfig;
