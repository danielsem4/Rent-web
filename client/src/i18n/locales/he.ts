import type { TranslationSchema } from "./en";

const he: TranslationSchema = {
  common: {
    sessionExpired: "פג תוקף ההתחברות. יש להתחבר מחדש.",
    loading: "טוען...",
    logout: "התנתקות",
  },
  theme: {
    toggle: "החלפת ערכת נושא",
    light: "מעבר למצב בהיר",
    dark: "מעבר למצב כהה",
  },
  login: {
    title: "ברוכים הבאים ל-rent+",
    subtitle: "התחברו לחשבון שלכם",
    email: "אימייל",
    password: "סיסמה",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "••••••••",
    showPassword: "הצג סיסמה",
    hidePassword: "הסתר סיסמה",
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
  error: {
    title: "משהו השתבש",
    retry: "חזרה להתחברות",
  },
};

export default he;
