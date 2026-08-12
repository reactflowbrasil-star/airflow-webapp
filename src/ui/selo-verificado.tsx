/**
 * Selo de confiabilidade VERIFICADO (biometria facial) — §8.
 *
 * Só aparece quando o prestador tem um documento SELFIE aprovado (a prova
 * mais forte do cadastro: liveness + comparação facial pelo provedor). O
 * componente é puro — quem decide a exibição é o servidor, com base no
 * estado real do cadastro.
 */
export function SeloVerificado({
  detalhe = "biometria facial",
  destaque = false,
}: {
  detalhe?: string;
  destaque?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 ${
        destaque
          ? "bg-[linear-gradient(90deg,var(--ok-text),var(--accent))] border-transparent text-white shadow-(--shadow-float)"
          : "border-[var(--ok-border)] bg-[var(--ok-soft)] text-[var(--ok-text)]"
      }`}
    >
      <i className="ph-duotone ph-shield-check text-base" aria-hidden="true" />
      <span className="text-[0.8125rem] leading-none font-extrabold tracking-[-0.01em]">
        VERIFICADO
      </span>
      <span
        className={`hidden text-[0.75rem] leading-none font-medium sm:inline ${
          destaque ? "text-white/85" : "text-muted"
        }`}
      >
        {detalhe}
      </span>
    </span>
  );
}
