/**
 * Conta demonstrativa "Brasa & Sabor" (docs/DEMO.md): catálogo, mesas, histórico simulado de pedidos e financeiro.
 *
 * Módulo puro (sem Firebase e sem imports de execução fora de lib/): roda no script de seed (Node 24 executa
 * TypeScript direto) e na rota de restauração. Tudo é determinístico — os pedidos de cada dia do calendário saem de
 * uma semente derivada da data —, e as datas são calculadas no momento em que os dados são aplicados, para a
 * demonstração nunca "envelhecer": o painel sempre mostra movimento hoje, ontem e nos últimos 30 dias.
 */
import { DEMO_RESTAURANT_ID, DEMO_SLUG } from "./ids.ts";
import { calculateFees, type FinancialSettings } from "../financial/types.ts";
import { slugifyNeighborhood } from "../delivery/types.ts";

// ───────────────────────── Catálogo ─────────────────────────

export type DemoCategory = { id: string; name: string; description: string; order: number };

export type DemoProduct = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  /** Custo estimado do prato (insumos), usado na margem dos relatórios. */
  costCents: number;
  /** Peso de saída nos pedidos simulados. */
  popularity: number;
  available?: boolean;
  /** Buscas (em inglês, como a biblioteca de vídeos indexa) em ordem de preferência. */
  mediaQueries: string[];
  /** Observações possíveis nos pedidos. */
  notes?: string[];
};

export const DEMO_CATEGORIES: DemoCategory[] = [
  { id: "cat-burgers", name: "Hambúrgueres artesanais", description: "Blends de 180 g grelhados na brasa, no pão brioche da casa.", order: 0 },
  { id: "cat-pizzas", name: "Pizzas tradicionais", description: "Massa de fermentação natural de 48 horas, assada no forno a lenha. Tamanho grande, 8 fatias.", order: 1 },
  { id: "cat-pizzas-especiais", name: "Pizzas especiais", description: "Receitas autorais com ingredientes selecionados. Tamanho grande, 8 fatias.", order: 2 },
  { id: "cat-porcoes", name: "Porções e acompanhamentos", description: "Para dividir na mesa ou acompanhar o lanche.", order: 3 },
  { id: "cat-bebidas", name: "Bebidas", description: "Sucos naturais, refrigerantes, milkshakes e chopp gelado.", order: 4 },
  { id: "cat-sobremesas", name: "Sobremesas", description: "Para fechar com chave de ouro.", order: 5 },
  { id: "cat-combos", name: "Combos promocionais", description: "Combinações com preço especial.", order: 6 },
];

const BURGER_NOTES = ["Sem cebola", "Ponto da carne: ao ponto", "Ponto da carne: bem passado", "Sem picles", "Molho à parte"];
const PIZZA_NOTES = ["Borda recheada com catupiry", "Metade sem cebola", "Bem assada", "Cortar em 12 fatias"];

