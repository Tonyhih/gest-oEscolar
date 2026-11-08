import { describe, it, expect } from 'vitest';
import bcrypt from 'bcrypt';
import { criarBd } from './ajuda.js';
import { criarAdministrador } from '../../src/bd/admin.js';

describe('Primeiro administrador em produção', () => {
  it('cria o administrador sem escola, com palavra-passe provisória e troca obrigatória', async () => {
    const bd = await criarBd();
    const r = await criarAdministrador(bd, { nome: 'Administração', email: 'Admin@Exemplo.ao' });
    expect(r.email).toBe('admin@exemplo.ao');
    expect(r.palavraPasse).toHaveLength(12);
    const u = (await bd.query('SELECT * FROM utilizadores')).rows[0];
    expect(u).toMatchObject({ perfil: 'admin_plataforma', escola_id: null, trocar_palavra_passe: true });
    expect(await bcrypt.compare(r.palavraPasse, u.palavra_passe_hash)).toBe(true);
    await expect(criarAdministrador(bd, { nome: 'Outro', email: 'admin@exemplo.ao' })).rejects.toThrow(/Já existe/);
  });
});
