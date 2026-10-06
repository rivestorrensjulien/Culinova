import { render } from "@react-email/render";
import { InvitationEmail, type InvitationEmailProps, invitationSubject } from "./templates/invitation";
import { MagicLinkEmail, type MagicLinkEmailProps, magicLinkSubject } from "./templates/magic-link";

export { InvitationEmail, type InvitationEmailProps, MagicLinkEmail, type MagicLinkEmailProps };
export { sendEmail, type OutgoingEmail } from "./send";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export async function renderMagicLinkEmail(props: MagicLinkEmailProps): Promise<RenderedEmail> {
  const element = <MagicLinkEmail {...props} />;
  return {
    subject: magicLinkSubject(props.locale),
    html: await render(element),
    text: await render(element, { plainText: true }),
  };
}

export async function renderInvitationEmail(props: InvitationEmailProps): Promise<RenderedEmail> {
  const element = <InvitationEmail {...props} />;
  return {
    subject: invitationSubject(props.locale),
    html: await render(element),
    text: await render(element, { plainText: true }),
  };
}
