import zhCN from "@/app/i18n/zh-cn.json";
import enUS from "@/app/i18n/en-us.json";

export type LocaleKey = "zh-cn" | "en-us";
const localeMap = { "zh-cn": zhCN, "en-us": enUS } as const;
export type I18nDict = (typeof localeMap)["zh-cn"];

export function getLocaleKey(): LocaleKey {
  const raw = (process.env.NEXT_PUBLIC_LOCALE || "zh-cn").toLowerCase();
  return (raw in localeMap ? raw : "zh-cn") as LocaleKey;
}

export function getI18n(): I18nDict {
  return localeMap[getLocaleKey()];
}
