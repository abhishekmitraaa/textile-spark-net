import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface BuyerRouteShellProps {
  title: string;
  description: string;
  relatedHref?: string;
  relatedLabel?: string;
}

const BuyerRouteShell = ({
  title,
  description,
  relatedHref = "/home/new-arrivals",
  relatedLabel = "Open buyer home",
}: BuyerRouteShellProps) => {
  const location = useLocation();
  const params = useParams();
  const routeParams = Object.entries(params)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" • ");

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col">
        <Link to="/" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to landing
        </Link>

        <Card className="mt-6 border-dashed border-border/70 shadow-sm">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-accent/10 text-accent hover:bg-accent/10">Route scaffold</Badge>
              <Badge variant="secondary">Phase 1</Badge>
            </div>

            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              {description}
            </p>

            <div className="mt-6 rounded-xl bg-muted/50 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Current route
              </p>
              <p className="mt-1 break-all font-mono text-sm text-foreground">{location.pathname}</p>
              {routeParams ? (
                <p className="mt-2 text-xs text-muted-foreground">Params: {routeParams}</p>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Link to={relatedHref}>
                  <Home className="mr-2 h-4 w-4" />
                  {relatedLabel}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Go to landing
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BuyerRouteShell;