export const DEMO_PRODUCTS: DemoProduct[] = [
  // Hambúrgueres
  { id: "p-burger-supreme", categoryId: "cat-burgers", name: "Burger Supreme", description: "Hambúrguer artesanal de 180 g, queijo cheddar cremoso, bacon crocante, cebola caramelizada e molho especial no pão brioche.", priceCents: 3990, costCents: 1290, popularity: 10, mediaQueries: ["bacon cheeseburger", "cheeseburger", "burger"], notes: BURGER_NOTES },
  { id: "p-smash-duplo", categoryId: "cat-burgers", name: "Smash Duplo", description: "Dois smash burgers de 90 g com crosta caramelizada na chapa, queijo americano derretido, picles e molho da casa no pão brioche selado na manteiga.", priceCents: 3490, costCents: 1080, popularity: 9, mediaQueries: ["smash burger", "double cheeseburger", "burger grill"], notes: BURGER_NOTES },
  { id: "p-bacon-lovers", categoryId: "cat-burgers", name: "Bacon Lovers", description: "Blend de 180 g, camada dupla de bacon defumado, cheddar inglês, maionese de bacon e cebola crispy no pão australiano.", priceCents: 4290, costCents: 1450, popularity: 7, mediaQueries: ["bacon burger", "burger bacon", "burger"], notes: BURGER_NOTES },
  { id: "p-cheddar-melt", categoryId: "cat-burgers", name: "Cheddar Melt", description: "Hambúrguer de 180 g coberto com uma cascata de cheddar cremoso e cebola roxa no pão brioche.", priceCents: 3690, costCents: 1180, popularity: 6, mediaQueries: ["melted cheese burger", "cheese burger", "burger"], notes: BURGER_NOTES },
  { id: "p-chicken-crispy", categoryId: "cat-burgers", name: "Chicken Crispy", description: "Sobrecoxa empanada e crocante, alface americana, tomate e maionese de ervas no pão brioche.", priceCents: 3390, costCents: 1020, popularity: 5, mediaQueries: ["fried chicken sandwich", "chicken burger", "chicken sandwich"], notes: ["Sem tomate", "Maionese à parte"] },
  { id: "p-veggie-grao", categoryId: "cat-burgers", name: "Veggie do Grão", description: "Hambúrguer de grão-de-bico e cogumelos, queijo prato, rúcula, tomate e maionese verde no pão integral.", priceCents: 3290, costCents: 990, popularity: 3, mediaQueries: ["veggie burger", "vegan burger", "plant based burger"], notes: ["Sem queijo", "Sem tomate"] },
  { id: "p-brasa-monster", categoryId: "cat-burgers", name: "Brasa Monster", description: "Três carnes de 120 g, três fatias de cheddar, bacon, ovo, cebola caramelizada e barbecue defumado. Para quem chega com fome.", priceCents: 5290, costCents: 1890, popularity: 4, mediaQueries: ["big burger", "triple burger", "giant burger"], notes: BURGER_NOTES },
  // Pizzas tradicionais
  { id: "p-pizza-calabresa", categoryId: "cat-pizzas", name: "Pizza Calabresa Especial", description: "Massa artesanal, molho de tomate, muçarela, calabresa selecionada, cebola roxa e orégano.", priceCents: 6490, costCents: 1890, popularity: 9, mediaQueries: ["sausage pizza", "pizza oven", "pizza"], notes: PIZZA_NOTES },
  { id: "p-pizza-margherita", categoryId: "cat-pizzas", name: "Pizza Margherita", description: "Molho de tomate italiano, muçarela de búfala, tomate fresco, manjericão e azeite extravirgem.", priceCents: 5990, costCents: 1590, popularity: 7, mediaQueries: ["margherita pizza", "pizza basil", "pizza"], notes: PIZZA_NOTES },
  { id: "p-pizza-quatro-queijos", categoryId: "cat-pizzas", name: "Pizza Quatro Queijos", description: "Muçarela, provolone, parmesão e gorgonzola sobre molho de tomate, finalizada com orégano.", priceCents: 6990, costCents: 2190, popularity: 6, mediaQueries: ["cheese pizza", "pizza cheese pull", "pizza"], notes: PIZZA_NOTES },
  { id: "p-pizza-portuguesa", categoryId: "cat-pizzas", name: "Pizza Portuguesa", description: "Presunto, ovos, cebola, ervilha, azeitonas pretas, muçarela e orégano.", priceCents: 6690, costCents: 2010, popularity: 6, mediaQueries: ["ham pizza", "pizza slice", "pizza"], notes: PIZZA_NOTES },
  { id: "p-pizza-frango-catupiry", categoryId: "cat-pizzas", name: "Pizza Frango com Catupiry", description: "Frango desfiado e temperado, requeijão cremoso tipo catupiry, milho e muçarela.", priceCents: 6790, costCents: 1980, popularity: 7, mediaQueries: ["chicken pizza", "pizza box", "pizza"], notes: PIZZA_NOTES },
  { id: "p-pizza-mucarela", categoryId: "cat-pizzas", name: "Pizza Muçarela", description: "Muçarela derretida sobre molho de tomate artesanal, rodelas de tomate e orégano.", priceCents: 5490, costCents: 1420, popularity: 5, mediaQueries: ["mozzarella pizza", "pizza dough", "pizza"], notes: PIZZA_NOTES },
  // Pizzas especiais
  { id: "p-pizza-pepperoni", categoryId: "cat-pizzas-especiais", name: "Pizza Pepperoni Picante", description: "Pepperoni fatiado fino, muçarela, molho de tomate apimentado e mel de pimenta calabresa.", priceCents: 7490, costCents: 2290, popularity: 6, mediaQueries: ["pepperoni pizza", "pizza pepperoni", "pizza"], notes: PIZZA_NOTES },
  { id: "p-pizza-costela", categoryId: "cat-pizzas-especiais", name: "Pizza Costela BBQ", description: "Costela bovina desfiada, cozida por 12 horas, molho barbecue da casa, cebola roxa e muçarela.", priceCents: 7990, costCents: 2590, popularity: 5, mediaQueries: ["bbq pizza", "meat pizza", "pizza"], notes: PIZZA_NOTES },
  { id: "p-pizza-burrata", categoryId: "cat-pizzas-especiais", name: "Pizza Burrata e Tomate Confit", description: "Molho de tomate, burrata inteira no centro, tomates-cereja confitados, pesto de manjericão e azeite.", priceCents: 8290, costCents: 2790, popularity: 4, mediaQueries: ["burrata pizza", "burrata", "pizza tomato basil"], notes: ["Bem assada"] },
  { id: "p-pizza-parma", categoryId: "cat-pizzas-especiais", name: "Pizza Parma e Rúcula", description: "Muçarela, presunto parma, rúcula fresca, lascas de parmesão e redução de balsâmico.", priceCents: 8490, costCents: 2890, popularity: 4, mediaQueries: ["prosciutto pizza", "arugula pizza", "pizza"], notes: ["Rúcula à parte"] },
  { id: "p-pizza-camarao", categoryId: "cat-pizzas-especiais", name: "Pizza Camarão ao Alho", description: "Camarões salteados no alho e azeite, muçarela, catupiry e salsinha.", priceCents: 8990, costCents: 3190, popularity: 3, available: false, mediaQueries: ["shrimp pizza", "seafood pizza", "shrimp garlic"], notes: ["Bem assada"] },
  // Porções
  { id: "p-batata-rustica", categoryId: "cat-porcoes", name: "Batata Frita Rústica", description: "Batatas com casca fritas em duas etapas, temperadas com alecrim e sal de parrilla. Acompanha maionese da casa.", priceCents: 2490, costCents: 610, popularity: 9, mediaQueries: ["french fries", "fries", "potato fries"], notes: ["Sem sal", "Maionese extra"] },
  { id: "p-batata-cheddar-bacon", categoryId: "cat-porcoes", name: "Batata com Cheddar e Bacon", description: "Porção de fritas coberta com cheddar cremoso e bacon crocante em cubos.", priceCents: 3290, costCents: 990, popularity: 7, mediaQueries: ["cheese fries", "loaded fries", "fries cheese"] },
  { id: "p-onion-rings", categoryId: "cat-porcoes", name: "Onion Rings", description: "Anéis de cebola empanados na cerveja, crocantes por fora e macios por dentro, com molho barbecue.", priceCents: 2690, costCents: 680, popularity: 5, mediaQueries: ["onion rings", "fried onion", "fried snack"] },
  { id: "p-frango-passarinho", categoryId: "cat-porcoes", name: "Frango a Passarinho", description: "Coxinhas da asa fritas e temperadas com alho dourado e salsinha. Serve duas pessoas.", priceCents: 3990, costCents: 1290, popularity: 4, mediaQueries: ["fried chicken wings", "chicken wings", "fried chicken"] },
  { id: "p-mandioca-frita", categoryId: "cat-porcoes", name: "Mandioca Frita", description: "Mandioca cozida e frita até ficar dourada, finalizada com manteiga de garrafa e queijo coalho ralado.", priceCents: 2290, costCents: 540, popularity: 4, mediaQueries: ["cassava fries", "fried cassava", "potato wedges"] },
  // Bebidas
  { id: "p-refrigerante", categoryId: "cat-bebidas", name: "Refrigerante lata", description: "Lata de 350 ml bem gelada. Cola, cola zero, guaraná ou laranja.", priceCents: 690, costCents: 290, popularity: 10, mediaQueries: ["soda pouring glass ice", "cola glass ice", "soft drink"], notes: ["Guaraná", "Cola zero", "Com gelo e limão"] },
  { id: "p-suco-laranja", categoryId: "cat-bebidas", name: "Suco Natural de Laranja", description: "500 ml, espremido na hora, sem adição de açúcar.", priceCents: 1190, costCents: 380, popularity: 5, mediaQueries: ["orange juice pouring", "orange juice", "fresh juice"], notes: ["Sem gelo"] },
  { id: "p-limonada-suica", categoryId: "cat-bebidas", name: "Limonada Suíça", description: "Limão batido com casca, leite condensado e muito gelo. 500 ml.", priceCents: 1290, costCents: 350, popularity: 6, mediaQueries: ["lemonade", "lime juice", "lemon drink"] },
  { id: "p-agua", categoryId: "cat-bebidas", name: "Água mineral", description: "Garrafa de 500 ml, com ou sem gás.", priceCents: 490, costCents: 150, popularity: 4, mediaQueries: ["sparkling water glass", "water pouring glass", "water glass"], notes: ["Com gás", "Sem gás"] },
  { id: "p-milkshake", categoryId: "cat-bebidas", name: "Milkshake de Ovomaltine", description: "Sorvete de creme batido com Ovomaltine crocante, chantilly e calda de chocolate. 400 ml.", priceCents: 2190, costCents: 720, popularity: 5, mediaQueries: ["chocolate milkshake", "milkshake", "milk shake"] },
  { id: "p-chopp", categoryId: "cat-bebidas", name: "Chopp Pilsen 500 ml", description: "Chopp claro tirado na hora, com dois dedos de colarinho. Venda proibida para menores de 18 anos.", priceCents: 1490, costCents: 520, popularity: 6, mediaQueries: ["beer tap pouring", "draft beer", "beer glass"] },
  // Sobremesas
  { id: "p-petit-gateau", categoryId: "cat-sobremesas", name: "Petit Gâteau", description: "Bolinho de chocolate meio amargo com recheio cremoso, servido quente com sorvete de creme.", priceCents: 2490, costCents: 780, popularity: 5, mediaQueries: ["chocolate lava cake", "lava cake", "chocolate cake"] },
  { id: "p-brownie", categoryId: "cat-sobremesas", name: "Brownie com Sorvete", description: "Brownie de chocolate com nozes, sorvete de creme e calda quente de chocolate.", priceCents: 2290, costCents: 690, popularity: 5, mediaQueries: ["brownie ice cream", "brownie", "chocolate dessert"] },
  { id: "p-pizza-chocolate", categoryId: "cat-sobremesas", name: "Pizza de Chocolate com Morango", description: "Massa fina, chocolate ao leite derretido e morangos frescos. Tamanho broto, 4 fatias.", priceCents: 3990, costCents: 1290, popularity: 3, mediaQueries: ["chocolate strawberries", "dessert pizza", "melted chocolate"] },
  { id: "p-pudim", categoryId: "cat-sobremesas", name: "Pudim de Leite", description: "Pudim de leite condensado com calda de caramelo, receita da casa.", priceCents: 1490, costCents: 380, popularity: 4, mediaQueries: ["caramel flan", "caramel pudding", "flan"] },
  // Combos
  { id: "p-combo-duplo", categoryId: "cat-combos", name: "Combo Duplo", description: "Dois hambúrgueres artesanais, duas porções de batata frita e dois refrigerantes.", priceCents: 7990, costCents: 2690, popularity: 7, mediaQueries: ["burger and fries", "burgers fries", "burger meal"], notes: ["Um sem cebola", "Refrigerantes: guaraná"] },
  { id: "p-combo-smash", categoryId: "cat-combos", name: "Combo Smash", description: "Smash Duplo, batata frita rústica e refrigerante lata.", priceCents: 4490, costCents: 1520, popularity: 8, mediaQueries: ["burger fries soda", "fast food meal", "burger and fries"], notes: ["Refrigerante: cola zero"] },
  { id: "p-combo-familia", categoryId: "cat-combos", name: "Combo Família", description: "Pizza grande tradicional à escolha, porção de batata rústica e refrigerante de 2 litros.", priceCents: 11990, costCents: 3890, popularity: 4, mediaQueries: ["pizza party friends", "pizza table", "pizza sharing"], notes: ["Pizza: calabresa", "Pizza: frango com catupiry"] },
  { id: "p-combo-pizza-refri", categoryId: "cat-combos", name: "Combo Pizza + Refri", description: "Pizza muçarela ou calabresa e refrigerante de 2 litros.", priceCents: 6990, costCents: 2050, popularity: 5, mediaQueries: ["pizza and soda", "pizza delivery", "pizza box"], notes: ["Pizza: muçarela", "Pizza: calabresa"] },
];

