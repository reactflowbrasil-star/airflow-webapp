import { SiteFooter } from "@/ui/site-chrome";
import { TopNav } from "@/ui/top-nav";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav />
      {children}
      <SiteFooter />
    </div>
  );
}
