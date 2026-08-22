import LoginForm from "./login-form";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {};
  const reason = Array.isArray(params.reason) ? params.reason[0] : params.reason;
  return <LoginForm timedOut={reason === "timeout"} />;
}
