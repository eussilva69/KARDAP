---
name: form-validation-zod-react-hook-form
description: "Projetar formulários robustos com Zod/React Hook Form quando a stack justificar, validação cliente-servidor e acessibilidade."
---

# form-validation-zod-react-hook-form

## Quando usar
React com formulários complexos, campos condicionais, regras assíncronas, duplicidade e problemas de UX na validação.

## Informações necessárias
Schema/backend, React stack e bibliotecas já instaladas, estados, tipos de dados, fluxos de erro e submissão.

## Procedimento de execução
1. Examine se Zod e React Hook Form já são usados; se não, avalie custo/benefício e preserve soluções adequadas existentes.
2. Defina schema com validação de tipo, formato, limites e campos condicionais; backend valida **novamente** tudo com regras autoritativas.
3. Inputs devem ter label visível, `autocomplete`/`inputMode` apropriado, instruções e associação programática de erros (`aria-describedby`, `aria-invalid`).
4. Use validação após blur ou submit conforme fricção, com debounce apenas em verificações custosas como nome/e-mail disponíveis.
5. Faça cancelamento ou versionamento de requisições assíncronas para impedir resposta antiga de sobrescrever estado atual.
6. Preserve valores e contexto em erro, impeça double submit, anuncie resultado ao leitor de tela e foque primeiro erro quando útil.
7. Modele estados idle/submitting/success/error, timeout/retry e tratamento de falha de conexão.
8. Segurança de persistência: evite gravar CPF, senhas, tokens, documentos e outras PII em storage sem necessidade/autorização.

## Casos de teste e validação
- Campos inválidos mostram erro específico e acionável sem bloquear digitação.
- Seleção de teclado mobile, zoom nativo e navegação TAB/SHIFT-TAB funcionam.
- Screen reader lê labels, erros e status; foco volta corretamente após modais.
- Respostas assíncronas fora de ordem não alteram validação de valor mais recente.
- Falha backend preserva input sem duplicar operação; backend rejeita entrada inválida.
- Validação de formulário complexo não aciona rerenders excessivos em cada tecla.

## Evidências e entregáveis
Schema, componentes acessíveis, provas de integração API, testes de teclado e erro, análise de bundle caso nova dependência.

## Antipadrões e limites
Não tratar `type=number` como escolha automática para documento/telefone, onde zeros à esquerda importam; não remover validação do servidor.


## Regras operacionais transversais
- Primeiro confira se o fluxo realmente existe e se a skill é pertinente. Não introduza tecnologia só para executar o playbook.
- Consulte documentação oficial e versão atual da biblioteca/serviço quando o comportamento for volátil.
- Use somente ambientes e recursos autorizados; produção exige escopo explícito e rollback.
- Preserve mudanças locais, contratos públicos, dados e regras de negócio; não exponha segredos.
- Não declare sucesso com base em intenção. Registre comandos, resultados, evidências e pendências.
- Ao concluir, apresente fatos confirmados, hipótese testável, diff ou plano, validação executada e riscos remanescentes.


## Exemplos e Implementações de Produção

### Componente React Hook Form + Zod Completo (TypeScript)
```typescript
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// 1. Definição do Schema com Mensagens em Português
export const userRegistrationSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres').max(100),
  email: z.string().email('Endereço de e-mail inválido'),
  phone: z.string().regex(/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/, 'Telefone inválido'),
  password: z
    .string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .regex(/[A-Z]/, 'Deve conter pelo menos uma letra maiúscula')
    .regex(/[0-9]/, 'Deve conter pelo menos um número'),
  confirmPassword: z.string(),
  terms: z.boolean().refine(val => val === true, 'Você deve aceitar os termos')
}).refine(data => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword']
});

export type UserRegistrationInput = z.infer<typeof userRegistrationSchema>;

// 2. Componente de Formulário com Tratamento de Erros e Loading
export function RegistrationForm({ onSubmitSuccess }: { onSubmitSuccess: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset
  } = useForm<UserRegistrationInput>({
    resolver: zodResolver(userRegistrationSchema),
    mode: 'onBlur'
  });

  const onSubmit = async (data: UserRegistrationInput) => {
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Falha no cadastro');
      reset();
      onSubmitSuccess();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium">Nome Completo</label>
        <input {...register('name')} className="input" aria-invalid={!!errors.name} />
        {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium">E-mail</label>
        <input type="email" {...register('email')} className="input" />
        {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
      </div>

      <button type="submit" disabled={isSubmitting} className="btn-primary">
        {isSubmitting ? 'Cadastrando...' : 'Criar Conta'}
      </button>
    </form>
  );
}
```
