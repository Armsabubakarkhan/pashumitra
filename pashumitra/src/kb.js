// Veterinary knowledge base for the Disease Library and the Ask AI assistant.
// Content is general awareness material. It never contains drug doses.
// Sources to review with a veterinarian: Animal Husbandry Department and university extension guides.

export const LIBRARY = [
  {
    id: 'fmd', name: 'Foot and Mouth Disease (FMD)', species: ['cattle', 'buffalo', 'sheep', 'goat'],
    keywords: ['fmd', 'foot', 'mouth', 'blister', 'blisters', 'drool', 'drooling', 'saliva', 'limp', 'limping', 'lame', 'lameness', 'hoof', 'vesicle', 'ulcer'],
    summary: 'A highly contagious viral disease of cloven-hoofed animals. It spreads quickly between animals and farms.',
    signs: ['Fever', 'Drooling and smacking of lips', 'Blisters or sores in the mouth, on the tongue or between the hooves', 'Limping or reluctance to walk', 'Sharp drop in milk and appetite'],
    now: ['Separate the animal from the herd right away', 'Give it its own clean water and feed, and use separate buckets and tools', 'Wash hands and boots after handling and before touching other animals', 'Soft feed and shade help it eat while waiting for the vet'],
    vet: 'Call a veterinarian within 24 hours. FMD is a reportable disease, so the vet or the local Animal Husbandry office will guide reporting and testing.',
    prevention: 'Routine vaccination on the schedule your local vet recommends, quarantine for new animals, and limiting visitors and shared equipment.'
  },
  {
    id: 'lsd', name: 'Lumpy Skin Disease (LSD)', species: ['cattle', 'buffalo'],
    keywords: ['lsd', 'lumpy', 'skin', 'nodule', 'nodules', 'lump', 'lumps', 'swelling', 'swellings', 'bumps', 'pox'],
    summary: 'A viral disease of cattle and buffalo spread mainly by biting insects such as flies, mosquitoes and ticks.',
    signs: ['Firm round lumps in the skin, often 2 to 5 cm across', 'Fever and loss of appetite', 'Swollen lymph glands', 'Discharge from eyes or nose', 'Reduced milk'],
    now: ['Separate affected animals', 'Keep flies and mosquitoes away with clean housing, drainage and nets or screens', 'Provide shade, clean water and soft feed', 'Do not share tools between animals'],
    vet: 'Call a veterinarian within 24 hours and tell your local Animal Husbandry office about suspected cases.',
    prevention: 'Vaccination as advised locally, insect control, and not moving sick animals.'
  },
  {
    id: 'mastitis', name: 'Mastitis', species: ['cattle', 'buffalo', 'sheep', 'goat'],
    keywords: ['mastitis', 'udder', 'teat', 'milk', 'clots', 'clot', 'swollen', 'hot', 'quarter', 'flakes', 'watery'],
    summary: 'Inflammation of the udder, usually from infection. It lowers milk yield and quality.',
    signs: ['Hot, hard or swollen quarter', 'Clots, flakes or watery milk', 'Pain when the udder is touched', 'Fever in severe cases', 'Reduced milk'],
    now: ['Wash hands and clean the udder before milking', 'Milk the affected quarter last and keep that milk away from the supply', 'Keep bedding clean and dry', 'Do not give antibiotics on your own'],
    vet: 'Call a veterinarian within 24 hours. Only the vet should choose treatment and tell you how long to hold the milk.',
    prevention: 'Clean milking routine, teat dipping, dry bedding, and regular checks of milk in a strip cup.'
  },
  {
    id: 'bloat', name: 'Bloat', species: ['cattle', 'buffalo', 'sheep', 'goat'],
    keywords: ['bloat', 'bloated', 'tympany', 'distended', 'gas', 'swollen', 'left', 'side', 'belly', 'abdomen', 'overeating'],
    summary: 'A build-up of gas in the rumen. It can become fatal within hours.',
    signs: ['Swelling on the left side behind the ribs', 'Restlessness, kicking at the belly', 'Difficulty breathing, grunting', 'Stops eating and chewing cud'],
    now: ['Call a veterinarian immediately', 'Keep the animal standing and calm, walk it gently if it will walk', 'Stop access to fresh legumes, wet fodder or grain', 'Do not force-feed oil or medicine without the vet'],
    vet: 'This is an emergency. Call a veterinarian now.',
    prevention: 'Introduce lush legume pasture slowly, feed dry roughage first, and avoid sudden feed changes.'
  },
  {
    id: 'heat_stress', name: 'Heat stress', species: ['cattle', 'buffalo', 'sheep', 'goat', 'poultry'],
    keywords: ['heat', 'hot', 'panting', 'thi', 'summer', 'temperature', 'humidity', 'sun', 'shade', 'drooling', 'breathing'],
    summary: 'Animals struggle to lose body heat when temperature and humidity are both high. The Temperature Humidity Index (THI) tells you how severe it is.',
    signs: ['Fast, open-mouth breathing and panting', 'Drooling', 'Standing apart and seeking shade or water', 'Lower feed intake and milk or egg output'],
    now: ['Move animals into shade with good airflow', 'Provide plenty of clean, cool water', 'Use fans or sprinklers where possible', 'Avoid handling or walking animals during the hottest hours'],
    vet: 'Call a veterinarian if panting continues after cooling, if the animal collapses, or if THI is in the severe or danger band.',
    prevention: 'Shade, ventilation, water points close to the herd, and feeding in the cooler hours.'
  },
  {
    id: 'respiratory', name: 'Respiratory disease (pneumonia)', species: ['cattle', 'buffalo', 'sheep', 'goat', 'poultry'],
    keywords: ['cough', 'coughing', 'breathing', 'breath', 'pneumonia', 'respiratory', 'nasal', 'nose', 'discharge', 'wheeze', 'fast', 'laboured'],
    summary: 'Infection or irritation of the airways and lungs, made worse by dust, ammonia, cold and crowding.',
    signs: ['Coughing', 'Fast or laboured breathing', 'Nasal discharge', 'Fever and reduced appetite', 'Standing with neck stretched out'],
    now: ['Move the animal to a clean, well ventilated, draft-free place', 'Separate it from the others', 'Provide clean water and rest', 'Reduce dust and ammonia in the shed'],
    vet: 'Laboured breathing is an emergency. Call a veterinarian now. For a mild cough, call within 24 hours if it continues or fever appears.',
    prevention: 'Good ventilation, dry bedding, less crowding, and vaccination programmes advised locally.'
  },
  {
    id: 'diarrhoea', name: 'Diarrhoea and dehydration', species: ['cattle', 'buffalo', 'sheep', 'goat', 'poultry'],
    keywords: ['diarrhoea', 'diarrhea', 'loose', 'motion', 'scours', 'dehydration', 'dehydrated', 'watery', 'dung', 'stool', 'ors', 'calf', 'kid', 'lamb'],
    summary: 'Loose, watery droppings. Young animals can dehydrate fast.',
    signs: ['Watery or bloody droppings', 'Sunken eyes and dry mouth', 'Weakness, not suckling', 'Cold ears or legs in young animals'],
    now: ['Keep offering clean water and an oral rehydration solution (ORS)', 'Keep the animal warm and dry', 'Clean the shed and wash hands after handling', 'Separate sick young animals'],
    vet: 'Call a veterinarian within 24 hours, and now if the animal is weak, cannot stand, or passes blood.',
    prevention: 'Colostrum soon after birth, clean calf pens, clean water and feed.'
  },
  {
    id: 'newcastle', name: 'Newcastle disease (poultry)', species: ['poultry'],
    keywords: ['newcastle', 'ranikhet', 'poultry', 'chicken', 'hen', 'hens', 'bird', 'birds', 'twisted', 'neck', 'green', 'greenish', 'mortality', 'gasping'],
    summary: 'A viral disease of poultry that can cause sudden deaths in a flock.',
    signs: ['Gasping, coughing and sneezing', 'Greenish watery droppings', 'Twisted neck, circling or paralysis', 'Drop in egg laying', 'Sudden deaths'],
    now: ['Separate sick birds and keep their equipment separate', 'Wash hands and change footwear between sheds', 'Keep visitors and other birds away', 'Do not sell or move birds from the affected flock'],
    vet: 'Call a veterinarian within 24 hours and report sudden multiple deaths to the local Animal Husbandry office.',
    prevention: 'Vaccination on the schedule your vet recommends, strict biosecurity, and clean water and feed.'
  },
  {
    id: 'coccidiosis', name: 'Coccidiosis (poultry)', species: ['poultry'],
    keywords: ['coccidiosis', 'bloody', 'blood', 'droppings', 'ruffled', 'feathers', 'litter', 'wet', 'chicks', 'poultry', 'chicken'],
    summary: 'A gut parasite disease of poultry, common when litter is wet and crowded.',
    signs: ['Bloody or brown droppings', 'Ruffled feathers and huddling', 'Poor growth', 'Drooping and pale combs'],
    now: ['Keep litter dry and replace wet litter', 'Reduce crowding', 'Provide clean water and feed', 'Separate weak birds'],
    vet: 'Call a veterinarian within 24 hours. Treatment and preventive medicine need a vet.',
    prevention: 'Dry litter, clean drinkers, and flock management advised by your vet.'
  },
  {
    id: 'hs', name: 'Haemorrhagic Septicaemia (HS)', species: ['cattle', 'buffalo'],
    keywords: ['hs', 'haemorrhagic', 'hemorrhagic', 'septicaemia', 'septicemia', 'throat', 'swelling', 'monsoon', 'buffalo', 'sudden', 'fever', 'breathing'],
    summary: 'An acute bacterial disease, especially of buffalo, often seen in the rainy season. It can kill within a day.',
    signs: ['High fever and dullness', 'Swelling of the throat, neck or brisket', 'Difficulty breathing and drooling', 'Sudden death'],
    now: ['Call a veterinarian immediately', 'Separate the animal and keep it calm and cool', 'Do not move other animals out of the shed'],
    vet: 'This is an emergency. Call a veterinarian now.',
    prevention: 'Annual vaccination before the monsoon as advised locally.'
  },
  {
    id: 'milk_fever', name: 'Milk fever (low blood calcium)', species: ['cattle', 'buffalo'],
    keywords: ['milk', 'fever', 'calving', 'calved', 'down', 'downer', 'collapse', 'cold', 'ears', 'staggering', 'trembling', 'weak', 'after'],
    summary: 'A drop in blood calcium soon after calving, most often in high-yielding cows.',
    signs: ['Weakness, trembling or staggering within days of calving', 'Unable to stand', 'Cold ears and legs', 'Head turned back to the flank'],
    now: ['Call a veterinarian immediately', 'Keep the cow upright on her chest, on dry bedding', 'Do not pour liquids into her mouth while she cannot swallow properly'],
    vet: 'This is an emergency. Call a veterinarian now.',
    prevention: 'Ask your vet about transition cow feeding before calving.'
  },
  {
    id: 'ppr', name: 'PPR (goat and sheep plague)', species: ['sheep', 'goat'],
    keywords: ['ppr', 'plague', 'goat', 'sheep', 'mouth', 'sores', 'nasal', 'discharge', 'diarrhoea', 'pneumonia', 'fever'],
    summary: 'A viral disease of goats and sheep that spreads quickly in a flock.',
    signs: ['Fever', 'Mouth sores and bad breath', 'Eye and nose discharge', 'Diarrhoea', 'Fast breathing'],
    now: ['Separate sick animals', 'Provide clean water and soft feed', 'Wash hands and equipment after handling'],
    vet: 'Call a veterinarian within 24 hours and report suspected outbreaks.',
    prevention: 'Vaccination as advised by local veterinary services.'
  }
];

