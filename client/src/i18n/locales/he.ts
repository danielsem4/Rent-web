import type { TranslationSchema } from "./en";

const he: TranslationSchema = {
  common: {
    sessionExpired: "פג תוקף ההתחברות. יש להתחבר מחדש.",
    loading: "טוען...",
    logout: "התנתקות",
  },
  login: {
    title: "ברוכים הבאים ל-rent+",
    subtitle: "התחברו לחשבון שלכם",
    email: "אימייל",
    password: "סיסמה",
    submit: "התחברות",
    errEmail: "נדרש אימייל תקין",
    errPassword: "נדרשת סיסמה",
    failed: "אימייל או סיסמה שגויים",
  },
  home: {
    title: "לוח בקרה",
    welcome: "ברוך שובך, {{name}}",
  },
  notFound: {
    title: "הדף לא נמצא",
    back: "חזרה לדף הבית",
  },
};

export default he;