export const priceText = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

// ───────────────────────── Estabelecimento ─────────────────────────

export const DEMO_CITY = { ibgeCode: "3550308", name: "São Paulo", uf: "SP" };

/** Bairros atendidos e taxa de entrega (centavos). */
export const DEMO_NEIGHBORHOODS: [string, number][] = [
  ["Pinheiros", 590],
  ["Vila Madalena", 690],
  ["Consolação", 690],
  ["Bela Vista", 790],
  ["Jardim Paulista", 790],
  ["Perdizes", 790],
  ["Itaim Bibi", 890],
  ["Lapa", 890],
  ["Butantã", 990],
  ["Vila Mariana", 990],
  ["Moema", 1090],
];

/** Terça a domingo almoço e jantar; segunda só jantar. Chaves "0" (domingo) a "6" (sábado). */
export const DEMO_HOURS: Record<string, { open: boolean; from: string; to: string }> = {
  "0": { open: true, from: "11:30", to: "23:30" },
  "1": { open: true, from: "18:00", to: "23:00" },
  "2": { open: true, from: "11:30", to: "23:00" },
  "3": { open: true, from: "11:30", to: "23:00" },
  "4": { open: true, from: "11:30", to: "23:30" },
  "5": { open: true, from: "11:30", to: "00:30" },
  "6": { open: true, from: "11:30", to: "00:30" },
};

