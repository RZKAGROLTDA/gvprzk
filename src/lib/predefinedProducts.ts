// Lista de produtos pré-definidos consolidada

// Produtos oficiais para Ofertar (usados em Ligação, Visita à Fazenda e Visita Técnica)
export const offerProducts = [
  { name: 'Pneus', category: 'tires' },
  { name: 'Lubrificantes', category: 'lubricants' },
  { name: 'Óleos', category: 'oils' },
  { name: 'Graxas', category: 'greases' },
  { name: 'Baterias', category: 'batteries' },
  { name: 'Silo Bolsa', category: 'other' },
  { name: 'Cool Gard', category: 'other' },
  { name: 'Disco', category: 'other' },
  { name: 'Peças', category: 'parts' },
  { name: 'Serviços', category: 'services' },
];

// Itens de checklist específicos da oficina
export const workshopChecklistItems = [
  { name: 'Verificação de Óleo do Motor', category: 'oils' },
  { name: 'Inspeção de Freios', category: 'other' },
  { name: 'Verificação de Pneus', category: 'tires' },
  { name: 'Teste de Bateria', category: 'batteries' },
  { name: 'Verificação de Luzes', category: 'other' },
  { name: 'Inspeção de Suspensão', category: 'other' },
  { name: 'Verificação de Líquidos', category: 'oils' },
  { name: 'Diagnóstico Eletrônico', category: 'other' },
  { name: 'Limpeza Geral', category: 'other' },
];

// Mantido para retrocompatibilidade (autocomplete e buscas genéricas)
export const predefinedProducts = [...offerProducts, ...workshopChecklistItems];

export const getProductSuggestions = (query: string, limit: number = 10) => {
  if (!query.trim()) return predefinedProducts.slice(0, limit);
  
  const lowerQuery = query.toLowerCase();
  return predefinedProducts
    .filter(product => 
      product.name.toLowerCase().includes(lowerQuery) ||
      product.category.toLowerCase().includes(lowerQuery)
    )
    .slice(0, limit);
};