-- Portal do encarregado de educação e do aluno: dois perfis novos, ligados às fichas existentes.
ALTER TABLE utilizadores DROP CONSTRAINT utilizadores_perfil_check;
ALTER TABLE utilizadores ADD CONSTRAINT utilizadores_perfil_check
  CHECK (perfil IN ('admin_plataforma', 'director', 'secretaria', 'coordenador', 'professor', 'encarregado', 'aluno'));

-- Cada encarregado e cada aluno tem, no máximo, uma conta (da mesma escola)
ALTER TABLE encarregados ADD COLUMN utilizador_id uuid UNIQUE;
ALTER TABLE encarregados ADD FOREIGN KEY (escola_id, utilizador_id) REFERENCES utilizadores (escola_id, id);
ALTER TABLE alunos ADD COLUMN utilizador_id uuid UNIQUE;
ALTER TABLE alunos ADD FOREIGN KEY (escola_id, utilizador_id) REFERENCES utilizadores (escola_id, id);
