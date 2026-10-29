-- Enable only the two demo analysts already declared by the seed.
UPDATE "User" SET "demoLoginEnabled" = true
WHERE "role" = 'ANALYST'
  AND "email" IN ('rafael.lima@nexo.com.br', 'marta.alves@nexo.com.br');
