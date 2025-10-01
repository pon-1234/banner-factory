/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compiler: {
    emotion: true
  },
  experimental: {
    typedRoutes: true
  },
  transpilePackages: ["@banner/shared"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*"
      }
    ]
  }
};

module.exports = nextConfig;
