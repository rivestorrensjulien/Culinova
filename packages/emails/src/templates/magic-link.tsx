import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface MagicLinkEmailProps {
  url: string;
  /** Durée de validité du lien, en minutes. */
  expiresInMinutes?: number;
}

const colors = {
  background: "#faf6ef",
  surface: "#ffffff",
  foreground: "#1f1a16",
  muted: "#6e6359",
  primary: "#a84a24",
  border: "#e5dbcd",
};

/** E-mail de connexion par lien magique (utilisé à partir du jalon J1). */
export function MagicLinkEmail({ url, expiresInMinutes = 15 }: MagicLinkEmailProps) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>Votre lien de connexion à Culinova</Preview>
      <Body
        style={{
          backgroundColor: colors.background,
          fontFamily: "Georgia, serif",
          margin: 0,
          padding: "32px 0",
        }}
      >
        <Container
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            maxWidth: 480,
            padding: 32,
          }}
        >
          <Text style={{ color: colors.primary, fontSize: 13, letterSpacing: 2, margin: 0 }}>CULINOVA</Text>
          <Heading style={{ color: colors.foreground, fontSize: 24, fontWeight: 400, margin: "16px 0" }}>
            Votre lien de connexion
          </Heading>
          <Text
            style={{ color: colors.foreground, fontFamily: "Helvetica, Arial, sans-serif", fontSize: 15 }}
          >
            Cliquez sur le bouton ci-dessous pour vous connecter. Ce lien est valable {expiresInMinutes}{" "}
            minutes et ne peut être utilisé qu&apos;une seule fois.
          </Text>
          <Section style={{ margin: "24px 0" }}>
            <Button
              href={url}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 999,
                color: "#fffaf4",
                fontFamily: "Helvetica, Arial, sans-serif",
                fontSize: 15,
                padding: "12px 24px",
              }}
            >
              Me connecter
            </Button>
          </Section>
          <Text style={{ color: colors.muted, fontFamily: "Helvetica, Arial, sans-serif", fontSize: 13 }}>
            Vous n&apos;êtes pas à l&apos;origine de cette demande ? Ignorez simplement cet e-mail.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

MagicLinkEmail.PreviewProps = {
  url: "https://culinova.example/connexion?token=demo",
} satisfies MagicLinkEmailProps;

export default MagicLinkEmail;
