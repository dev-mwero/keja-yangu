export const StatsBand = () => {
  const stats = [
    { k: "40+", v: "Listings" },
    { k: "95%", v: "Happy tenants" },
    { k: "24/7", v: "Care support" },
  ];
  return (
    <section className="border-y border-border bg-muted/40">
      <div className="container py-8">
        <div className="grid grid-cols-3 gap-6">
          {stats.map((s) => (
            <div key={s.v} className="text-center">
              <div className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
                {s.k}
              </div>
              <div className="mt-1 text-xs text-muted-foreground md:text-sm">{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
