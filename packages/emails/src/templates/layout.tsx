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
import type { ReactNode } from "react";

export const colors = {
  background: "#faf6ef",
  surface: "#ffffff",
  foreground: "#1f1a16",
  muted: "#6e6359",
  primary: "#a84a24",
  border: "#e5dbcd",
};

const sans = "Helvetica, Arial, sans-serif";

export function EmailLayout({
  lang,
  preview,
  title,
  children,
}: {
  lang: string;
  preview: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Html lang={lang}>
      <Head />
      <Preview>{preview}</Preview>
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
            {title}
          </Heading>
          {children}
        </Container>
      </Body>
    </Html>
  );
}

export function Paragraph({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <Text
      style={{ color: muted ? colors.muted : colors.foreground, fontFamily: sans, fontSize: muted ? 13 : 15 }}
    >
      {children}
    </Text>
  );
}

export function CallToAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: "24px 0" }}>
      <Button
        href={href}
        style={{
          backgroundColor: colors.primary,
          borderRadius: 999,
          color: "#fffaf4",
          fontFamily: sans,
          fontSize: 15,
          padding: "12px 24px",
        }}
      >
        {children}
      </Button>
    </Section>
  );
}
