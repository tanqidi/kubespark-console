"use client";

import { useEffect, useState } from "react";
import zhCN from "@/messages/zh-CN.json";
import enUS from "@/messages/en-US.json";

export type Locale = "zh-CN" | "en-US";

const messages = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

const LOCALE_STORAGE_KEY = "kubespark-locale";

export function getBrowserLocale(): Locale {
  if (typeof window === "undefined") return "zh-CN";
  
  const savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
  if (savedLocale && (savedLocale === "zh-CN" || savedLocale === "en-US")) {
    return savedLocale;
  }
  
  const browserLang = navigator.language || (navigator as any).userLanguage;
  if (browserLang.startsWith("zh")) return "zh-CN";
  return "en-US";
}

export function saveLocale(locale: Locale) {
  if (typeof window !== "undefined") {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }
}

export function getMessages(locale: Locale) {
  return messages[locale];
}

export function useLocale() {
  const [locale, setLocale] = useState<Locale>(() => getBrowserLocale());

  useEffect(() => {
    setLocale(getBrowserLocale());
  }, []);

  const handleSetLocale = (newLocale: Locale) => {
    saveLocale(newLocale);
    setLocale(newLocale);
  };

  return { locale, setLocale: handleSetLocale };
}

export function useTranslations(namespace?: string) {
  const { locale } = useLocale();
  const messages = getMessages(locale);

  return function t(key: string, params?: Record<string, string>) {
    const fullKey = namespace ? `${namespace}.${key}` : key;
    const keys = fullKey.split(".");
    let value: any = messages;
    
    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        value = key;
        break;
      }
    }

    if (typeof value === "string" && params) {
      return value.replace(/\{(\w+)\}/g, (_, k) => params[k] || `{${k}}`);
    }

    return typeof value === "string" ? value : key;
  };
}
