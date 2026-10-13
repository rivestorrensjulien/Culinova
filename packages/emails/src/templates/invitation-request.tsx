import { CallToAction, EmailLayout, Paragraph } from "./layout";

export interface InvitationRequestReceivedEmailProps {
  name: string;
  locale?: "fr" | "en";
}

const received = {
  fr: {
    subject: "Votre demande d'invitation à Culinova",
    title: (name: string) => `Merci ${name}, votre demande est bien arrivée`,
    body: "Culinova est ouvert sur invitation pendant cette première phase, pour accompagner chaque personne de près. Nous lisons chaque demande et revenons vers vous dès qu'une place se libère.",
    next: "Si votre demande est acceptée, vous recevrez un code personnel et un lien pour créer votre compte.",
    ignore: "Vous n'êtes pas à l'origine de cette demande ? Ignorez simplement cet e-mail.",
  },
  en: {
    subject: "Your Culinova invitation request",
    title: (name: string) => `Thank you ${name}, your request has arrived`,
    body: "Culinova is invitation-only during this first phase, so we can support everyone closely. We read every request and will get back to you as soon as a spot opens up.",
    next: "If your request is accepted, you will receive a personal code and a link to create your account.",
    ignore: "Didn't make this request? Simply ignore this email.",
  },
};

export function invitationRequestReceivedSubject(locale: "fr" | "en" = "fr"): string {
  return received[locale].subject;
}

export function InvitationRequestReceivedEmail({ name, locale = "fr" }: InvitationRequestReceivedEmailProps) {
  const t = received[locale];
  return (
    <EmailLayout lang={locale} preview={t.subject} title={t.title(name)}>
      <Paragraph>{t.body}</Paragraph>
      <Paragraph>{t.next}</Paragraph>
      <Paragraph muted>{t.ignore}</Paragraph>
    </EmailLayout>
  );
}

InvitationRequestReceivedEmail.PreviewProps = {
  name: "Camille",
} satisfies InvitationRequestReceivedEmailProps;

export interface InvitationRequestAlertEmailProps {
  name: string;
  email: string;
  profile: string | null;
  message: string | null;
  /** Lien vers la page « Demandes » de l'administration. */
  url: string;
}

export function invitationRequestAlertSubject(name: string): string {
  return `Nouvelle demande d'invitation : ${name}`;
}

/** Alerte envoyée aux administrateurs (toujours en français). */
export function InvitationRequestAlertEmail({
  name,
  email,
  profile,
  message,
  url,
}: InvitationRequestAlertEmailProps) {
  return (
    <EmailLayout
      lang="fr"
      preview={invitationRequestAlertSubject(name)}
      title="Nouvelle demande d'invitation"
    >
      <Paragraph>
        {name} ({email}){profile ? ` · ${profile}` : ""}
      </Paragraph>
      {message ? <Paragraph muted>« {message} »</Paragraph> : null}
      <CallToAction href={url}>Voir les demandes</CallToAction>
    </EmailLayout>
  );
}

export default InvitationRequestReceivedEmail;
