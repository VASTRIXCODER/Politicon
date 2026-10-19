/** The page's one h1 ("AI Policy Guide"), with the display face's italic violet accent. */
export function GuideTitle() {
  return (
    <h1 className="font-display text-xl font-medium leading-tight tracking-[-0.01em] text-ink sm:text-2xl">
      AI Policy <em className="font-normal text-primary-300">Guide</em>
    </h1>
  );
}

/** What the guide is: education from the user's profile ranges, never partisan. */
export function GuideStatus() {
  return (
    <p className="mt-0.5 flex items-center gap-1.5 text-meta text-muted">
      <span aria-hidden="true" className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary-300 shadow-[0_0_8px_rgb(var(--c-violet)/0.9)]" />
      <span>Profile loaded • Non-partisan • Dollar-specific answers</span>
    </p>
  );
}
