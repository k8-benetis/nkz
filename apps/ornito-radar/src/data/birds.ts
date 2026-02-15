// =============================================================================
// Bird Data - Beneficial Birds for Agricultural Pest Control
// =============================================================================
// Comprehensive database of birds that help farmers with biological pest control
// Each bird entry includes ecological function, audio reference, and detailed information
// Images from Wikimedia Commons and eBird (reliable bird photography sources)
// Audio references from Xeno-canto (XC IDs are examples - should be updated with real IDs)

export interface Bird {
  id: string;
  commonName: string;
  scientificName: string;
  ecologicalFunction: string;
  targetPests: string[];
  imageUrl: string;
  xenoCantoId: string;
  description: string;
  habitat: string;
  season: 'year-round' | 'spring-summer' | 'winter' | 'migration';
  status: 'common' | 'uncommon' | 'rare';
  effectiveness?: string; // How effective this bird is at pest control
  conservationStatus?: string; // Conservation status
}

export const beneficialBirds: Bird[] = [
  {
    id: 'carbonero-comun',
    commonName: 'Carbonero Común',
    scientificName: 'Parus major',
    ecologicalFunction: 'Depredador Especializado de Orugas y Larvas',
    targetPests: ['orugas de lepidópteros', 'larvas de escarabajos', 'pulgones', 'cochinillas', 'minadores de hojas'],
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Parus_major_-_Great_Tit_%28song%29.jpg/800px-Parus_major_-_Great_Tit_%28song%29.jpg',
    xenoCantoId: 'XC123456',
    description: 'Ave insectívora muy común y activa que se alimenta principalmente de orugas y larvas de insectos perjudiciales para los cultivos. Durante la época de cría, una pareja puede consumir hasta 10.000 orugas para alimentar a sus polluelos. Es especialmente eficaz en huertos, viñedos y cultivos arbóreos donde controla plagas de forma natural.',
    habitat: 'Bosques caducifolios, parques, jardines, huertos, viñedos y zonas agrícolas con árboles',
    season: 'year-round',
    status: 'common',
    effectiveness: 'Muy alta - Consume grandes cantidades de orugas durante la cría',
    conservationStatus: 'Preocupación menor (LC)',
  },
  {
    id: 'lechuza-comun',
    commonName: 'Lechuza Común',
    scientificName: 'Tyto alba',
    ecologicalFunction: 'Control Especializado de Roedores',
    targetPests: ['ratones de campo', 'topillos', 'ratas', 'musarañas', 'pequeños roedores'],
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Barn_Owl_%28Tyto_alba%29_%281%29.jpg/800px-Barn_Owl_%28Tyto_alba%29_%281%29.jpg',
    xenoCantoId: 'XC234567',
    description: 'Rapaz nocturna especializada en el control de roedores. Una pareja puede consumir hasta 3.000 roedores al año, siendo un aliado fundamental en el control biológico de plagas de roedores en cultivos de cereales, leguminosas y hortalizas. Su capacidad de caza silenciosa la convierte en un depredador muy eficaz.',
    habitat: 'Campo abierto, graneros, edificios abandonados, taludes, zonas agrícolas extensivas',
    season: 'year-round',
    status: 'common',
    effectiveness: 'Excelente - Controla poblaciones de roedores de forma natural',
    conservationStatus: 'Preocupación menor (LC)',
  },
  {
    id: 'cernicalo-vulgar',
    commonName: 'Cernícalo Vulgar',
    scientificName: 'Falco tinnunculus',
    ecologicalFunction: 'Depredador de Insectos Grandes y Roedores',
    targetPests: ['saltamontes', 'langostas', 'ratones pequeños', 'topillos', 'escarabajos grandes'],
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Falco_tinnunculus_01.jpg/800px-Falco_tinnunculus_01.jpg',
    xenoCantoId: 'XC345678',
    description: 'Pequeña rapaz diurna que se alimenta de insectos grandes y pequeños roedores. Su técnica de cernido (vuelo estacionario) le permite localizar presas con precisión en campos abiertos. Es muy beneficiosa en pastizales, campos de cereales y zonas agrícolas extensivas donde controla plagas de saltamontes y roedores.',
    habitat: 'Campos abiertos, pastizales, zonas agrícolas extensivas, terrenos baldíos',
    season: 'year-round',
    status: 'common',
    effectiveness: 'Alta - Controla saltamontes y roedores en campos abiertos',
    conservationStatus: 'Preocupación menor (LC)',
  },
  {
    id: 'golondrina-comun',
    commonName: 'Golondrina Común',
    scientificName: 'Hirundo rustica',
    ecologicalFunction: 'Control Aéreo Especializado de Insectos Voladores',
    targetPests: ['moscas', 'mosquitos', 'pequeños escarabajos voladores', 'tripes', 'pulgones alados'],
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Hirundo_rustica_01.jpg/800px-Hirundo_rustica_01.jpg',
    xenoCantoId: 'XC456789',
    description: 'Ave migratoria que se alimenta exclusivamente de insectos en vuelo. Durante la época de cría, una pareja puede capturar miles de insectos al día para alimentar a sus polluelos, reduciendo significativamente las poblaciones de plagas aéreas. Es especialmente útil en zonas ganaderas donde controla moscas y mosquitos.',
    habitat: 'Zonas rurales, graneros, edificios agrícolas, establos, zonas con agua',
    season: 'spring-summer',
    status: 'common',
    effectiveness: 'Muy alta - Controla grandes cantidades de insectos voladores',
    conservationStatus: 'Vulnerable (VU) - Población en declive',
  },
  {
    id: 'herrerillo-comun',
    commonName: 'Herrerillo Común',
    scientificName: 'Cyanistes caeruleus',
    ecologicalFunction: 'Depredador de Orugas y Pulgones',
    targetPests: ['orugas', 'pulgones', 'cochinillas', 'larvas de escarabajos', 'minadores'],
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Cyanistes_caeruleus_01.jpg/800px-Cyanistes_caeruleus_01.jpg',
    xenoCantoId: 'XC567890',
    description: 'Pequeño pájaro insectívoro muy activo que se alimenta principalmente de orugas y pulgones. Es especialmente útil en huertos, viñedos y cultivos arbóreos donde controla plagas de forma natural. Durante la cría, puede visitar el nido hasta 400 veces al día para alimentar a los polluelos.',
    habitat: 'Bosques caducifolios, jardines, parques, huertos, viñedos, zonas agrícolas con árboles',
    season: 'year-round',
    status: 'common',
    effectiveness: 'Alta - Muy activo en el control de pulgones y orugas',
    conservationStatus: 'Preocupación menor (LC)',
  },
  {
    id: 'mochuelo-comun',
    commonName: 'Mochuelo Común',
    scientificName: 'Athene noctua',
    ecologicalFunction: 'Control de Roedores e Insectos Nocturnos',
    targetPests: ['ratones', 'topillos', 'saltamontes', 'escarabajos', 'grillos', 'polillas'],
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Athene_noctua_-_Little_Owl.jpg/800px-Athene_noctua_-_Little_Owl.jpg',
    xenoCantoId: 'XC678901',
    description: 'Pequeña rapaz nocturna que se alimenta de roedores e insectos. Es muy beneficiosa en cultivos de secano donde controla poblaciones de topillos y otros roedores. También consume grandes cantidades de insectos nocturnos, incluyendo polillas que pueden ser plagas de cultivos.',
    habitat: 'Campos abiertos, olivares, zonas agrícolas con muros y árboles, terrenos pedregosos',
    season: 'year-round',
    status: 'common',
    effectiveness: 'Alta - Controla roedores e insectos nocturnos',
    conservationStatus: 'Preocupación menor (LC)',
  },
  {
    id: 'abejaruco-comun',
    commonName: 'Abejaruco Común',
    scientificName: 'Merops apiaster',
    ecologicalFunction: 'Control de Insectos Voladores Grandes',
    targetPests: ['abejas silvestres', 'avispas', 'libélulas', 'escarabajos voladores', 'saltamontes voladores'],
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Merops_apiaster_01.jpg/800px-Merops_apiaster_01.jpg',
    xenoCantoId: 'XC789012',
    description: 'Ave migratoria muy colorida que se alimenta de insectos voladores, especialmente abejas y avispas. Aunque puede consumir abejas, también controla avispas y otros insectos perjudiciales. Es muy eficaz capturando insectos grandes en vuelo, ayudando a mantener el equilibrio ecológico.',
    habitat: 'Zonas abiertas, campos de cultivo, taludes arenosos, zonas con agua',
    season: 'spring-summer',
    status: 'common',
    effectiveness: 'Media-Alta - Controla avispas y otros insectos voladores grandes',
    conservationStatus: 'Preocupación menor (LC)',
  },
  {
    id: 'alcaudon-comun',
    commonName: 'Alcaudón Común',
    scientificName: 'Lanius senator',
    ecologicalFunction: 'Depredador de Insectos Grandes y Pequeños Vertebrados',
    targetPests: ['saltamontes', 'langostas', 'escarabajos grandes', 'lagartijas', 'pequeños roedores'],
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Lanius_senator_01.jpg/800px-Lanius_senator_01.jpg',
    xenoCantoId: 'XC890123',
    description: 'Ave paseriforme depredadora que se alimenta de insectos grandes y pequeños vertebrados. Es muy eficaz controlando saltamontes y langostas en pastizales y campos de cultivo. Tiene la costumbre de almacenar presas en "despensas" (espinas o alambres), lo que le permite cazar más de lo que consume inmediatamente.',
    habitat: 'Zonas abiertas con arbustos, campos de cultivo, pastizales, dehesas',
    season: 'spring-summer',
    status: 'common',
    effectiveness: 'Alta - Especializado en saltamontes y langostas',
    conservationStatus: 'Preocupación menor (LC)',
  },
  {
    id: 'estornino-negro',
    commonName: 'Estornino Negro',
    scientificName: 'Sturnus unicolor',
    ecologicalFunction: 'Control de Larvas e Insectos del Suelo',
    targetPests: ['larvas de escarabajos', 'orugas', 'saltamontes', 'gusanos', 'caracoles'],
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Sturnus_unicolor_01.jpg/800px-Sturnus_unicolor_01.jpg',
    xenoCantoId: 'XC901234',
    description: 'Ave gregaria que se alimenta de larvas e insectos en el suelo. Forma bandadas que pueden controlar eficazmente plagas de larvas en pastizales y campos de cultivo. Es especialmente útil en zonas ganaderas donde controla larvas de moscas y otros insectos del suelo.',
    habitat: 'Zonas abiertas, pastizales, campos de cultivo, zonas urbanas, parques',
    season: 'year-round',
    status: 'common',
    effectiveness: 'Media-Alta - Controla larvas en bandadas',
    conservationStatus: 'Preocupación menor (LC)',
  },
  {
    id: 'cogujada-comun',
    commonName: 'Cogujada Común',
    scientificName: 'Galerida cristata',
    ecologicalFunction: 'Control de Semillas de Malas Hierbas e Insectos',
    targetPests: ['insectos del suelo', 'larvas', 'semillas de malas hierbas', 'pequeños escarabajos'],
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Galerida_cristata_01.jpg/800px-Galerida_cristata_01.jpg',
    xenoCantoId: 'XC012345',
    description: 'Ave que se alimenta tanto de insectos como de semillas. Ayuda a controlar plagas de insectos del suelo y también consume semillas de malas hierbas, reduciendo su propagación en campos de cultivo. Es especialmente útil en cultivos extensivos donde ayuda a mantener el equilibrio ecológico.',
    habitat: 'Campos abiertos, pastizales, zonas agrícolas extensivas, terrenos baldíos',
    season: 'year-round',
    status: 'common',
    effectiveness: 'Media - Controla insectos y semillas de malas hierbas',
    conservationStatus: 'Preocupación menor (LC)',
  },
  {
    id: 'curruca-cabecinegra',
    commonName: 'Curruca Cabecinegra',
    scientificName: 'Sylvia melanocephala',
    ecologicalFunction: 'Depredador de Orugas y Pulgones en Arbustos',
    targetPests: ['orugas', 'pulgones', 'larvas', 'arañas', 'pequeños escarabajos'],
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Sylvia_melanocephala_01.jpg/800px-Sylvia_melanocephala_01.jpg',
    xenoCantoId: 'XC112233',
    description: 'Pequeño pájaro insectívoro que se alimenta principalmente de orugas y pulgones en arbustos y árboles. Es muy útil en cultivos arbustivos como olivares y viñedos donde controla plagas de forma natural. Su dieta incluye una gran variedad de insectos pequeños que pueden ser perjudiciales para los cultivos.',
    habitat: 'Matorrales, olivares, viñedos, zonas con arbustos, jardines mediterráneos',
    season: 'year-round',
    status: 'common',
    effectiveness: 'Media-Alta - Especializado en arbustos y cultivos leñosos',
    conservationStatus: 'Preocupación menor (LC)',
  },
  {
    id: 'verderon-comun',
    commonName: 'Verderón Común',
    scientificName: 'Chloris chloris',
    ecologicalFunction: 'Control de Semillas de Malas Hierbas',
    targetPests: ['semillas de malas hierbas', 'insectos ocasionales', 'larvas pequeñas'],
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Chloris_chloris_01.jpg/800px-Chloris_chloris_01.jpg',
    xenoCantoId: 'XC223344',
    description: 'Ave principalmente granívora que consume grandes cantidades de semillas de malas hierbas, ayudando a controlar su propagación en campos de cultivo. Durante la época de cría también consume insectos, proporcionando control adicional de plagas. Es especialmente útil en cultivos extensivos donde reduce la competencia de malas hierbas.',
    habitat: 'Jardines, parques, zonas agrícolas con árboles y arbustos, huertos',
    season: 'year-round',
    status: 'common',
    effectiveness: 'Media - Controla semillas de malas hierbas',
    conservationStatus: 'Preocupación menor (LC)',
  },
  {
    id: 'petirrojo-europeo',
    commonName: 'Petirrojo Europeo',
    scientificName: 'Erithacus rubecula',
    ecologicalFunction: 'Depredador de Insectos del Suelo y Larvas',
    targetPests: ['larvas de escarabajos', 'gusanos', 'caracoles', 'babosas', 'insectos del suelo'],
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Erithacus_rubecula_-_European_Robin.jpg/800px-Erithacus_rubecula_-_European_Robin.jpg',
    xenoCantoId: 'XC334455',
    description: 'Ave insectívora que se alimenta principalmente de insectos del suelo, larvas y pequeños invertebrados. Es muy beneficiosa en huertos y jardines donde controla plagas de forma natural. Su comportamiento territorial ayuda a mantener una distribución uniforme del control de plagas en el área.',
    habitat: 'Bosques, jardines, parques, huertos, zonas con vegetación densa',
    season: 'year-round',
    status: 'common',
    effectiveness: 'Media - Controla insectos del suelo y larvas',
    conservationStatus: 'Preocupación menor (LC)',
  },
  {
    id: 'zorzal-comun',
    commonName: 'Zorzal Común',
    scientificName: 'Turdus philomelos',
    ecologicalFunction: 'Depredador de Caracoles, Babosas e Insectos',
    targetPests: ['caracoles', 'babosas', 'gusanos', 'larvas', 'insectos del suelo'],
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Turdus_philomelos_-_Song_Thrush.jpg/800px-Turdus_philomelos_-_Song_Thrush.jpg',
    xenoCantoId: 'XC445566',
    description: 'Ave que se alimenta de caracoles, babosas, gusanos e insectos del suelo. Es especialmente útil en huertos y jardines donde controla plagas de moluscos de forma natural. Tiene la costumbre de romper caracoles contra piedras, lo que facilita su consumo.',
    habitat: 'Bosques, jardines, parques, huertos, zonas con árboles y matorrales',
    season: 'year-round',
    status: 'common',
    effectiveness: 'Alta - Especializado en caracoles y babosas',
    conservationStatus: 'Preocupación menor (LC)',
  },
  {
    id: 'agateador-comun',
    commonName: 'Agateador Común',
    scientificName: 'Certhia brachydactyla',
    ecologicalFunction: 'Depredador de Insectos de la Corteza',
    targetPests: ['insectos de la corteza', 'larvas de escarabajos', 'arañas', 'huevos de insectos'],
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Certhia_brachydactyla_-_Short-toed_Treecreeper.jpg/800px-Certhia_brachydactyla_-_Short-toed_Treecreeper.jpg',
    xenoCantoId: 'XC556677',
    description: 'Pequeño pájaro especializado en buscar insectos en la corteza de los árboles. Es muy útil en huertos y bosques donde controla plagas de insectos que viven en la corteza, incluyendo larvas de escarabajos que pueden dañar los árboles.',
    habitat: 'Bosques caducifolios, parques, jardines con árboles viejos, huertos',
    season: 'year-round',
    status: 'common',
    effectiveness: 'Media - Especializado en insectos de la corteza',
    conservationStatus: 'Preocupación menor (LC)',
  },
  {
    id: 'pico-picapinos',
    commonName: 'Pico Picapinos',
    scientificName: 'Dendrocopos major',
    ecologicalFunction: 'Control de Insectos Xilófagos',
    targetPests: ['larvas de escarabajos xilófagos', 'insectos de la madera', 'hormigas carpinteras'],
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Dendrocopos_major_-_Great_Spotted_Woodpecker.jpg/800px-Dendrocopos_major_-_Great_Spotted_Woodpecker.jpg',
    xenoCantoId: 'XC667788',
    description: 'Pájaro carpintero que se alimenta de larvas de insectos xilófagos (que comen madera) en los árboles. Es muy beneficioso en huertos y bosques donde controla plagas que pueden dañar los árboles. Su capacidad para detectar larvas bajo la corteza lo convierte en un controlador natural muy eficaz.',
    habitat: 'Bosques, parques, jardines con árboles, huertos, zonas arboladas',
    season: 'year-round',
    status: 'common',
    effectiveness: 'Alta - Controla insectos xilófagos en árboles',
    conservationStatus: 'Preocupación menor (LC)',
  },
];

/**
 * Get bird by ID
 */
export const getBirdById = (id: string): Bird | undefined => {
  return beneficialBirds.find(bird => bird.id === id);
};

/**
 * Get Xeno-canto audio URL
 * Xeno-canto uses format: https://xeno-canto.org/{id}/download
 * Or direct: https://xeno-canto.org/sounds/uploaded/{id}.mp3
 */
export const getXenoCantoUrl = (xenoCantoId: string): string => {
  // Remove 'XC' prefix if present
  const id = xenoCantoId.replace(/^XC/, '');
  // Try direct download URL first
  return `https://xeno-canto.org/${id}/download`;
};
