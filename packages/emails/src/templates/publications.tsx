import { CallToAction, EmailLayout, Paragraph } from "./layout";

export interface PublicationsToApproveEmailProps {
  /** Une ligne par recette : « mardi 28 octobre · Nashville hot chicken sandwich ». */
  items: Array<{ day: string; name: string; photoStarted: boolean }>;
  /** Lien vers le calendrier des publications (Administration › Réseaux). */
  url: string;
}

export function publicationsToApproveSubject(count: number): string {
  return count > 1
    ? `Chef Ju a préparé ${count} publications à valider`
    : "Chef Ju a préparé une publication à valider";
}

/** Planification automatique : propositions à valider (aux administrateurs, en français). */
export function PublicationsToApproveEmail({ items, url }: PublicationsToApproveEmailProps) {
  return (
    <EmailLayout
      lang="fr"
      preview={publicationsToApproveSubject(items.length)}
      title="Publications à valider"
    >
      <Paragraph>
        L&apos;agent a choisi {items.length > 1 ? "ces recettes" : "cette recette"} pour les prochains jours.
        Pour chacune : Reel Instagram, vidéo TikTok et épingle Pinterest aux créneaux conseillés, puis le
        carrousel sur Instagram et TikTok quelques jours plus tard.
      </Paragraph>
      {items.map((item) => (
        <Paragraph key={`${item.day}-${item.name}`}>
          <strong>{item.day}</strong> · {item.name}
          {item.photoStarted ? " (photo en cours de génération)" : ""}
        </Paragraph>
      ))}
      <Paragraph muted>
        La vidéo et le carrousel sont prêts dans l&apos;heure. Rien n&apos;est publié sans votre validation :
        une publication non validée à l&apos;heure prévue ne part pas.
      </Paragraph>
      <CallToAction href={url}>Voir et valider</CallToAction>
    </EmailLayout>
  );
}

PublicationsToApproveEmail.PreviewProps = {
  items: [
    { day: "dimanche 25 octobre", name: "Nashville hot chicken sandwich", photoStarted: false },
    { day: "mardi 27 octobre", name: "Baghrir au miel et beurre", photoStarted: true },
  ],
  url: "https://culinova.fr/admin/reseaux",
} satisfies PublicationsToApproveEmailProps;

export default PublicationsToApproveEmail;
