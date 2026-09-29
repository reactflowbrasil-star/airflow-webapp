import Image from "next/image";
import Link from "next/link";

/**
 * Marca: logo da Empurrão Digital (public/brand, gerado a partir dos arquivos
 * originais enviados pelo dono). Módulo próprio porque o cabeçalho público, os
 * painéis e o admin a usam — deixá-la junto de um deles criaria ciclo de
 * import.
 *
 * No celular vai só o símbolo: o logo horizontal tem proporção ~7,8:1 e, na
 * altura do cabeçalho, ocuparia metade da largura de uma tela de 360px.
 *
 * `fundo="escuro"` usa a versão de letras brancas e nunca troca pelo símbolo:
 * o símbolo tem círculo e "E" pretos, que sumiriam sobre o preto.
 * `inteiro` mantém o logo completo também no celular (rodapé, onde há largura).
 * `completoDesde="lg"` segura o símbolo até 1024px: no cabeçalho público, entre
 * 768 e 1023px, os links do menu aparecem e o logo completo empurrava o botão
 * "Criar conta" para fora da tela (o check:layout pegou em 8 páginas).
 */

/** Classes literais: o Tailwind só gera o que encontra escrito no código. */
const CLASSES_COMPLETO = { sm: "h-7 w-auto max-sm:hidden", lg: "h-7 w-auto max-lg:hidden" } as const;
const CLASSES_SIMBOLO = { sm: "h-9 w-9 sm:hidden", lg: "h-9 w-9 lg:hidden" } as const;
export function Logo({
  className,
  fundo = "claro",
  inteiro = false,
  completoDesde = "sm",
}: {
  className?: string;
  fundo?: "claro" | "escuro";
  inteiro?: boolean;
  completoDesde?: "sm" | "lg";
}) {
  if (fundo === "escuro") {
    return (
      <Link href="/" className={`flex shrink-0 items-center ${className ?? ""}`}>
        <Image
          src="/brand/empurrao-digital-claro.webp"
          alt="Empurrão Digital"
          width={1000}
          height={144}
          priority
          unoptimized
          className="h-8 w-auto"
        />
      </Link>
    );
  }

  return (
    <Link href="/" className={`flex shrink-0 items-center ${className ?? ""}`}>
      <Image
        src="/brand/empurrao-digital.webp"
        alt="Empurrão Digital"
        width={1000}
        height={128}
        priority
        unoptimized
        className={inteiro ? "h-7 w-auto" : CLASSES_COMPLETO[completoDesde]}
      />
      {!inteiro && (
        <Image
          src="/brand/empurrao-digital-simbolo.png"
          alt="Empurrão Digital"
          width={512}
          height={512}
          priority
          unoptimized
          className={CLASSES_SIMBOLO[completoDesde]}
        />
      )}
    </Link>
  );
}
