import { signOut } from "@/auth";

export function SignOutButton({
  redirectTo = "/",
  label = "Sign out",
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
        await signOut({ redirectTo });
      }}
    >
      <button type="submit" className={className} style={style}>
        {label}
      </button>
    </form>
  );
}