export const DEMO_TABLES = Array.from({ length: 12 }, (_, i) => {
  const number = i + 1;
  return { id: `mesa-${String(number).padStart(2, "0")}`, number, name: `Mesa ${String(number).padStart(2, "0")}`, capacity: number <= 4 ? 2 : number <= 10 ? 4 : 6, qrToken: `demo-mesa-${String(number).padStart(2, "0")}-bs` };
});

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
/** São Paulo não tem horário de verão desde 2019: UTC−3 o ano todo. */
const SP_OFFSET = -3 * 60 * MINUTE;

export type BrandMedia = { logo: string; logoSmall: string; cover: string; coverSmall: string };

export function restaurantDoc(ownerId: string, now: number, brand: BrandMedia) {
  const iso = (ms: number) => new Date(ms).toISOString();
  const created = now - 160 * DAY;
  return {
    name: "Brasa & Sabor",
    slug: DEMO_SLUG,
    ownerId,
    status: "active",
    isDemo: true,
    demo: { label: "Ambiente de demonstração — Dados simulados", seededAt: iso(now) },
    establishmentType: "Hamburgueria",
    description: "Hamburgueria e pizzaria artesanal: blends grelhados na brasa, pizzas de fermentação natural assadas no forno a lenha e porções para dividir.",
    businessPhone: "0000000000",
    businessEmail: "contato@brasaesabor.demo",
    address: { street: "Rua das Brasas", number: "120", district: "Vila Demonstração", city: "São Paulo", uf: "SP", note: "Endereço fictício, usado só na demonstração." },
    brand: {
      ...brand,
      palette: { id: "brasa", name: "Brasa", colors: { background: "#18120f", text: "#f6ece3", primary: "#e4572e", signal: "#ffc93c", brand: "#2a1e19" }, panel: false },
      customPalette: null,
    },
    settings: {
      waiter: true,
      bill: true,
      // Avaliação no Google fica desligada: a demonstração não tem um perfil real vinculado (nada de avaliações falsas).
      google: false,
      googleReviewUrl: "",
      sound: true,
      hours: DEMO_HOURS,
      service: { dineIn: true, pickup: true, delivery: true, deliveryFeeCents: null, deliveryEta: "35 a 50 min", pickupEta: "20 a 30 min", deliveryArea: "Zona oeste e região central de São Paulo" },
      welcomeMessage: "Bem-vindo ao Brasa & Sabor! Veja os pratos em vídeo e chame a equipe quando quiser.",
    },
    delivery: {
      enabled: true,
      enabledAt: iso(created + 7 * DAY),
      deliveryFeeCents: 790,
      deliveryEta: "35 a 50 min",
      deliveryArea: "Zona oeste e região central de São Paulo",
      minOrderCents: 3000,
      paymentMethods: ["pix", "cartao_credito", "cartao_debito", "dinheiro"],
      notes: "Retirada no balcão: Rua das Brasas, 120 — Vila Demonstração (endereço fictício). Ambiente de demonstração: nenhum pagamento é cobrado.",
      feeMode: "taxa_por_bairro",
      servedCities: [DEMO_CITY],
    },
    // Plano liberado só para a demonstração (sem cobrança). `paymentProvider: "demo"` e `isDemo` deixam claro que não
    // é uma assinatura paga; o painel administrativo ignora a demonstração na receita e nos contadores.
    subscription: {
      planId: "business",
      planVersion: 2,
      status: "active",
      cycle: "monthly",
      priceCents: 0,
      paymentProvider: "demo",
      startedAt: iso(created),
      currentPeriodEnd: iso(now + 365 * DAY),
      nextPaymentDate: iso(now + 365 * DAY),
      cancelAtPeriodEnd: false,
    },
    onboarding: { completed: true, currentStep: 6, selectedPlanId: "business", startedAt: iso(created), completedAt: iso(created + 20 * MINUTE), updatedAt: iso(created + 20 * MINUTE) },
    setup: { tableCount: DEMO_TABLES.length },
    createdAt: iso(created),
    updatedAt: iso(now),
  };
}

export function deliveryAreaDoc(now: number) {
  const neighborhoods: Record<string, { name: string; feeCents: number; enabled: boolean }> = {};
  for (const [name, feeCents] of DEMO_NEIGHBORHOODS) neighborhoods[slugifyNeighborhood(name)] = { name, feeCents, enabled: true };
  return { cityName: DEMO_CITY.name, uf: DEMO_CITY.uf, ibgeCode: DEMO_CITY.ibgeCode, neighborhoods, updatedAt: new Date(now).toISOString() };
}

// ───────────────────────── Gerador determinístico ─────────────────────────

