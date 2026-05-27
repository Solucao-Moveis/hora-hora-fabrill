-- Renomear duas máquinas da área Montagem
UPDATE machines SET name = 'Estação de montagem cadeira' WHERE id = '31d686f3-fe5b-4967-8c55-27a63bf334d4';
UPDATE machines SET name = 'Estação de montagem mesa' WHERE id = '8edae5d3-2c62-41c1-b2ce-5263e7ad5bf1';

-- Excluir máquinas antigas de montagem que não serão mais usadas
DELETE FROM production_entries WHERE machine_id IN (
  SELECT id FROM machines WHERE area_id = '24dc96c7-fcd3-45b1-8392-f3e58c519288' 
  AND id NOT IN ('31d686f3-fe5b-4967-8c55-27a63bf334d4', '8edae5d3-2c62-41c1-b2ce-5263e7ad5bf1')
);

DELETE FROM production_goals WHERE machine_id IN (
  SELECT id FROM machines WHERE area_id = '24dc96c7-fcd3-45b1-8392-f3e58c519288' 
  AND id NOT IN ('31d686f3-fe5b-4967-8c55-27a63bf334d4', '8edae5d3-2c62-41c1-b2ce-5263e7ad5bf1')
);

DELETE FROM machine_operators WHERE machine_id IN (
  SELECT id FROM machines WHERE area_id = '24dc96c7-fcd3-45b1-8392-f3e58c519288' 
  AND id NOT IN ('31d686f3-fe5b-4967-8c55-27a63bf334d4', '8edae5d3-2c62-41c1-b2ce-5263e7ad5bf1')
);

DELETE FROM meta_justifications WHERE machine_id IN (
  SELECT id FROM machines WHERE area_id = '24dc96c7-fcd3-45b1-8392-f3e58c519288' 
  AND id NOT IN ('31d686f3-fe5b-4967-8c55-27a63bf334d4', '8edae5d3-2c62-41c1-b2ce-5263e7ad5bf1')
);

DELETE FROM machines WHERE area_id = '24dc96c7-fcd3-45b1-8392-f3e58c519288' 
  AND id NOT IN ('31d686f3-fe5b-4967-8c55-27a63bf334d4', '8edae5d3-2c62-41c1-b2ce-5263e7ad5bf1');