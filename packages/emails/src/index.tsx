import { render } from "@react-email/render";
import { InvitationEmail, type InvitationEmailProps, invitationSubject } from "./templates/invitation";
import {
  InvitationRequestAlertEmail,
  type InvitationRequestAlertEmailProps,
  invitationRequestAlertSubject,
  InvitationRequestReceivedEmail,
  type InvitationRequestReceivedEmailProps,
  invitationRequestReceivedSubject,
} from "./templates/invitation-request";
import { MagicLinkEmail, type MagicLinkEmailProps, magicLinkSubject } from "./templates/magic-link";
import {
  PublicationsToApproveEmail,
  type PublicationsToApproveEmailProps,
  publicationsToApproveSubject,
} from "./templates/publications";

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

export async function renderInvitationRequestReceivedEmail(
  props: InvitationRequestReceivedEmailProps,
): Promise<RenderedEmail> {
  const element = <InvitationRequestReceivedEmail {...props} />;
  return {
    subject: invitationRequestReceivedSubject(props.locale),
    html: await render(element),
    text: await render(element, { plainText: true }),
  };
}

export async function renderInvitationRequestAlertEmail(
  props: InvitationRequestAlertEmailProps,
): Promise<RenderedEmail> {
  const element = <InvitationRequestAlertEmail {...props} />;
  return {
    subject: invitationRequestAlertSubject(props.name),
    html: await render(element),
    text: await render(element, { plainText: true }),
  };
}

export async function renderPublicationsToApproveEmail(
  props: PublicationsToApproveEmailProps,
): Promise<RenderedEmail> {
  const element = <PublicationsToApproveEmail {...props} />;
  return {
    subject: publicationsToApproveSubject(props.items.length),
    html: await render(element),
    text: await render(element, { plainText: true }),
  };
}
