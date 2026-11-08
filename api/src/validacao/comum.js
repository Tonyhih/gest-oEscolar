import { z } from 'zod';

export const uuid = z.string().uuid('Identificador inválido.');
export const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato aaaa-mm-dd.');
export const estado = z.enum(['activo', 'inactivo']);
export const texto = (min = 1, max = 200) => z.string().trim().min(min).max(max);
export const email = z.string().trim().toLowerCase().email('Email inválido.');
export const nota = z.number().min(0).max(20);
export const notaOuNula = nota.nullable();
export const trimestre = z.coerce.number().int().min(1).max(3);
export const turno = z.enum(['manha', 'tarde', 'noite']);
export const ramo = z.enum(['geral', 'tecnico_profissional']);

export const paramsId = z.object({ id: uuid });
export const paginacao = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});
