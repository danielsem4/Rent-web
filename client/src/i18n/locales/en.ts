const en = {
  common: {
    sessionExpired: "Your session has expired. Please log in again.",
    loading: "Loading...",
    logout: "Log out",
  },
  login: {
    title: "Welcome to rent+",
    subtitle: "Sign in to your account",
    email: "Email",
    password: "Password",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "••••••••",
    showPassword: "Show password",
    hidePassword: "Hide password",
    submit: "Sign in",
    errEmail: "A valid email is required",
    errPassword: "Password is required",
    failed: "Invalid email or password",
  },
  home: {
    title: "Dashboard",
    welcome: "Welcome back, {{name}}",
  },
  notFound: {
    title: "Page not found",
    back: "Go home",
  },
  error: {
    title: "Something went wrong",
    retry: "Back to login",
  },
};

export default en;
export type TranslationSchema = typeof en;
