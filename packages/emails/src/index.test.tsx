import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  renderInvitationEmail,
  renderInvitationRequestAlertEmail,
  renderInvitationRequestReceivedEmail,
  renderMagicLinkEmail,
  sendEmail,
} from "./index";

describe("e-mail de lien magique", () => {
  it("contient le lien et la durée de validité", async () => {
    const email = await renderMagicLinkEmail({
      url: "https://exemple.fr/connexion?token=abc",
      expiresInMinutes: 15,
    });
    expect(email.subject).toBe("Votre lien de connexion à Culinova");
    expect(email.html).toContain("https://exemple.fr/connexion?token=abc");
    expect(email.text).toContain("15 minutes");
  });

  it("existe en anglais", async () => {
    const email = await renderMagicLinkEmail({ url: "https://exemple.fr/x", locale: "en" });
    expect(email.subject).toBe("Your Culinova sign-in link");
    expect(email.text).toContain("valid for 15 minutes");
  });
});

describe("e-mail d'invitation", () => {
  it("contient le code et le lien", async () => {
    const email = await renderInvitationEmail({
      url: "https://exemple.fr/invitation/CULI-AAAA-BBBB",
      code: "CULI-AAAA-BBBB",
      expiresAt: "31 décembre 2026",
    });
    expect(email.subject).toBe("Votre invitation à Culinova");
    expect(email.text).toContain("CULI-AAAA-BBBB");
    expect(email.text).toContain("31 décembre 2026");
    expect(email.html).toContain("https://exemple.fr/invitation/CULI-AAAA-BBBB");
  });
});

describe("e-mails de demande d'invitation", () => {
  it("accuse réception et alerte l'administrateur", async () => {
    const received = await renderInvitationRequestReceivedEmail({ name: "Camille" });
    expect(received.subject).toBe("Votre demande d'invitation à Culinova");
    expect(received.text).toContain("Merci Camille");
    const english = await renderInvitationRequestReceivedEmail({ name: "Sam", locale: "en" });
    expect(english.text).toContain("Thank you Sam");
    const alert = await renderInvitationRequestAlertEmail({
      name: "Camille",
      email: "camille@exemple.fr",
      profile: "Cheffe à domicile",
      message: "J'aimerais chiffrer mes menus.",
      url: "https://exemple.fr/admin/demandes",
    });
    expect(alert.subject).toBe("Nouvelle demande d'invitation : Camille");
    expect(alert.text).toContain("camille@exemple.fr");
    expect(alert.html).toContain("https://exemple.fr/admin/demandes");
  });
});

describe("envoi sans Resend", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("écrit l'e-mail dans la boîte d'envoi locale", async () => {
    const dir = await mkdtemp(join(tmpdir(), "outbox-"));
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_OUTBOX_DIR", dir);
    vi.spyOn(console, "info").mockImplementation(() => {});
    await sendEmail({
      to: "a@b.fr",
      subject: "Test",
      html: "<p>x</p>",
      text: "x",
      tag: "magic-link",
      url: "https://u",
    });
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    const saved = JSON.parse(await readFile(join(dir, files[0]!), "utf8"));
    expect(saved).toMatchObject({ to: "a@b.fr", tag: "magic-link", url: "https://u" });
  });

  it("refuse d'envoyer en production sans clé", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.EMAIL_OUTBOX_DIR;
    await expect(sendEmail({ to: "a@b.fr", subject: "T", html: "", text: "", tag: "t" })).rejects.toThrow(
      /RESEND_API_KEY/,
    );
  });
});