function hashSeed(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: string) {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
const pick = <T,>(r: Rand, list: readonly T[]) => list[Math.floor(r() * list.length) % list.length];
function weighted<T>(r: Rand, entries: readonly [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [value, w] of entries) {
    x -= w;
    if (x <= 0) return value;
  }
  return entries[entries.length - 1][0];
}
const between = (r: Rand, min: number, max: number) => min + Math.floor(r() * (max - min + 1));

const FIRST_NAMES = ["Ana", "Bruno", "Camila", "Diego", "Eduarda", "Felipe", "Gabriela", "Henrique", "Isabela", "João", "Larissa", "Lucas", "Mariana", "Mateus", "Natália", "Otávio", "Paula", "Rafael", "Renata", "Sofia", "Thiago", "Vanessa", "Vinícius", "Beatriz", "Caio", "Fernanda", "Gustavo", "Helena", "Igor", "Juliana"];
const INITIALS = "ABCDEFGHIJLMNOPRSTV";
const STREETS = ["Rua das Acácias", "Rua dos Ipês", "Avenida Central", "Rua do Comércio", "Rua das Palmeiras", "Rua Bela Vista", "Alameda dos Jasmins", "Rua das Hortênsias", "Rua São Bento", "Travessa das Flores"];
const CANCEL_REASONS = ["Cliente desistiu do pedido", "Endereço fora da área de entrega", "Item indisponível no momento", "Pagamento não confirmado"];

export type DemoChannel = "delivery" | "retirada" | "mesa" | "balcao" | "ifood" | "99food" | "keeta";
type Status = "pendente" | "confirmado" | "em_preparo" | "pronto" | "saiu_para_entrega" | "entregue" | "cancelado" | "recusado";

const SOURCE: Record<DemoChannel, { source: string; native: boolean; provider?: string; channel: string }> = {
  delivery: { source: "kardap_delivery", native: true, channel: "web" },
  retirada: { source: "kardap_pickup", native: true, channel: "web" },
  mesa: { source: "kardap_table", native: true, channel: "salao" },
  balcao: { source: "kardap_pdv", native: true, channel: "pdv" },
  ifood: { source: "ifood", native: false, provider: "iFood", channel: "marketplace" },
  "99food": { source: "99food", native: false, provider: "99Food", channel: "marketplace" },
  keeta: { source: "external_marketplace", native: false, provider: "Keeta", channel: "marketplace" },
};
const isDeliveryLike = (c: DemoChannel) => c === "delivery" || c === "ifood" || c === "99food" || c === "keeta";

/** Data local (São Paulo) de um instante, como Y/M/D. */
function spDate(ms: number) {
  const d = new Date(ms + SP_OFFSET);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), weekday: d.getUTCDay(), minute: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
/** Instante UTC do minuto `minuteOfDay` do dia local (São Paulo) `daysAgo` dias antes de `now`. */
function spInstant(now: number, daysAgo: number, minuteOfDay: number) {
  const t = spDate(now);
  return Date.UTC(t.y, t.m, t.d - daysAgo) - SP_OFFSET + minuteOfDay * MINUTE;
}
const dateKey = (ms: number) => {
  const t = spDate(ms);
  return `${t.y}${String(t.m + 1).padStart(2, "0")}${String(t.d).padStart(2, "0")}`;
};

/** Movimento relativo por dia da semana (0 = domingo). */
const WEEKDAY_WEIGHT = [1.25, 0.45, 0.7, 0.8, 0.95, 1.35, 1.55];
const BASE_ORDERS_PER_DAY = 4.4;
export const HISTORY_DAYS = 40;

type Line = { productId: string; quantity: number; notes?: string };

function chooseLines(r: Rand, channel: DemoChannel): Line[] {
  const byCat = (ids: string[]) => DEMO_PRODUCTS.filter((p) => ids.indexOf(p.categoryId) >= 0);
  const mains = byCat(["cat-burgers", "cat-pizzas", "cat-pizzas-especiais", "cat-combos"]);
  const sides = byCat(["cat-porcoes"]);
  const drinks = byCat(["cat-bebidas"]);
  const desserts = byCat(["cat-sobremesas"]);
  const weightedProduct = (list: DemoProduct[]) => weighted(r, list.map((p) => [p, p.popularity] as [DemoProduct, number]));
  const lines = new Map<string, Line>();
  const add = (p: DemoProduct, qty: number) => {
    const current = lines.get(p.id);
    if (current) current.quantity += qty;
    else lines.set(p.id, { productId: p.id, quantity: qty, ...(p.notes && r() < 0.25 ? { notes: pick(r, p.notes) } : {}) });
  };
  const people = channel === "mesa" ? between(r, 2, 5) : channel === "balcao" ? between(r, 1, 2) : between(r, 1, 4);
  const mainCount = Math.max(1, Math.round(people * (0.55 + r() * 0.4)));
  for (let i = 0; i < mainCount; i++) add(weightedProduct(mains), 1);
  if (r() < 0.55) add(weightedProduct(sides), 1);
  const drinkCount = channel === "mesa" ? people : r() < 0.6 ? between(r, 1, people) : 0;
  for (let i = 0; i < drinkCount; i++) add(weightedProduct(drinks), 1);
  if (r() < (channel === "mesa" ? 0.4 : 0.15)) add(weightedProduct(desserts), 1);
  return Array.from(lines.values());
}

export type DemoOrderDoc = Record<string, unknown> & { id: string; createdAtMs: number; status: Status; channel: DemoChannel; totalCents: number; paymentMethod: string };

type OrderSpec = {
  id: string;
  createdAtMs: number;
  channel: DemoChannel;
  status: Status;
  lines: Line[];
  r: Rand;
  tableId?: string;
  /** Pedido em andamento (operação "ao vivo"): sem pagamento confirmado. */
  live?: boolean;
};

function buildOrder(spec: OrderSpec, number: number): DemoOrderDoc {
  const { r, channel } = spec;
  const products = new Map(DEMO_PRODUCTS.map((p) => [p.id, p]));
  const items = spec.lines.map((l) => {
    const p = products.get(l.productId)!;
    return { productId: p.id, name: p.name, quantity: l.quantity, unitPriceCents: p.priceCents, totalCents: p.priceCents * l.quantity, costCents: p.costCents * l.quantity, ...(l.notes ? { notes: l.notes } : {}) };
  });
  const subtotalCents = items.reduce((s, i) => s + i.totalCents, 0);
  const customer = { name: `${pick(r, FIRST_NAMES)} ${INITIALS[Math.floor(r() * INITIALS.length)]}.`, phone: `0000000${String(between(r, 1000, 9999))}` };
  let deliveryFeeCents = 0;
  let address: Record<string, unknown> | undefined;
  if (isDeliveryLike(channel)) {
    const [district, fee] = pick(r, DEMO_NEIGHBORHOODS);
    deliveryFeeCents = channel === "delivery" ? fee : fee + 200;
    address = { cep: "00000-000", street: pick(r, STREETS), number: String(between(r, 10, 2400)), district, city: DEMO_CITY.name, uf: DEMO_CITY.uf };
  }
  const coupon = (channel === "delivery" || channel === "retirada") && r() < 0.14;
  const discountCents = coupon ? Math.round(subtotalCents * 0.1) : 0;
  const totalCents = subtotalCents + deliveryFeeCents - discountCents;
  const paymentMethod = SOURCE[channel].native
    ? weighted(r, [["pix", 45], ["cartao_credito", 30], ["cartao_debito", 15], ["dinheiro", 10]] as [string, number][])
    : "online";

  // Linha do tempo coerente com o status final.
  const flow: Status[] = isDeliveryLike(channel)
    ? ["pendente", "confirmado", "em_preparo", "pronto", "saiu_para_entrega", "entregue"]
    : ["pendente", "confirmado", "em_preparo", "pronto", "entregue"];
  const gaps: Record<Status, [number, number]> = { pendente: [0, 0], confirmado: [1, 4], em_preparo: [1, 5], pronto: [12, 26], saiu_para_entrega: [2, 8], entregue: [isDeliveryLike(channel) ? 14 : 3, isDeliveryLike(channel) ? 32 : 12], cancelado: [2, 15], recusado: [1, 6] };
  const history: { status: Status; at: string; by?: string }[] = [];
  let t = spec.createdAtMs;
  if (spec.status === "cancelado" || spec.status === "recusado") {
    history.push({ status: "pendente", at: new Date(t).toISOString() });
    if (spec.status === "cancelado" && r() < 0.5) {
      t += between(r, ...gaps.confirmado) * MINUTE;
      history.push({ status: "confirmado", at: new Date(t).toISOString(), by: "demo" });
    }
    t += between(r, ...gaps[spec.status]) * MINUTE;
    history.push({ status: spec.status, at: new Date(t).toISOString(), by: "demo" });
  } else {
    for (const step of flow) {
      if (step !== "pendente") t += between(r, ...gaps[step]) * MINUTE;
      history.push({ status: step, at: new Date(t).toISOString(), ...(step === "pendente" ? {} : { by: "demo" }) });
      if (step === spec.status) break;
    }
  }
  const lastAt = history[history.length - 1].at;
  const confirmedAt = history.find((h) => h.status === "confirmado")?.at;
  const source = SOURCE[channel];
  const table = spec.tableId ? DEMO_TABLES.find((x) => x.id === spec.tableId) : undefined;
  const paid = spec.status === "entregue" || (!source.native && spec.status !== "cancelado" && spec.status !== "recusado");

  return {
    id: spec.id,
    createdAtMs: spec.createdAtMs,
    channel,
    restaurantId: DEMO_RESTAURANT_ID,
    establishmentId: DEMO_RESTAURANT_ID,
    orderNumber: number,
    status: spec.status,
    customer,
    ...(address ? { address } : {}),
    ...(table ? { tableId: table.id, tableName: table.name } : {}),
    items,
    subtotalCents,
    deliveryFeeCents,
    discountCents,
    ...(coupon ? { coupon: "BRASA10" } : {}),
    totalCents,
    paymentMethod,
    paymentStatus: paid ? "pago" : "pendente",
    ...(spec.status === "cancelado" || spec.status === "recusado" ? { cancelReason: pick(r, CANCEL_REASONS) } : {}),
    origin: { source: source.source, channel: source.channel, isNativeOrder: source.native, simulated: true, ...(source.provider ? { provider: source.provider, externalOrderId: `SIM-${spec.id.toUpperCase()}` } : {}) },
    // Como em confirmNativeOrder: o pedido próprio consome a franquia do mês em que entra (mesmo se cancelado depois).
    ...(source.native ? { quota: { consumed: true, periodId: usagePeriodOf(spec.createdAtMs), consumedAt: new Date(spec.createdAtMs).toISOString() } } : {}),
    simulated: true,
    statusHistory: history,
    createdAt: new Date(spec.createdAtMs).toISOString(),
    updatedAt: lastAt,
    ...(confirmedAt ? { confirmedAt, confirmedBy: "demo" } : {}),
  };
}

/** Minuto do dia (São Paulo) de um pedido, respeitando o horário de funcionamento: almoço e jantar com pico às 20 h. */
function orderMinute(r: Rand, weekday: number) {
  const dinnerOnly = weekday === 1;
  const slot = dinnerOnly ? "jantar" : weighted(r, [["almoco", 38], ["tarde", 9], ["jantar", 53]] as [string, number][]);
  if (slot === "almoco") return between(r, 11 * 60 + 40, 14 * 60 + 40);
  if (slot === "tarde") return between(r, 15 * 60, 18 * 60);
  // Jantar: distribuição triangular com pico às 20h15.
  const a = 18 * 60 + 15, b = 22 * 60 + 50, c = 20 * 60 + 15;
  const u = r();
  const f = (c - a) / (b - a);
  return Math.round(u < f ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c)));
}

