"use client";

import { Card, CardBody, Notice } from "@culinova/ui";
import { useTranslations } from "next-intl";
import type { RecipeView } from "@/server/generation/view";
import { CopyButton } from "./copy-button";

export function SocialContentView({ social }: { social: RecipeView["social"] }) {
  const t = useTranslations("Recipe");
  const tw = useTranslations("Wizard");
  if (social.length === 0) return <Notice>{tw("noSocial")}</Notice>;
  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="social">
      {social.map((item) => {
        const text = [
          item.title,
          item.description,
          item.caption,
          item.hashtags.length ? item.hashtags.map((h) => `#${h}`).join(" ") : null,
        ]
          .filter(Boolean)
          .join("\n\n");
        return (
          <Card key={item.platform}>
            <CardBody className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl">{t(`platforms.${item.platform as "generic"}`)}</h3>
                <CopyButton text={text} />
              </div>
              <p className="text-sm whitespace-pre-line">{text}</p>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
