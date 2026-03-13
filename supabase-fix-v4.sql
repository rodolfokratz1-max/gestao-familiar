-- Corrige a constraint para aceitar o tipo 'membro'
ALTER TABLE pessoas DROP CONSTRAINT IF EXISTS pessoas_tipo_check;
ALTER TABLE pessoas ADD CONSTRAINT pessoas_tipo_check 
  CHECK (tipo IN ('cliente', 'fornecedor', 'ambos', 'membro'));
