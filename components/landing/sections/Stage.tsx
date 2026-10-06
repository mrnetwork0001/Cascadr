/**
 * One stage of the agent's loop: a large thin numeral, the stage name, the
 * technology it runs on, what it does, and the rule it applies as a code chip.
 */
export function Stage({
  n,
  name,
  stack,
  body,
  code,
}: {
  n: string;
  name: string;
  stack: string;
  body: string;
  code: string;
}) {
  return (
    <article className="glass flex min-w-0 flex-col rounded-[24px] p-6 md:rounded-[28px] md:p-8">
      <div className="flex items-start justify-between gap-4">
        <span aria-hidden="true" className="num text-[46px] font-[200] leading-[0.9] tracking-[-0.03em] text-ink md:text-[56px]">
          {n}
        </span>
        <span className="glass-pill max-w-[65%] truncate px-3 py-1.5 text-[12px] font-[470] tracking-[-0.005em] text-muted-2">
          {stack}
        </span>
      </div>
      <h3 className="mt-6 text-[24px] font-[420] tracking-[-0.03em] text-ink md:text-[27px]">
        <span className="sr-only">{n}. </span>
        {name}
      </h3>
      <p className="mt-3 max-w-[46rem] flex-1 text-[15px] leading-[1.62] text-term-text">{body}</p>
      <code className="mt-6 block whitespace-pre-wrap break-words rounded-[16px] border border-white/80 bg-white/50 px-4 py-3 font-mono text-[12.5px] leading-[1.6] text-accent-deep shadow-[0_0_0_1px_rgba(120,145,180,0.14),inset_1px_1px_0_rgba(255,255,255,0.6)]">
        {code}
      </code>
    </article>
  );
}