export const SAFE_MEDICATION = {
  intro: 'This app never gives drug names with doses. Dose, timing and milk or meat withdrawal periods depend on the animal, the illness and the product, so a veterinarian decides them.',
  doList: [
    'Offer clean water, shade, rest and clean bedding',
    'Use oral rehydration solution (ORS) for loose motions when the animal can drink',
    'Separate sick animals and clean the shed',
    'Write down when signs began, what the animal ate, and any other animals affected',
    'Keep medicine packaging and leftover feed if poisoning is suspected'
  ],
  dontList: [
    'Do not give antibiotics, painkillers or injections without a vet',
    'Do not stop a course early or double a dose',
    'Do not sell milk or meat while a vet-advised withdrawal period applies',
    'Do not use human medicines on animals',
    'Do not force liquids into an animal that cannot swallow'
  ],
  why: 'Wrong antibiotics and doses create resistant germs and leave residues in milk and meat.'
};

// ---------- Ask AI ----------
const EMERGENCY_PATTERNS = [
  [/\bbloat(ed|ing)?\b|swollen (left )?(side|belly|stomach)|distended/i, 'bloat'],
  [/poison|pesticide|insecticide|rat ?poison|ate (a )?(plastic|chemical)|toxic/i, 'poisoning'],
  [/can'?t breathe|cannot breathe|breathing (trouble|problem|difficulty)|gasping|struggling to breathe|laboured breathing/i, 'breathing'],
  [/cannot stand|can'?t stand|collapsed|downer|unable to (stand|get up)/i, 'down'],
  [/calving (problem|trouble|difficulty)|stuck (calf|lamb|kid)|dystocia|prolapse/i, 'calving'],
  [/bleeding (a lot|heavily|badly)|heavy bleeding|snake ?bite/i, 'bleeding'],
  [/\bfmd\b|foot and mouth|foot-and-mouth/i, 'fmd']
];

const DOSE_PATTERN = /\b(dose|dosage|dosing|how much|how many (ml|mg|tablets?|cc|vials?)|\d+(\.\d+)?\s?(mg|ml|cc|iu|g|gm|mcg)\b|mg\s?\/\s?kg|ml\s?\/\s?kg|per kg|injection (amount|quantity)|syringe)/i;
const DRUG_PATTERN = /\b(antibiotics?|oxytetracycline|tetracycline|penicillin|amoxicillin|enrofloxacin|ceftiofur|gentamicin|streptomycin|ivermectin|albendazole|oxytocin|meloxicam|dexamethasone|diclofenac|analgin|paracetamol|tylosin|sulpha|sulfa|steroid|painkiller|calcium (injection|borogluconate))\b/i;

export function safetyCheck(question) {
  const q = String(question || '');
  const wantsDose = DOSE_PATTERN.test(q);
  const mentionsDrug = DRUG_PATTERN.test(q);
  if (wantsDose && (mentionsDrug || /\b(give|inject|treat|medicine|tablet|injection)\b/i.test(q))) return 'dosage';
  if (mentionsDrug && /\b(give|use|inject|can i|should i|which)\b/i.test(q)) return 'medication';
  return null;
}

export function detectEmergency(question) {
  for (const [re, id] of EMERGENCY_PATTERNS) if (re.test(question)) return id;
  return null;
}

const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'my', 'of', 'to', 'and', 'in', 'on', 'it', 'has', 'have', 'with', 'for', 'what', 'how', 'do', 'does', 'i', 'me', 'we', 'be', 'this', 'that', 'cow', 'buffalo', 'goat', 'sheep', 'since', 'from', 'can', 'should', 'not', 'very', 'been', 'was', 'were', 'am', 'at', 'or', 'if', 'so', 'but', 'any']);