function channelFor(r: Rand, minute: number): DemoChannel {
  const lunch = minute < 15 * 60;
  return weighted(r, (lunch
    ? [["mesa", 34], ["balcao", 22], ["delivery", 22], ["retirada", 10], ["ifood", 8], ["99food", 3], ["keeta", 1]]
    : [["delivery", 36], ["mesa", 22], ["ifood", 14], ["retirada", 9], ["balcao", 9], ["99food", 6], ["keeta", 4]]) as [DemoChannel, number][]);
}

/**
 * Histórico simulado de `HISTORY_DAYS` dias até `now`, mais a operação em andamento (pedidos abertos agora).
 * Mesmo `now` no mesmo dia → mesmos pedidos (ids estáveis por data).
 */
export function generateOrders(now: number): DemoOrderDoc[] {
  const specs: OrderSpec[] = [];
  // Operação ao vivo: pedidos abertos agora (em minutos antes de `now`), um por etapa, com as mesas ocupadas.
  // Entram no lugar de parte do histórico de hoje, para o dia não ficar com movimento dobrado.
  const live: [string, DemoChannel, Status, number, string?][] = [
    ["live-01", "delivery", "pendente", 3],
    ["live-02", "mesa", "pendente", 6, "mesa-12"],
    ["live-03", "ifood", "confirmado", 9],
    ["live-04", "mesa", "em_preparo", 14, "mesa-04"],
    ["live-05", "retirada", "em_preparo", 17],
    ["live-06", "mesa", "pronto", 24, "mesa-07"],
    ["live-07", "delivery", "saiu_para_entrega", 38],
    ["live-08", "mesa", "entregue", 52, "mesa-10"],
  ];
  for (let daysAgo = HISTORY_DAYS - 1; daysAgo >= 0; daysAgo--) {
    const dayStart = spInstant(now, daysAgo, 0);
    const key = dateKey(dayStart + 12 * 60 * MINUTE);
    const r = rng(`brasa-${key}`);
    const weekday = spDate(dayStart + 12 * 60 * MINUTE).weekday;
    // Crescimento: as duas últimas semanas vendem cerca de 18% a mais que o começo do período.
    const growth = 0.88 + (0.3 * (HISTORY_DAYS - daysAgo)) / HISTORY_DAYS;
    const expected = BASE_ORDERS_PER_DAY * WEEKDAY_WEIGHT[weekday] * growth;
    const count = Math.max(daysAgo === 0 ? 0 : 1, Math.round(expected + (r() - 0.5) * 2) - (daysAgo === 0 ? live.length : 0));
    const minutes = Array.from({ length: count }, () => orderMinute(r, weekday)).sort((a, b) => a - b);
    minutes.forEach((minute, i) => {
      const createdAtMs = dayStart + minute * MINUTE;
      // Só o que já deveria estar concluído: os pedidos das últimas 2 horas ficam por conta da operação ao vivo.
      if (createdAtMs > now - 2 * 60 * MINUTE) return;
      const channel = channelFor(r, minute);
      const status: Status = weighted(r, (isDeliveryLike(channel) ? [["entregue", 92], ["cancelado", 5], ["recusado", 3]] : [["entregue", 96], ["cancelado", 4]]) as [Status, number][]);
      const tableId = channel === "mesa" ? pick(r, DEMO_TABLES).id : undefined;
      specs.push({ id: `demo-${key}-${String(i + 1).padStart(2, "0")}`, createdAtMs, channel, status, lines: chooseLines(r, channel), r, tableId });
    });
  }

  const liveRand = rng(`brasa-live-${dateKey(now)}`);
  for (const [id, channel, status, minutesAgo, tableId] of live) {
    specs.push({ id: `demo-${dateKey(now)}-${id}`, createdAtMs: now - minutesAgo * MINUTE - between(liveRand, 0, 40) * 1000, channel, status, lines: chooseLines(liveRand, channel), r: liveRand, tableId, live: true });
  }

  specs.sort((a, b) => a.createdAtMs - b.createdAtMs);
  // Numeração contínua, terminando num número "de casa com movimento".
  const first = 4127;
  return specs.map((spec, i) => buildOrder(spec, first + i));
}

