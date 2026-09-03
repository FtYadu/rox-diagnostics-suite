import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { resources } from "./resources";

/** Single i18next instance, initialised once for SSR and the browser. */
if (!i18next.isInitialized) {
  void i18next.use(initReactI18next).init({
    resources,
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export const i18n = i18next;

export const setLanguage = (language: string) => {
  if (i18next.language !== language) void i18next.changeLanguage(language);
};
