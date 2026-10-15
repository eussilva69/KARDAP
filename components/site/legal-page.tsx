"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, Mail, Printer, Search, X } from "lucide-react";
import { Button, EmptyState } from "@/components/ui/primitives";
import { SiteFooter, SiteHeader } from "./site-chrome";

/** Negrito, itálico e código dentro de uma linha (**texto**, *texto*, `texto`). */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** O texto das seções usa marcação simples: parágrafos, listas com "•" e listas numeradas. */
function LegalBody({ body }: { body: string }) {
  return (
    <>
      {body.split(/\n\s*\n/).map((block, i) => {
        const lines = block
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length && lines.every((l) => l.startsWith("• ")))
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.slice(2))}</li>
              ))}
            </ul>
          );
        if (lines.length && lines.every((l) => /^\d+\.\s/.test(l)))
          return (
            <ol key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\d+\.\s/, ""))}</li>
              ))}
            </ol>
          );
        return <p key={i}>{inline(lines.join(" "))}</p>;
      })}
    </>
  );
}

export default function LegalPage({ type }: { type: "privacidade" | "termos" | "cookies" }) {
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const docs = {
    privacidade: {
      badge: "CONFORMIDADE LGPD · LEI Nº 13.709/2018",
      eyebrow: "PRIVACIDADE E PROTEÇÃO DE DADOS",
      title: "Política de Privacidade",
      subtitle:
        "Entenda como a plataforma Kardap coleta, utiliza, armazena e protege os dados de estabelecimentos parceiros e de clientes à mesa.",
      updated: "Versão 1.2 · Atualizada em 09 de outubro de 2026",
      summary: [
        {
          title: "Sem Venda de Dados",
          desc: "Não comercializamos dados pessoais de estabelecimentos ou clientes com terceiros.",
        },
        {
          title: "Segurança de Ponta a Ponta",
          desc: "Criptografia SSL/TLS em todas as transmissões e armazenamento seguro de dados.",
        },
        {
          title: "Direitos LGPD Garantidos",
          desc: "Acesso, correção, anonimização e exclusão garantidos a qualquer momento via DPO.",
        },
      ],
      sections: [
        {
          id: "introducao",
          num: "01",
          heading: "1. Introdução e Escopo de Aplicação",
          body: `A plataforma Kardap ("nós", "plataforma" ou "Kardap") é uma solução digital de cardápios interativos por QR Code e gestão de atendimento à mesa para restaurantes, bares, lanchonetes e cafeterias.

Esta Política de Privacidade foi estruturada em total conformidade com a Lei Geral de Proteção de Dados Pessoais (LGPD - Lei nº 13.709/2018), o Marco Civil da Internet (Lei nº 12.965/2014) e o Código de Defesa do Consumidor. Nosso objetivo é transparente: garantir a máxima segurança e privacidade tanto para os estabelecimentos comerciais quanto para os clientes finais que interagem com nossos cardápios.`,
        },
        {
          id: "dados-coletados",
          num: "02",
          heading: "2. Dados Pessoais Coletados e Formas de Coleta",
          body: `Coletamos apenas as informações estritamente necessárias para a prestação e aprimoramento dos nossos serviços:

• **Dados de Administradores do Estabelecimento**: No momento do cadastro da conta comercial, solicitamos nome completo, e-mail corporativo, número de telefone/WhatsApp, nome do estabelecimento, cidade e senha criptografada.
• **Dados dos Clientes à Mesa (Consumidores)**: Para proporcionar um atendimento ágil e descomplicado, o acesso ao cardápio digital via QR Code **não exige cadastro prévio nem fornecimento de CPF**. Coletamos temporariamente apenas o número da mesa (ex: Mesa 07) e as solicitações enviadas (como chamar garçom ou pedir a conta).
• **Dados Técnicos de Navegação**: Endereço IP, tipo de navegador, sistema operacional e registros de data/hora de acesso, coletados automaticamente para fins de segurança, prevenção a fraudes e estabilidade da infraestrutura.`,
        },
        {
          id: "bases-legais",
          num: "03",
          heading: "3. Finalidades e Bases Legais do Tratamento (Art. 7º LGPD)",
          body: `O tratamento dos seus dados pessoais é realizado mediante o enquadramento em bases legais válidas previstas no Artigo 7º da LGPD:

1. **Execução de Contrato (Art. 7º, V)**: Processamos seus dados cadastrais para permitir o acesso ao painel administrativo, gerenciar cardápios, emitir QR Codes e operacionalizar os chamados de atendimento em tempo real.
2. **Cumprimento de Obrigação Legal (Art. 7º, II)**: Guardamos os registros de acesso a aplicações de internet durante 6 (seis) meses para atender a determinações do Marco Civil da Internet.
3. **Legítimo Interesse (Art. 7º, IX)**: Utilizamos dados anonimizados e estatísticas de uso para otimizar o desempenho do sistema, identificar gargalos operacionais e prevenir falhas de segurança.
4. **Consentimento (Art. 7º, I)**: Quando necessário para comunicações de marketing, novidades de recursos ou materiais promocionais opcionais.`,
        },
        {
          id: "seguranca",
          num: "04",
          heading: "4. Armazenamento e Medidas de Segurança",
          body: `Adotamos padrões rígidos de segurança cibernética para proteger seus dados contra acessos não autorizados, perda, destruição ou vazamentos:

• **Criptografia**: Todos os dados trafegados entre seu navegador e nossos servidores utilizam protocolos seguros HTTPS com criptografia SSL/TLS de 256 bits.
• **Armazenamento Local (LocalStorage)**: Guardamos chaves técnicas de sessão no seu próprio navegador (como \`kardap-calls\` e \`kardap-settings\`) para acelerar o carregamento do painel e evitar desconexões indesejadas.
• **Proteção de Credenciais**: Senhas são armazenadas utilizando algoritmos de hash de sentido único com salting (bcrypt/argon2), sendo inacessíveis inclusive para nossa equipe interna.`,
        },
        {
          id: "compartilhamento",
          num: "05",
          heading: "5. Compartilhamento de Dados com Terceiros",
          body: `Garantimos que o Kardap **não vende, aluga ou compartilha dados pessoais com corretores de dados ou anunciantes**. O compartilhamento restringe-se exclusivamente aos seguintes parceiros operacionais:

• **Provedores de Infraestrutura de Nuvem**: Servidores de alta confiabilidade responsáveis por manter o banco de dados e a aplicação online com alta disponibilidade.
• **Processadores de Pagamento Homologados**: Instituições financeiras para o processamento de assinaturas dos planos pagos, sob estritos padrões de segurança PCI-DSS.
• **Requisição Judicial ou Regulatório**: Por determinação de autoridades policiais, judiciais ou administrativas competentes, nos estritos limites da lei.`,
        },
        {
          id: "direitos-titular",
          num: "06",
          heading: "6. Seus Direitos como Titular de Dados (Art. 18 LGPD)",
          body: `Você possui controle total sobre suas informações pessoais. Nos termos da LGPD, você pode requerer a qualquer momento:

1. **Confirmação e Acesso**: Saber se tratamos seus dados e obter uma cópia completa dos registros.
2. **Correção**: Solicitar a atualização de dados incorretos, incompletos ou desatualizados.
3. **Anonimização ou Exclusão**: Pedir a remoção de dados desnecessários ou o encerramento definitivo da sua conta com apaga de registros.
4. **Portabilidade**: Solicitar a transferência dos seus dados a outro fornecedor de serviços em formato estruturado.
5. **Revogação do Consentimento**: Retirar autorizações concedidas anteriormente de forma simples e gratuita.`,
        },
        {
          id: "retencao-exclusao",
          num: "07",
          heading: "7. Período de Retenção e Exclusão de Dados",
          body: `Os dados pessoais dos restaurantes parceiros serão mantidos durante a vigência do contrato de uso da plataforma. Caso decida encerrar sua conta, seus dados pessoais e dados de produtos serão excluídos ou anonimizados permanentemente do nosso banco de dados ativo em até 30 (trinta) dias úteis.

Dados exigidos por obrigações legais, fiscais ou regulatórias serão mantidos armazenados de forma restrita pelos prazos mínimos previstos na legislação brasileira.`,
        },
        {
          id: "dpo-contato",
          num: "08",
          heading: "8. Encarregado de Proteção de Dados (DPO) e Contato",
          body: `Para tirar dúvidas sobre esta Política, solicitar o exercício dos seus direitos da LGPD ou reportar incidentes de segurança, entre em contato direto com o nosso Encarregado de Proteção de Dados:

• **E-mail dedicado de Privacidade**: \`privacidade@kardap.com.br\`
• **Prazo de Resposta**: Respondemos a todas as solicitações formais em até 5 (cinco) dias úteis.`,
        },
      ],
    },
    termos: {
      badge: "CONTRATO DE SERVIÇO SAAS · TERMOS GERAIS",
      eyebrow: "REGRAS E CONDIÇÕES DE USO",
      title: "Termos de Uso da Plataforma",
      subtitle:
        "Condições jurídicas, direitos e obrigações para a utilização da solução de cardápio digital Kardap por estabelecimentos comerciais.",
      updated: "Versão 1.3 · Atualizada em 14 de outubro de 2026",
      summary: [
        {
          title: "30 Dias de Teste Grátis",
          desc: "Escolha um plano no cadastro e experimente sem cartão de crédito e sem compromisso inicial.",
        },
        {
          title: "Sem Fidelidade Forçada",
          desc: "Cancele a assinatura do seu plano a qualquer momento pelo painel de controle.",
        },
        {
          title: "Seu Conteúdo é Seu",
          desc: "Fotos, marcas e vídeos dos seus pratos permanecem de sua total propriedade.",
        },
      ],
      sections: [
        {
          id: "aceitacao",
          num: "01",
          heading: "1. Aceitação dos Termos e Condições",
          body: `Bem-vindo ao Kardap. Ao criar uma conta, contratar um plano ou utilizar nossos serviços ("Serviço"), você ("Usuário", "Restaurante" ou "Cliente") concorda expressamente com estes Termos de Uso e com a nossa Política de Privacidade.

Estes termos constituem um contrato vinculante entre o Usuário e a plataforma Kardap. Se você estiver aceitando estes termos em nome de uma empresa ou estabelecimento comercial, você declara possuir autoridade jurídica para vinculá-lo a este contrato.`,
        },
        {
          id: "descricao-servico",
          num: "02",
          heading: "2. Descrição dos Serviços Kardap",
          body: `O Kardap é uma plataforma de Software como Serviço (SaaS) voltada para modernização do atendimento gastronômico. A plataforma oferece:

• **Editor de Cardápio Digital**: Criação, organização e atualização de produtos, categorias, preços, fotos e vídeos.
• **Gerador de QR Codes por Mesa**: Geração e exportação de QR Codes exclusivos para cada mesa do estabelecimento.
• **Central de Chamados em Tempo Real**: Painel interativo para receber e gerenciar chamados da mesa (solicitação de garçom ou pedido da conta).
• **Personalização de Marca & Relatórios**: Customização com logotipo e capa do estabelecimento, além de métricas operacionais.`,
        },
        {
          id: "cadastro-conta",
          num: "03",
          heading: "3. Cadastro, Credenciais e Segurança da Conta",
          body: `Para utilizar a plataforma Kardap, o Usuário concorda em:

1. **Fornecer Informações Verídicas**: Preencher os dados de cadastro com informações precisas, atualizadas e completas.
2. **Guarda de Senhas**: Manter o sigilo da sua senha de acesso. O Usuário é o único e exclusivo responsável por todas as atividades que ocorrerem em sua conta.
3. **Notificação de Uso Não Autorizado**: Informar imediatamente a equipe do Kardap caso identifique qualquer uso não autorizado de sua conta ou quebra de segurança.`,
        },
        {
          id: "planos-teste",
          num: "04",
          heading: "4. Período de Teste Grátis (30 Dias) e Assinaturas",
          body: `• **Escolha do Plano**: No cadastro, o Usuário escolhe qual plano (Start, Pro ou Business) deseja experimentar. O teste é ativado somente após a conclusão da configuração inicial do estabelecimento.
• **Período de Teste Gratuito (Trial)**: Novos estabelecimentos têm direito a 30 (trinta) dias de teste gratuito com os recursos e limites do plano escolhido. **Não é necessário cadastrar cartão de crédito para iniciar o teste.** Cada estabelecimento tem direito a um único período de teste.
• **Planos de Assinatura**: Após o término do trial, para continuar utilizando o Serviço, o Usuário deverá contratar um dos planos disponíveis (Start, Pro, Business ou Enterprise, este sob consulta comercial), conforme descritos na página de planos.
• **Faturamento Recorrente**: As assinaturas são renovadas automaticamente a cada mês.
• **Política de Cancelamento**: O cancelamento pode ser feito a qualquer momento diretamente pelo painel. O acesso ao sistema continuará disponível até o último dia do ciclo já pago, sem cobrança de taxas adicionais ou multas rescisórias.`,
        },
        {
          id: "propriedade-intelectual",
          num: "05",
          heading: "5. Propriedade Intelectual e Licença de Uso",
          body: `• **Propriedade da Plataforma**: O Kardap retém todos os direitos de propriedade intelectual sobre o software, marcas, logotipos, código-fonte, layout visual, algoritmos e documentação da plataforma.
• **Propriedade do Conteúdo do Restaurante**: O Usuário retém a propriedade integral de todas as marcas, fotos de pratos, descrições e vídeos enviados para a plataforma. O Usuário concede ao Kardap apenas uma licença limitada e não exclusiva para armazenar e exibir esse conteúdo no cardápio digital do estabelecimento durante a vigência da conta.`,
        },
        {
          id: "uso-aceitavel",
          num: "06",
          heading: "6. Vedações e Conduta do Usuário",
          body: `É expressamente proibido ao Usuário:

1. Publicar conteúdo ilícito, difamatório, discriminatório, obsceno ou que viole direitos de propriedade intelectual alheios.
2. Realizar engenharia reversa, descompilar ou tentar extrair o código-fonte da plataforma.
3. Utilizar scripts automatizados, robôs ou técnicas de scraping para coletar dados da plataforma.
4. Praticar qualquer ato que comprometa a estabilidade dos servidores ou cause sobrecarga não autorizada (ataques DDoS).`,
        },
        {
          id: "disponibilidade-sla",
          num: "07",
          heading: "7. Garantia de Nível de Serviço (SLA) e Responsabilidades",
          body: `Empenhamo-nos comercialmente para manter o Kardap disponível 24 horas por dia, 7 dias por semana, com uma taxa de disponibilidade (SLA) de **99,5%**. No entanto, o Kardap não será responsável por:

• Indisponibilidade provocada por falhas na conexão de internet do próprio restaurante ou dos clientes finais.
• Problemas decorrentes do mau uso do sistema, falhas de hardware nos dispositivos do estabelecimento ou caso fortuito e força maior.
• Danos indiretos, lucros cessantes ou perda de faturamento do estabelecimento.`,
        },
        {
          id: "alteracoes-foro",
          num: "08",
          heading: "8. Alterações nos Termos, Rescisão e Foro",
          body: `• **Atualizações dos Termos**: Reservamo-nos o direito de modificar estes Termos a qualquer momento. Alterações significativas serão notificadas por e-mail ou aviso no painel com pelo menos 15 dias de antecedência.
• **Rescisão por Violação**: O descumprimento destes termos poderá resultar na suspensão temporária ou no encerramento definitivo da conta do Usuário.
• **Legislação e Foro**: Este contrato é regido pelas leis da República Federativa do Brasil, ficando eleito o Foro da Comarca da sede do Kardap para dirimir eventuais disputas.`,
        },
      ],
    },
    cookies: {
      badge: "ARMAZENAMENTO LOCAL E COOKIES ESSENCIAIS",
      eyebrow: "TRANSPARÊNCIA TÉCNICA",
      title: "Política de Cookies e Armazenamento",
      subtitle:
        "Saiba como a plataforma Kardap utiliza o armazenamento no seu navegador para oferecer uma navegação rápida e segura.",
      updated: "Versão 1.2 · Atualizada em 09 de outubro de 2026",
      summary: [
        {
          title: "Apenas Itens Essenciais",
          desc: "Utilizamos armazenamento técnico estritamente necessário para manter o sistema rodando.",
        },
        {
          title: "Zero Rastreamento Comercial",
          desc: "Não utilizamos cookies de terceiros para vender anúncios ou rastrear seu comportamento.",
        },
        {
          title: "Controle Total no Navegador",
          desc: "Você pode limpar seus dados locais a qualquer momento nas configurações do seu browser.",
        },
      ],
      sections: [
        {
          id: "o-que-sao",
          num: "01",
          heading: "1. O que são Cookies e Local Storage?",
          body: `Cookies e LocalStorage são tecnologias padrão da web que permitem aos sites armazenar pequenas quantidades de dados diretamente no navegador do seu dispositivo (computador, tablet ou smartphone).

Esses recursos garantem que suas preferências de configuração permaneçam salvas entre acessos e evitam que você precise fazer login repetidamente ao alternar páginas.`,
        },
        {
          id: "chaves-utilizadas",
          num: "02",
          heading: "2. Chaves de Armazenamento Utilizadas pelo Kardap",
          body: `No Kardap, utilizamos primariamente o **LocalStorage** para manter a performance e a reatividade do painel em tempo real:

• \`kardap-session\`: Armazena o estado da sua sessão ativa no painel administrativo de forma segura.
• \`kardap-calls\`: Guarda temporariamente o histórico de chamados das mesas (como pedidos de conta ou solicitações de garçom) para que seu painel atualize instantaneamente sem perda de dados.
• \`kardap-brand\`: Registra as preferências de personalização da sua marca (logotipo e imagem de capa do restaurante).
• \`kardap-settings\`: Armazena opções de configuração rápida ativadas pelo estabelecimento (ex: sonorização de alertas).`,
        },
        {
          id: "como-gerenciar",
          num: "03",
          heading: "3. Como Gerenciar ou Excluir seus Dados Locais",
          body: `Como os dados do LocalStorage ficam gravados exclusivamente no seu dispositivo, você tem controle total para removê-los a qualquer momento:

1. **No Google Chrome**: Acesse *Configurações > Privacidade e Segurança > Remover dados de navegação*.
2. **No Mozilla Firefox**: Acesse *Configurações > Privacidade e Segurança > Cookies e dados de sites > Limpar dados*.
3. **No Apple Safari**: Acesse *Preferências > Privacidade > Gerenciar Dados de Sites*.

*Nota importante*: A remoção do LocalStorage encerrará sua sessão atual no painel e redefinirá os chamados simulados para o padrão de fábrica.`,
        },
      ],
    },
  } as const;

  const currentDoc = docs[type];
  const term = search.trim().toLowerCase();
  const filteredSections = useMemo(
    () => (term ? currentDoc.sections.filter((sec) => sec.heading.toLowerCase().includes(term) || sec.body.toLowerCase().includes(term)) : currentDoc.sections),
    [currentDoc, term],
  );

  useEffect(() => {
    document.title = `${currentDoc.title} · Kardap`;
  }, [currentDoc.title]);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => undefined,
    );
  };

  const tabs = [
    { href: "/privacidade", label: "Privacidade", key: "privacidade" },
    { href: "/termos", label: "Termos de Uso", key: "termos" },
    { href: "/cookies", label: "Cookies", key: "cookies" },
  ];

  return (
    <div className="kd-site kd-legal">
      <SiteHeader />
      <main className="kd-site-main">
        <nav className="kd-legal-tabs" aria-label="Documentos legais">
          {tabs.map((tab) => (
            <Link key={tab.key} href={tab.href} aria-current={type === tab.key ? "page" : undefined} className={type === tab.key ? "is-active" : ""}>
              {tab.label}
            </Link>
          ))}
        </nav>

        <header className="kd-legal-head">
          <p className="kd-overline">{currentDoc.eyebrow}</p>
          <h1 className="kd-h1">{currentDoc.title}</h1>
          <p className="kd-lead">{currentDoc.subtitle}</p>
          <p className="kd-legal-meta">{currentDoc.updated}</p>
          <ul className="kd-legal-summary">
            {currentDoc.summary.map((item) => (
              <li key={item.title}>
                <b>{item.title}.</b> {item.desc}
              </li>
            ))}
          </ul>
          <div className="kd-legal-tools kd-no-print">
            <Button variant="secondary" size="sm" icon={copied ? <Check size={15} /> : <Copy size={15} />} onClick={copyLink}>
              {copied ? "Link copiado" : "Copiar link"}
            </Button>
            <Button variant="ghost" size="sm" icon={<Printer size={15} />} onClick={() => window.print()}>
              Imprimir ou salvar em PDF
            </Button>
          </div>
        </header>

        <div className="kd-legal-layout">
          <aside className="kd-legal-toc kd-no-print" aria-label="Índice do documento">
            <label className="kd-search">
              <Search size={16} aria-hidden />
              <span className="kd-sr">Buscar neste documento</span>
              <input type="search" placeholder="Buscar neste documento" value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && (
                <button type="button" className="kd-icon-btn" onClick={() => setSearch("")} aria-label="Limpar busca">
                  <X size={15} />
                </button>
              )}
            </label>
            <p className="kd-overline">Neste documento</p>
            <ol>
              {currentDoc.sections.map((sec) => (
                <li key={sec.id}>
                  <a href={`#${sec.id}`}>{sec.heading.replace(/^\d+\.\s*/, "")}</a>
                </li>
              ))}
            </ol>
            <a className="kd-legal-contact" href="mailto:privacidade@kardap.com.br">
              <Mail size={15} aria-hidden /> privacidade@kardap.com.br
            </a>
          </aside>

          <article className="kd-legal-doc" aria-live="polite">
            {filteredSections.length === 0 ? (
              <EmptyState
                icon={<Search size={22} />}
                title={`Nada encontrado para “${search}”`}
                description="Tente outra palavra ou veja o documento completo."
                action={
                  <Button size="sm" variant="secondary" onClick={() => setSearch("")}>
                    Ver o documento completo
                  </Button>
                }
              />
            ) : (
              filteredSections.map((sec) => (
                <section key={sec.id} id={sec.id} className="kd-legal-section" aria-labelledby={`${sec.id}-title`}>
                  <h2 id={`${sec.id}-title`} className="kd-h2">
                    {sec.heading}
                  </h2>
                  <div className="kd-legal-body">
                    <LegalBody body={sec.body} />
                  </div>
                </section>
              ))
            )}
            <p className="kd-legal-help">
              Dúvidas sobre este documento? Escreva para <a href="mailto:suporte@kardap.com.br">suporte@kardap.com.br</a>.
            </p>
          </article>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
