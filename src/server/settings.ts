import "server-only";
import { cache } from "react";
import { prisma } from "./db";

export type { HelplineSetting, CompanySetting, CheckoutSetting, RetentionSetting, Settings } from "./settings-defaults";
import { DEFAULT_SETTINGS, type Settings } from "./settings-defaults";
export { DEFAULT_SETTINGS };

export type SettingKey = keyof Settings;

export const getSettings = cache(async (): Promise<Settings> => {
  const rows = await prisma.siteSetting.findMany();
  const out: Settings = structuredClone(DEFAULT_SETTINGS);
  for (const row of rows) {
    const key = row.key as SettingKey;
    if (key in out && row.value && typeof row.value === "object") {
      (out as unknown as Record<string, unknown>)[key] = { ...(out[key] as object), ...(row.value as object) };
    }
  }
  return out;
});

export async function saveSetting<K extends SettingKey>(key: K, value: Settings[K]) {
  await prisma.siteSetting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
}