// ───────────────────────── Mesas e chamados ─────────────────────────

export function tableDocs(now: number, orders: DemoOrderDoc[]) {
  const occupied = new Set(orders.filter((o) => o.channel === "mesa" && typeof o.tableId === "string" && now - o.createdAtMs < 90 * MINUTE).map((o) => o.tableId as string));
  // Mesa 03: cliente chegou e chamou o garçom (sem pedido ainda).
  occupied.add("mesa-03");
  const iso = new Date(now - 30 * DAY).toISOString();
  return DEMO_TABLES.map((t) => ({ ...t, restaurantId: DEMO_RESTAURANT_ID, status: occupied.has(t.id) ? "ocupada" : "livre", createdAt: iso, updatedAt: new Date(now).toISOString() }));
}

/** Chamados das mesas: aguardando, em atendimento e um histórico concluído (os relatórios de chamados usam estes dados). */
export function callDocs(now: number) {
  const r = rng(`brasa-calls-${dateKey(now)}`);
  const at = (minutesAgo: number) => new Date(now - minutesAgo * MINUTE).toISOString();
  const open = [
    { id: "call-live-01", table: "Mesa 07", type: "Preciso de atendimento na mesa", status: "ativo", createdAt: at(2) },
    { id: "call-live-02", table: "Mesa 10", type: "Fechar a conta (Cartão / Pix / Dinheiro)", status: "ativo", createdAt: at(4) },
    { id: "call-live-03", table: "Mesa 03", type: "Fazer um pedido", status: "andamento", createdAt: at(7) },
  ];
  const reasons: [string, number][] = [
    ["Fazer um pedido", 40],
    ["Fechar a conta (Cartão / Pix / Dinheiro)", 30],
    ["Solicitar guardanapo, talher ou gelo", 14],
    ["Tirar dúvida sobre o cardápio", 9],
    ["Preciso de atendimento na mesa", 7],
  ];
  const history = Array.from({ length: 44 }, (_, i) => {
    const daysAgo = Math.floor(i / 4) + 1;
    return { id: `call-hist-${String(i + 1).padStart(2, "0")}`, table: pick(r, DEMO_TABLES).name, type: weighted(r, reasons), status: "concluido", createdAt: new Date(spInstant(now, daysAgo, orderMinute(r, 5))).toISOString() };
  });
  return [...open, ...history].map((c) => ({ ...c, simulated: true }));
}

