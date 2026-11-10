import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { lerContagemStatus } from "@/lib/contagem.server";

export type { ContagemStatus } from "@/lib/contagem.server";

const inputSchema = z.object({ codiIds: z.array(z.number().int()).max(200).optional() });

/** Situação da contagem automática do CODI (só leitura do batimento). */
export const fetchContagemStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => lerContagemStatus(data.codiIds));
