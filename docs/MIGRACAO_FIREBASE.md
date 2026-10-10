# Migração

Não há evidência de coleções Firebase de produção no repositório. O estado atual fica em `localStorage` e no documento provisório `restaurants/pizzaria-do-joao` criado antes desta arquitetura.

Não execute uma migração automática. Faça backup/export do Firestore, crie restaurante e membro pelo endpoint seguro, transforme cada lista local em documentos individuais nas subcoleções e só então publique as regras. O documento provisório não deve ser apagado até a validação manual.
