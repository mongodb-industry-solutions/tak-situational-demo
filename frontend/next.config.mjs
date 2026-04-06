/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disabled: react-leaflet mounts the map twice in Strict Mode, causing
  // "Map container is already initialized" errors at runtime.
  reactStrictMode: false,
};

export default nextConfig;
