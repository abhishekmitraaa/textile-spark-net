import { useLocation } from "react-router-dom";
import { useEffect } from "react";

/**
 * Unknown URLs are served dist/404.html at a real 404 status (see vercel.json and
 * scripts/spa-routes.mjs), and that file boots the app into this page.
 *
 * The robots meta and the distinct title are a backstop for the cases the status
 * cannot cover: a route that is in the allowlist but renders this page anyway,
 * and any environment that still serves index.html for every path (vite dev,
 * Lovable previews). Without them this page shared the marketplace's title and
 * read to a crawler as one more copy of the homepage.
 */
const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Page not found | Cosora";

    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.appendChild(robots);

    return () => {
      document.title = previousTitle;
      robots.remove();
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
