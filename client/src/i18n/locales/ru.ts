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
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "••••••••",
    showPassword: "Показать пароль",
    hidePassword: "Скрыть пароль",
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
  error: {
    title: "Что-то пошло не так",
    retry: "Вернуться ко входу",
  },
};

export default ru;
