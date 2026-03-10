export default function RedirectLoading() {
  return (
    <div className="min-h-[60vh] w-full flex items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <span>Preparing your workspace...</span>
      </div>
    </div>
  );
}
