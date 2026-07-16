import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ErrorState";
import { GITHUB_REPO, getReleasesPageUrl } from "@/lib/config";
import {
  detectPlatform,
  fetchLatestRelease,
  formatBytes,
  type OS,
  type PlatformDownloads,
} from "@/lib/download";
import {
  Download as DownloadIcon,
  Apple,
  Monitor,
  Terminal,
  ExternalLink,
  Github,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";

const OS_ICON: Record<OS, typeof Monitor> = {
  windows: Monitor,
  macos: Apple,
  linux: Terminal,
  unknown: Monitor,
};

const OS_LABEL: Record<OS, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  unknown: "your computer",
};

function PlatformCard({
  platform,
  recommended,
}: {
  platform: PlatformDownloads;
  recommended: boolean;
}) {
  const Icon = OS_ICON[platform.os];
  return (
    <Card
      className={
        recommended
          ? "border-primary ring-1 ring-primary/40 shadow-md"
          : undefined
      }
      data-testid={`platform-card-${platform.os}${platform.arch ? "-" + platform.arch : ""}`}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Icon className="w-5 h-5" />
            {platform.label}
          </CardTitle>
          {recommended && (
            <Badge className="gap-1 bg-primary text-primary-foreground">
              <CheckCircle2 className="w-3 h-3" /> Recommended for you
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {platform.installers.map((installer) => (
          <a
            key={installer.url}
            href={installer.url}
            className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-accent hover:text-accent-foreground transition-colors group"
            data-testid={`download-link-${installer.name}`}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="p-2 bg-muted rounded-md shrink-0 group-hover:bg-background/50">
                <DownloadIcon className="w-4 h-4" />
              </div>
              <div className="truncate">
                <p className="text-sm font-medium truncate">{installer.name}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono uppercase">{installer.format.replace(".", "")}</span>
                  {installer.size ? ` · ${formatBytes(installer.size)}` : ""}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0">Download</Badge>
          </a>
        ))}
      </CardContent>
    </Card>
  );
}

export default function Download() {
  const detected = useMemo(() => detectPlatform(), []);

  const releaseQuery = useQuery({
    queryKey: ["latest-release", GITHUB_REPO],
    queryFn: fetchLatestRelease,
    enabled: !!GITHUB_REPO,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const releasesPageUrl = getReleasesPageUrl();

  const header = (
    <div className="flex justify-between items-end border-b pb-4">
      <div>
        <h1 className="text-4xl font-serif font-bold tracking-tight">Download the desktop app</h1>
        <p className="text-muted-foreground mt-2">
          Get the installer for {OS_LABEL[detected.os]} and run Local Document RAG natively on your machine.
        </p>
      </div>
      {releasesPageUrl && (
        <Button variant="outline" asChild>
          <a href={releasesPageUrl} target="_blank" rel="noreferrer">
            <Github className="w-4 h-4 mr-2" /> All releases
          </a>
        </Button>
      )}
    </div>
  );

  // Not configured: don't fabricate links — explain how to enable downloads.
  if (!GITHUB_REPO) {
    return (
      <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
        {header}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="w-5 h-5" /> Downloads not configured yet
            </CardTitle>
            <CardDescription>
              Installers are published to GitHub Releases by the desktop build workflow.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Set the <code className="font-mono text-foreground">VITE_GITHUB_REPO</code> environment
              variable (as <code className="font-mono text-foreground">owner/repo</code>) for the web
              app, then reload this page. Once a release is published, the correct installer for each
              operating system will appear here automatically.
            </p>
            <p>
              Windows gets an <span className="font-mono">.msi</span>/<span className="font-mono">.exe</span>,
              macOS a <span className="font-mono">.dmg</span> (Apple Silicon &amp; Intel), and Linux a{" "}
              <span className="font-mono">.deb</span>/<span className="font-mono">.AppImage</span>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (releaseQuery.isLoading) {
    return (
      <div className="p-8 space-y-8 max-w-5xl mx-auto">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  if (releaseQuery.isError) {
    return (
      <div className="p-8 space-y-8 max-w-5xl mx-auto">
        {header}
        <ErrorState
          title="Could not load the latest release"
          error={releaseQuery.error}
          onRetry={() => releaseQuery.refetch()}
          isRetrying={releaseQuery.isFetching}
        />
        {releasesPageUrl && (
          <p className="text-sm text-muted-foreground text-center">
            You can also browse{" "}
            <a href={releasesPageUrl} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
              all releases on GitHub
            </a>
            .
          </p>
        )}
      </div>
    );
  }

  const release = releaseQuery.data!;

  // Order platforms so the visitor's detected OS comes first.
  const sorted = [...release.platforms].sort((a, b) => {
    const aMatch = a.os === detected.os ? 0 : 1;
    const bMatch = b.os === detected.os ? 0 : 1;
    return aMatch - bMatch;
  });

  // A platform is "recommended" when its OS matches; for macOS, prefer the arch
  // match when we could detect it, otherwise recommend all macOS builds.
  const isRecommended = (p: PlatformDownloads): boolean => {
    if (p.os !== detected.os) return false;
    if (p.os === "macos" && detected.arch !== "unknown" && p.arch) {
      return p.arch === detected.arch;
    }
    return true;
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      {header}

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <Badge variant="secondary" className="font-mono">{release.version}</Badge>
        <span>{release.name}</span>
        {release.publishedAt && (
          <span>· Published {format(new Date(release.publishedAt), "MMM d, yyyy")}</span>
        )}
        <a
          href={release.htmlUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline hover:text-foreground"
        >
          Release notes <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {sorted.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No installers in the latest release</CardTitle>
            <CardDescription>
              The latest release doesn't contain any recognized desktop installers yet.
            </CardDescription>
          </CardHeader>
          {releasesPageUrl && (
            <CardContent>
              <Button variant="outline" asChild>
                <a href={releasesPageUrl} target="_blank" rel="noreferrer">
                  <Github className="w-4 h-4 mr-2" /> Browse all releases
                </a>
              </Button>
            </CardContent>
          )}
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {sorted.map((platform) => (
            <PlatformCard
              key={`${platform.os}-${platform.arch ?? "all"}`}
              platform={platform}
              recommended={isRecommended(platform)}
            />
          ))}
        </div>
      )}

      {detected.os === "macos" && (
        <p className="text-xs text-muted-foreground max-w-2xl">
          On macOS, an unsigned build may show a Gatekeeper warning on first launch — right-click the
          app and choose <span className="font-medium">Open</span>, then confirm.
        </p>
      )}
    </div>
  );
}
