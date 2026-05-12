import { signIn } from "@/auth";

export function SignInButton({
  redirectTo = "/",
  label = "Sign in",
  className = "btn btn--ghost",
  style,
}: {
  redirectTo?: string;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo });
      }}
    >
      <button type="submit" className={className} style={style}>
        {label}
      </button>
    </form>
  );
}
