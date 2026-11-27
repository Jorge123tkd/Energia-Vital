/** Tasas del mercado informal de elTOQUE. Solo un token autorizado en Workers secrets. */
export type ElToqueRates = {
  usd: number; eur: number; mlc: number | null; reportedAt: string | null;
};

type ElToquePayload = {
  tasas?: Record<string,unknown>; date?: unknown; hour?: unknown; minutes?: unknown; seconds?: unknown;
};

// No atribuir una tasa a elTOQUE cuando el contrato no coincide o no hay token.
export function parseElToquePayload(raw: unknown): ElToqueRates | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = raw as ElToquePayload;
  const rates = data.tasas;
  if (!rates || typeof rates !== 'object' || Array.isArray(rates)) return null;
  const positiveRate = (value: unknown): number | null => {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 && n < 1000000 ? n : null;
  };
  // elTOQUE codifica el euro como ECU en la respuesta de su API de tasas.
  const usd = positiveRate(rates.USD);
  const eur = positiveRate(rates.ECU ?? rates.EUR);
  const mlc = positiveRate(rates.MLC);
  if (usd === null || eur === null) return null;
  const date = typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : null;
  const hour = typeof data.hour === 'number' && Number.isInteger(data.hour) && data.hour >= 0 && data.hour < 24
    ? data.hour : null;
  const minute = typeof data.minutes === 'number' && Number.isInteger(data.minutes) && data.minutes >= 0 && data.minutes < 60
    ? data.minutes : null;
  const reportedAt = date ? date + (hour===null?'':(' '+String(hour).padStart(2,'0')+':'+String(minute??0).padStart(2,'0'))) : null;
  return {usd,eur,mlc,reportedAt};
}

let cached: {rates:ElToqueRates;expiry:number} | null = null;
export async function getElToqueRates(token?:string):Promise<ElToqueRates|null> {
  if (!token) return null;
  if (cached && Date.now()<cached.expiry) return cached.rates;
  try {
    const res=await fetch('https://tasas.eltoque.com/v1/trmi',{
      headers:{Authorization:'Bearer '+token,Accept:'application/json'},
      signal:AbortSignal.timeout(6500),
    });
    if (!res.ok) return null;
    const raw: unknown=await res.json();
    const rates=parseElToquePayload(raw);
    if (!rates || !rates.reportedAt) return null;
    const dateMs=Date.parse(rates.reportedAt.slice(0,10)+'T00:00:00Z');
    // Un dato sin fecha o claramente antiguo no puede presentarse como tasa actual.
    if (!Number.isFinite(dateMs) || Math.abs(Date.now()-dateMs)>48*60*60*1000) return null;
    cached={rates,expiry:Date.now()+10*60*1000}; // limitar consultas y evitar carga excesiva
    return rates;
  } catch {
    return null;
  }
}

export function formatExchangeReply(rates:ElToqueRates|null):string {
  if (!rates) {
    return 'Puedo ayudarte con el cambio de monedas en Cuba, pero ahora no puedo consultar una tasa reciente y verificada de elTOQUE. No voy a inventar un precio. Consulta https://eltoque.com/tasas-de-cambio-cuba/mercado-informal/ y revisa la fecha de publicación. La tasa informal no es la tasa oficial del banco.';
  }
  const fmt=(n:number)=>n.toLocaleString('es-CU',{maximumFractionDigits:2,minimumFractionDigits:2});
  const lines=[
    'Tasas de referencia del mercado INFORMAL en Cuba, según elTOQUE:',
    '• 1 USD = '+fmt(rates.usd)+' CUP',
    '• 1 EUR = '+fmt(rates.eur)+' CUP',
  ];
  if (rates.mlc!==null) lines.push('• 1 MLC = '+fmt(rates.mlc)+' CUP');
  lines.push('• Relación orientativa entre divisas: 1 EUR ≈ '+fmt(rates.eur/rates.usd)+' USD (calculada dividiendo las referencias en CUP, no una cotización directa de elTOQUE).');
  lines.push('Fuente: elTOQUE · https://eltoque.com/tasas-de-cambio-cuba/mercado-informal/');
  lines.push(rates.reportedAt?'Fecha/hora comunicada por la API: '+rates.reportedAt+' (zona horaria no indicada).':'La API no comunicó una fecha utilizable en su respuesta.');
  lines.push('Son valores referenciales derivados de anuncios de compraventa, no tasas bancarias oficiales ni operaciones garantizadas. Para comprar o vender, confirma el valor efectivo con tu contraparte.');
  return lines.join('\n');
}
