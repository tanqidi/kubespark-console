"use client";

import { useCallback, useEffect, useState, createContext, useContext, ReactNode } from "react";
import zhCN from "@/messages/zh-CN.json";
import enUS from "@/messages/en-US.json";

export type Locale = "zh-CN" | "en-US";

const messages = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

const LOCALE_STORAGE_KEY = "kubespark-locale";

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export function getBrowserLocale(): Locale {
  if (typeof window === "undefined") return "zh-CN";
  
  const savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
  if (savedLocale && (savedLocale === "zh-CN" || savedLocale === "en-US")) {
    return savedLocale;
  }
  
  const browserLang = navigator.language || (navigator as Navigator & { userLanguage?: string }).userLanguage || "";
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

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("zh-CN");
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const browserLocale = getBrowserLocale();
      setLocale(browserLocale);
      setIsHydrated(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const handleSetLocale = (newLocale: Locale) => {
    saveLocale(newLocale);
    setLocale(newLocale);
  };

  // 水合完成前不渲染任何内容，避免闪烁
  if (!isHydrated) {
    return null;
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale: handleSetLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  
  // 如果在 Provider 外使用，返回默认值
  if (!context) {
    return { locale: "zh-CN" as Locale, setLocale: saveLocale };
  }
  
  return context;
}

export function useTranslations(namespace?: string) {
  const { locale } = useLocale();
  const currentMessages = getMessages(locale);

  return useCallback(function t(key: string, params?: Record<string, string | number>) {
    const fullKey = namespace ? `${namespace}.${key}` : key;
    const keys = fullKey.split(".");
    let value: unknown = currentMessages;
    
    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        value = key;
        break;
      }
    }

    if (typeof value === "string" && params) {
      return value.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
    }

    return typeof value === "string" ? value : key;
  }, [currentMessages, namespace]);
}
