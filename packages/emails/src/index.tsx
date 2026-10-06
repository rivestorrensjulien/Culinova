import { render } from "@react-email/render";
import { MagicLinkEmail, type MagicLinkEmailProps } from "./templates/magic-link";

export { MagicLinkEmail, type MagicLinkEmailProps };

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export async function renderMagicLinkEmail(props: MagicLinkEmailProps): Promise<RenderedEmail> {
  const element = <MagicLinkEmail {...props} />;
  return {
    subject: "Votre lien de connexion à Culinova",
    html: await render(element),
    text: await render(element, { plainText: true }),
  };
}
