import type { TranslationSchema } from "./en";

const ar: TranslationSchema = {
  common: {
    sessionExpired: "انتهت صلاحية جلستك. الرجاء تسجيل الدخول مرة أخرى.",
    loading: "جارٍ التحميل...",
    logout: "تسجيل الخروج",
  },
  theme: {
    toggle: "تبديل السمة",
    light: "التبديل إلى الوضع الفاتح",
    dark: "التبديل إلى الوضع الداكن",
  },
  login: {
    title: "مرحبًا بك في rent+",
    subtitle: "سجّل الدخول إلى حسابك",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "••••••••",
    showPassword: "إظهار كلمة المرور",
    hidePassword: "إخفاء كلمة المرور",
    submit: "تسجيل الدخول",
    errEmail: "مطلوب بريد إلكتروني صالح",
    errPassword: "كلمة المرور مطلوبة",
    failed: "بريد إلكتروني أو كلمة مرور غير صحيحة",
  },
  home: {
    title: "لوحة التحكم",
    welcome: "مرحبًا بعودتك، {{name}}",
  },
  notFound: {
    title: "الصفحة غير موجودة",
    back: "العودة إلى الرئيسية",
  },
  error: {
    title: "حدث خطأ ما",
    retry: "العودة إلى تسجيل الدخول",
  },
};

export default ar;