function tokens(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t));
}

export function searchLibrary(question, species) {
  const qt = new Set(tokens(question));
  const scored = [];
  for (const d of LIBRARY) {
    let score = 0;
    for (const k of d.keywords) if (qt.has(k)) score += 2;
    for (const t of tokens(d.name)) if (qt.has(t)) score += 3;
    if (score === 0) continue; // species only adjusts a real keyword match, never creates one
    if (species && d.species.includes(species)) score += 1;
    if (species && !d.species.includes(species)) score -= 3;
    if (score > 0) scored.push({ d, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

const EMERGENCY_TEXT = {
  bloat: 'Swelling of the belly on the left side can be bloat, which can kill within hours.',
  poisoning: 'Suspected poisoning is an emergency.',
  breathing: 'Breathing trouble is an emergency.',
  down: 'An animal that cannot stand needs urgent help.',
  calving: 'Calving trouble is an emergency for both the mother and the young.',
  bleeding: 'Heavy bleeding is an emergency.',
  fmd: 'Suspected Foot and Mouth Disease needs a vet quickly, and it must be reported.'
};

export function answerQuestion(question, species) {
  const q = String(question || '');
  const safety = safetyCheck(q);
  if (safety) {
    return {
      kind: 'blocked',
      reason: safety,
      message: 'I do not give drug names with doses, and I cannot tell you which medicine to use. A wrong drug or dose can harm the animal, create resistant germs and leave residues in milk and meat. Please call a veterinarian and describe the signs. Meanwhile you can offer clean water, shade and rest, and keep the animal separate.',
      callVet: true,
      library: ['medication']
    };
  }
  const emergency = detectEmergency(q);
  const hits = searchLibrary(q, species);
  const top = hits.slice(0, 2).map((h) => h.d);

  if (emergency) {
    const main = top[0];
    return {
      kind: 'emergency',
      emergency,
      message: EMERGENCY_TEXT[emergency] + ' Call a veterinarian now. Do not wait to see if it improves.',
      steps: main ? main.now : ['Keep the animal calm and comfortable', 'Keep other animals away', 'Have the animal tag and signs ready for the vet'],
      callVet: true,
      library: top.map((d) => d.id)
    };
  }

  if (top.length === 0) {
    return {
      kind: 'general',
      message: 'I could not match that to a known condition. Tell me the species, the signs you see (for example fever, limping, drooling, cough, swelling, loose motions), and how long it has been going on. You can also run a scan, which combines the signs with video, sound and shed conditions.',
      steps: ['Separate the animal if it looks unwell', 'Offer clean water and shade', 'Note when the signs began', 'Call a veterinarian if it is not eating, is breathing fast, or is getting worse'],
      callVet: false,
      library: []
    };
  }

  const d = top[0];
  return {
    kind: 'answer',
    title: d.name,
    message: d.summary,
    signs: d.signs,
    steps: d.now,
    vet: d.vet,
    prevention: d.prevention,
    callVet: /immediately|now|within 24/i.test(d.vet),
    library: top.map((x) => x.id)
  };
}
