import { cx } from "@culinova/ui";

/**
 * « Relue par Chef Ju » : la version affichée a été relue par l'administrateur (décision de Julien
 * du 11/11 : rassurer face à l'IA). Le libellé est passé par l'appelant (pages serveur et client).
 */
export function ChefBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground",
        className,
      )}
      data-testid="chef-badge"
    >
      <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current stroke-[1.7]">
        <path d="M7 14.5V19h10v-4.5M7 14.5A4 4 0 0 1 6 7a4.5 4.5 0 0 1 6-2.5A4.5 4.5 0 0 1 18 7a4 4 0 0 1-1 7.5z" />
        <path d="M9.5 12.5l1.8 1.8 3.3-3.6" />
      </svg>
      {label}
    </span>
  );
}

/** Les astuces du chef, mises en avant (au moins deux par recette depuis recipe.generate@14). */
export function ChefTips({ title, tips }: { title: string; tips: string[] }) {
  if (tips.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-soft p-6" data-testid="chef-tips">
      <h3 className="flex items-center gap-2 font-display text-2xl">
        <span aria-hidden>👨‍🍳</span>
        {title}
      </h3>
      <ul className="flex flex-col gap-3">
        {tips.map((tip) => (
          <li key={tip} className="flex gap-3 leading-relaxed">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
