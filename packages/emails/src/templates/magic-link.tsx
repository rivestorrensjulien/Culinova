import { CallToAction, EmailLayout, Paragraph } from "./layout";

export interface MagicLinkEmailProps {
  url: string;
  /** Durée de validité du lien, en minutes. */
  expiresInMinutes?: number;
  locale?: "fr" | "en";
}

const copy = {
  fr: {
    subject: "Votre lien de connexion à Culinova",
    title: "Votre lien de connexion",
    body: (m: number) =>
      `Cliquez sur le bouton ci-dessous pour vous connecter. Ce lien est valable ${m} minutes et ne peut être utilisé qu'une seule fois.`,
    cta: "Me connecter",
    ignore: "Vous n'êtes pas à l'origine de cette demande ? Ignorez simplement cet e-mail.",
  },
  en: {
    subject: "Your Culinova sign-in link",
    title: "Your sign-in link",
    body: (m: number) =>
      `Click the button below to sign in. This link is valid for ${m} minutes and can only be used once.`,
    cta: "Sign in",
    ignore: "Didn't request this? You can safely ignore this email.",
  },
};

export function magicLinkSubject(locale: "fr" | "en" = "fr"): string {
  return copy[locale].subject;
}

/** E-mail de connexion par lien magique. */
export function MagicLinkEmail({ url, expiresInMinutes = 15, locale = "fr" }: MagicLinkEmailProps) {
  const t = copy[locale];
  return (
    <EmailLayout lang={locale} preview={t.subject} title={t.title}>
      <Paragraph>{t.body(expiresInMinutes)}</Paragraph>
      <CallToAction href={url}>{t.cta}</CallToAction>
      <Paragraph muted>{t.ignore}</Paragraph>
    </EmailLayout>
  );
}

MagicLinkEmail.PreviewProps = {
  url: "https://culinova.example/connexion?token=demo",
} satisfies MagicLinkEmailProps;

export default MagicLinkEmail;