// ───────────────────────── Franquia de pedidos próprios ─────────────────────────

export function usagePeriodOf(ms: number) {
  const t = spDate(ms);
  return `${t.y}-${String(t.m + 1).padStart(2, "0")}`;
}

/** Pedidos próprios por mês (consomem a franquia), como o servidor contaria em uso/{AAAA-MM}. */
export function usageByPeriod(orders: DemoOrderDoc[]) {
  const map = new Map<string, number>();
  for (const o of orders) {
    const quota = o.quota as { periodId: string } | undefined;
    if (!quota) continue;
    map.set(quota.periodId, (map.get(quota.periodId) || 0) + 1);
  }
  return map;
}

// ───────────────────────── Financeiro simulado ─────────────────────────

const RELEASE_DAYS = 15;
const WITHDRAWAL_INTERVAL_DAYS = 15;

/**
 * Vendas online (Pix e cartão de crédito pelo link de delivery/retirada) concluídas viram transações do módulo
 * financeiro, com as mesmas taxas e a mesma carência de liberação do sistema (lib/financial). Um saque já pago, de
 * 17 dias atrás, mostra o ciclo completo; o saldo liberado depois dele fica disponível para um novo saque ao vivo.
 */
export function financialDocs(now: number, orders: DemoOrderDoc[], settings: FinancialSettings) {
  const transactions = orders
    .filter((o) => (o.channel === "delivery" || o.channel === "retirada") && o.status === "entregue" && (o.paymentMethod === "pix" || o.paymentMethod === "cartao_credito"))
    .map((o) => {
      const confirmedMs = Date.parse(String(o.confirmedAt || o.createdAt));
      const fees = calculateFees(o.totalCents, settings, DEMO_RESTAURANT_ID);
      const settled = now - confirmedMs > 2 * DAY;
      const releaseMs = confirmedMs + RELEASE_DAYS * DAY;
      const released = settled && releaseMs <= now;
      return {
        id: `demo-tx-${o.id}`,
        restaurant_id: DEMO_RESTAURANT_ID,
        order_id: o.id,
        payment_id: `SIM-PAY-${o.orderNumber}`,
        gateway: "mercadopago",
        gateway_transaction_id: `SIM-${o.orderNumber}`,
        ...fees,
        payment_status: "aprovado",
        settlement_status: settled ? "liquidado" : "aguardando",
        created_at: new Date(confirmedMs).toISOString(),
        confirmed_at: new Date(confirmedMs).toISOString(),
        ...(settled ? { settled_at: new Date(confirmedMs + 2 * DAY).toISOString(), release_at: new Date(releaseMs).toISOString() } : {}),
        ...(released ? { released_at: new Date(releaseMs).toISOString() } : {}),
        gateway_fee_confirmed: settled,
        is_demo: true,
        simulated: true,
      };
    });

  // Saque pago: pedido há 17 dias, com tudo o que já tinha sido liberado até então.
  const withdrawalRequestedMs = now - 17 * DAY;
  const withdrawnTx = transactions.filter((t) => t.released_at && Date.parse(t.released_at) <= withdrawalRequestedMs);
  const withdrawnCents = withdrawnTx.reduce((s, t) => s + t.restaurant_net_cents, 0);
  const releasedCents = transactions.filter((t) => t.released_at).reduce((s, t) => s + t.restaurant_net_cents, 0);
  const pendingCents = transactions.filter((t) => !t.released_at).reduce((s, t) => s + t.restaurant_net_cents, 0);
  const iso = (ms: number) => new Date(ms).toISOString();

  const withdrawals =
    withdrawnCents > 0
      ? [
          {
            id: "demo-withdrawal-01",
            restaurant_id: DEMO_RESTAURANT_ID,
            amount_cents: withdrawnCents,
            status: "paid",
            pix_key_reference: "chave-pix-demonstrativa",
            requested_at: iso(withdrawalRequestedMs),
            next_withdrawal_allowed_at: iso(withdrawalRequestedMs + WITHDRAWAL_INTERVAL_DAYS * DAY),
            approved_at: iso(withdrawalRequestedMs + 20 * 60 * MINUTE),
            approved_by: "demo",
            paid_at: iso(withdrawalRequestedMs + 26 * 60 * MINUTE),
            transfer_transaction_id: "SIM-TRANSFERENCIA-0001",
            is_demo: true,
            simulated: true,
          },
        ]
      : [];

  const balance = {
    restaurant_id: DEMO_RESTAURANT_ID,
    pending_cents: pendingCents,
    available_cents: releasedCents - withdrawnCents,
    reserved_cents: 0,
    paid_out_cents: withdrawnCents,
    updated_at: iso(now),
    ...(withdrawals.length ? { last_withdrawal_requested_at: iso(withdrawalRequestedMs), next_withdrawal_allowed_at: iso(withdrawalRequestedMs + WITHDRAWAL_INTERVAL_DAYS * DAY) } : {}),
    is_demo: true,
    simulated: true,
  };

  const ledger = [
    ...transactions.map((t) => ({ id: `demo-ledger-${t.order_id}`, restaurant_id: DEMO_RESTAURANT_ID, transaction_id: t.id, type: "credito", amount_cents: t.restaurant_net_cents, currency: "BRL", description: "Venda online (simulada)", created_at: t.created_at, is_demo: true })),
    ...withdrawals.map((w) => ({ id: `demo-ledger-${w.id}`, restaurant_id: DEMO_RESTAURANT_ID, payout_id: w.id, type: "repasse", amount_cents: -w.amount_cents, currency: "BRL", description: "Saque pago (simulado)", created_at: w.paid_at, is_demo: true })),
  ];

  return { transactions, withdrawals, balance, ledger };
}
