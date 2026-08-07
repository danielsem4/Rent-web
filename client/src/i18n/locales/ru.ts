import type { TranslationSchema } from "./en";

const ru: TranslationSchema = {
  common: {
    sessionExpired: "Срок сессии истёк. Пожалуйста, войдите снова.",
    loading: "Загрузка...",
    logout: "Выйти",
  },
  login: {
    title: "Добро пожаловать в rent+",
    subtitle: "Войдите в свою учётную запись",
    email: "Электронная почта",
    password: "Пароль",
    submit: "Войти",
    errEmail: "Требуется корректный адрес электронной почты",
    errPassword: "Требуется пароль",
    failed: "Неверная почта или пароль",
  },
  home: {
    title: "Панель управления",
    welcome: "С возвращением, {{name}}",
  },
  notFound: {
    title: "Страница не найдена",
    back: "На главную",
  },
};

export default ru;
