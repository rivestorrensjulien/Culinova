import { Text } from "@react-email/components";
import { CallToAction, colors, EmailLayout, Paragraph } from "./layout";

export interface InvitationEmailProps {
  /** Lien direct vers /invitation/[code]. */
  url: string;
  code: string;
  expiresAt?: string | null;
  locale?: "fr" | "en";
}

const copy = {
  fr: {
    subject: "Votre invitation à Culinova",
    title: "Vous êtes invité·e à essayer Culinova",
    body: "Culinova vous aide à créer, chiffrer et illustrer vos recettes avec l'IA. L'accès est gratuit, sur invitation, pendant cette première phase.",
    code: "Votre code personnel",
    cta: "Créer mon compte",
    expires: (d: string) => `Cette invitation expire le ${d}.`,
    personal: "Ce code est personnel : merci de ne pas le partager.",
  },
  en: {
    subject: "Your invitation to Culinova",
    title: "You're invited to try Culinova",
    body: "Culinova helps you create, cost and illustrate your recipes with AI. Access is free, by invitation, during this first phase.",
    code: "Your personal code",
    cta: "Create my account",
    expires: (d: string) => `This invitation expires on ${d}.`,
    personal: "This code is personal: please do not share it.",
  },
};

export function invitationSubject(locale: "fr" | "en" = "fr"): string {
  return copy[locale].subject;
}

export function InvitationEmail({ url, code, expiresAt, locale = "fr" }: InvitationEmailProps) {
  const t = copy[locale];
  return (
    <EmailLayout lang={locale} preview={t.subject} title={t.title}>
      <Paragraph>{t.body}</Paragraph>
      <Paragraph muted>{t.code}</Paragraph>
      <Text
        style={{
          backgroundColor: colors.background,
          borderRadius: 8,
          color: colors.foreground,
          fontFamily: "Menlo, monospace",
          fontSize: 20,
          letterSpacing: 2,
          margin: 0,
          padding: "12px 16px",
          textAlign: "center",
        }}
      >
        {code}
      </Text>
      <CallToAction href={url}>{t.cta}</CallToAction>
      {expiresAt ? <Paragraph muted>{t.expires(expiresAt)}</Paragraph> : null}
      <Paragraph muted>{t.personal}</Paragraph>
    </EmailLayout>
  );
}

InvitationEmail.PreviewProps = {
  url: "https://culinova.example/invitation/CULI-ABCD-EFGH",
  code: "CULI-ABCD-EFGH",
} satisfies InvitationEmailProps;

export default InvitationEmail;
