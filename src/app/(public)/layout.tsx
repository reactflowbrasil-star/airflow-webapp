import { SiteFooter, SiteHeader } from "@/ui/site-chrome";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
