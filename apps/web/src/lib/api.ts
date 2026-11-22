/** Cliente REST para Cloudflare Workers. Evita tokens Bearer manuales en cada pantalla. */
const API_BASE = (import.meta.env.VITE_API_URL as string || '').replace(/\/$/, '');
// Solo QA usa cookies de Cloudflare Access entre Pages y Worker.
const QA_CREDENTIALS: RequestCredentials = import.meta.env.VITE_QA_MODE === 'true' ? 'include' : 'same-origin';
export const CUSTOMER_TOKEN_KEY = 'energia_vital_customer_session';
export const ADMIN_TOKEN_KEY = 'energia_vital_admin_session';

export function customerToken(): string | null {
  return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CUSTOMER_TOKEN_KEY) : null;
}
// El refresh se guarda SOLO en memoria de la pestaña; nunca en sessionStorage,
// localStorage ni logs. Al recargar se pierde y puede requerirse nuevo login.
let customerRefresh: string | null = null;
let refreshing: Promise<string | null> | null = null;
let refreshingFor: string | null = null;
let priorCustomerAccess: string | null = null;
// Sesión legacy/QA de personal en memoria; panel de producción usa cookie HttpOnly.
let adminRefresh: string | null = null;
let adminRefreshing: Promise<string | null> | null = null;
let adminRefreshingFor: string | null = null;
// Permitir reintentar requests iniciadas justo antes de una renovación válida.
let priorAdminAccess: string | null = null;
const adminListeners = new Set<(token: string) => void>();
export function onAdminTokenUpdated(listener: (token: string) => void): () => void {
  adminListeners.add(listener);
  return () => { adminListeners.delete(listener); };
}
// Shared production refresh cookie lives on the Pages origin, not workers.dev.
const ADMIN_BROWSER_KEY='energia_vital_admin_browser';
const CUSTOMER_BROWSER_KEY='energia_vital_customer_browser';
const ADMIN_SIGNED_OUT_KEY='energia_vital_admin_signed_out';
export function browserAdminAvailable(){
  return typeof location!=='undefined' &&
    ['https://bnergiv.com','https://www.bnergiv.com','https://energia-vital-web.pages.dev'].includes(location.origin);
}
function browserSession(){return typeof sessionStorage!=='undefined'&&sessionStorage.getItem(ADMIN_BROWSER_KEY)==='1';}
function customerBrowserSession(){return typeof sessionStorage!=='undefined'&&sessionStorage.getItem(CUSTOMER_BROWSER_KEY)==='1';}
function signedOut(){try{return typeof localStorage!=='undefined'&&localStorage.getItem(ADMIN_SIGNED_OUT_KEY)==='1';}catch{return false;}}
function markSignedOut(value:boolean){try{if(typeof localStorage!=='undefined'){if(value)localStorage.setItem(ADMIN_SIGNED_OUT_KEY,'1');else localStorage.removeItem(ADMIN_SIGNED_OUT_KEY);}}catch{}}
function jwtSid(token:string|null):string|null{
  try{const part=token!.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');const p=JSON.parse(atob(part.padEnd(Math.ceil(part.length/4)*4,'=')));return typeof p.sid==='string'?p.sid:null;}catch{return null;}
}
function jwtType(token:string):'admin'|'customer'|null{
  try{const raw=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');const p=JSON.parse(atob(raw.padEnd(Math.ceil(raw.length/4)*4,'=')));return p.type==='admin'||p.type==='customer'?p.type:null;}catch{return null;}
}
async function browserLock<T>(job:()=>Promise<T>):Promise<T>{
  return typeof navigator!=='undefined'&&navigator.locks
    ?await navigator.locks.request('bonaire-admin-session',job):await job();
}
async function browserSessionRequest(action:'login'|'sign-in'|'register'|'refresh'|'logout',body:Record<string,unknown>):Promise<any>{
  const res=await fetch('/api/admin-session/'+action,{method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await res.json().catch(()=>null);
  if(!res.ok||!data){throw Object.assign(new Error(data?.error||'Servicio de sesión temporalmente no disponible'),{status:res.ok?503:res.status});}
  return data;
}
function acceptBrowserToken(token:unknown){
  if(typeof token!=='string'||!jwtSid(token)||jwtType(token)!=='admin')throw Object.assign(new Error('Respuesta de sesión inválida'),{status:502});
  adminRefresh=null;
  sessionStorage.setItem(ADMIN_BROWSER_KEY,'1');
  sessionStorage.setItem(ADMIN_TOKEN_KEY,token);
  for(const listener of adminListeners)listener(token);
  return token;
}
export async function loginAdminBrowser(body:{email:string;password:string;remember:boolean}){
  if(!browserAdminAvailable()){
    const data=await api.adminLogin(body);
    sessionStorage.setItem(ADMIN_TOKEN_KEY,data.access_token);
    setAdminRefreshToken(data.refresh_token);
    return data;
  }
  return browserLock(async()=>{
    const data=await browserSessionRequest('login',body);
    priorAdminAccess=null;markSignedOut(false);
    setCustomerToken(null);
    acceptBrowserToken(data.access_token);
    return data;
  });
}
function acceptCustomerBrowserToken(token:string){
  if(!jwtSid(token)||jwtType(token)!=='customer')throw Object.assign(new Error('Respuesta de sesión inválida'),{status:502});
  customerRefresh=null;
  sessionStorage.setItem(CUSTOMER_BROWSER_KEY,'1');
  setCustomerToken(token);
  return token;
}
function acceptSiteBrowserToken(token:unknown){
  if(typeof token!=='string'||!jwtSid(token))throw Object.assign(new Error('Respuesta de sesión inválida'),{status:502});
  const kind=jwtType(token);
  if(kind==='admin'){setCustomerToken(null);return {kind,token:acceptBrowserToken(token)};}
  if(kind==='customer'){clearAdminSession();return {kind,token:acceptCustomerBrowserToken(token)};}
  throw Object.assign(new Error('Tipo de sesión inválido'),{status:502});
}
type SiteCredentials={email:string;password:string;remember:boolean};
type SiteRegistration={name:string;email:string;phone:string;address:string;city:string;province:string;password:string};
export async function signInSite(body:SiteCredentials){
  if(!browserAdminAvailable())return api.signIn(body);
  return browserLock(async()=>{
    const data=await browserSessionRequest('sign-in',body);
    priorAdminAccess=null;priorCustomerAccess=null;
    acceptSiteBrowserToken(data.access_token);markSignedOut(false);
    return {...data,browser_session:true};
  });
}
export async function registerSite(body:SiteRegistration){
  if(!browserAdminAvailable())return api.register(body);
  return browserLock(async()=>{
    const data=await browserSessionRequest('register',body);
    priorAdminAccess=null;priorCustomerAccess=null;
    acceptSiteBrowserToken(data.access_token);markSignedOut(false);
    return {...data,browser_session:true};
  });
}
export async function restorePublicBrowserAccess():Promise<{kind:'admin'|'customer';token:string}|null>{
  if(browserAdminAvailable()&&signedOut()){
    if(browserSession())clearAdminSession();
    if(customerBrowserSession())setCustomerToken(null);
  }
  const existing=()=>{const admin=sessionStorage.getItem(ADMIN_TOKEN_KEY);const customer=customerToken();return admin?{kind:'admin' as const,token:admin}:customer?{kind:'customer' as const,token:customer}:null;};
  const saved=existing();if(saved)return saved;
  if(!browserAdminAvailable()||signedOut())return null;
  return browserLock(async()=>{
    const current=existing();if(current)return current;
    if(signedOut())return null;
    try{
      const data=await browserSessionRequest('refresh',{kind:'any'});
      if(signedOut()||existing())return null;
      return acceptSiteBrowserToken(data.access_token);
    }catch(e){const status=(e as Error&{status?:number}).status;if(status===401||status===403)return null;throw e;}
  });
}
export async function restoreAdminBrowserAccess():Promise<string|null>{
  const existing=sessionStorage.getItem(ADMIN_TOKEN_KEY);
  if(!browserAdminAvailable())return existing;
  if(signedOut()){if(browserSession()){clearAdminSession();return null;}return existing;}
  if(existing)return existing;
  return browserLock(async()=>{
    if(signedOut())return null;
    const saved=sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if(saved)return saved;
    try{
      const data=await browserSessionRequest('refresh',{});
      if(signedOut()||sessionStorage.getItem(ADMIN_TOKEN_KEY))return null;
      const token=acceptBrowserToken(data.access_token);setCustomerToken(null);return token;
    }catch(e){
      const status=(e as Error&{status?:number}).status;
      if(status===401||status===403)return null;
      throw e;
    }
  });
}
let cookieFlight:Promise<string|null>|null=null;
let cookieFlightFor:string|null=null;
async function renewCookieAdmin(failedToken:string):Promise<string|null>{
  if(signedOut())return null;
  if(cookieFlight&&cookieFlightFor===failedToken)return cookieFlight;
  const job=browserLock(async()=>{
    if(signedOut()||!browserSession()||sessionStorage.getItem(ADMIN_TOKEN_KEY)!==failedToken)return null;
    const sid=jwtSid(failedToken);
    if(!sid)return null;
    try{
      const data=await browserSessionRequest('refresh',{sid});
      if(signedOut()||!browserSession()||sessionStorage.getItem(ADMIN_TOKEN_KEY)!==failedToken)return null;
      if(jwtSid(data.access_token)!==sid||jwtType(data.access_token)!=='admin')throw Object.assign(new Error('La sesión cambió'),{status:401});
      priorAdminAccess=failedToken;
      return acceptBrowserToken(data.access_token);
    }catch(e){
      const status=(e as Error&{status?:number}).status;
      if(status===401||status===403){
        if(sessionStorage.getItem(ADMIN_TOKEN_KEY)===failedToken)clearAdminSession();
        return null;
      }
      throw e;
    }
  });
  const flight=job.finally(()=>{if(cookieFlight===flight){cookieFlight=null;cookieFlightFor=null;}});
  cookieFlight=flight;cookieFlightFor=failedToken;return flight;
}
export function setAdminRefreshToken(token: string | null) {
  adminRefresh = token;
  priorAdminAccess = null;
  if(typeof sessionStorage!=='undefined')sessionStorage.removeItem(ADMIN_BROWSER_KEY);
}
/** Cierra la sesión en el navegador ANTES de esperar la red. El refresh
 * firmado puede revocar la sesión en D1 aun cuando el access haya caducado.
 * Nunca conserva el refresh ni lo manda en URL, logs o almacenamiento local. */
export async function logoutCurrentSession(kind: 'customer' | 'admin'): Promise<void> {
  const access = kind === 'admin' ? sessionStorage.getItem(ADMIN_TOKEN_KEY) : customerToken();
  const refresh = kind === 'admin' ? adminRefresh : customerRefresh;
  const browserAdmin=browserAdminAvailable();
  const cookieMode=browserAdmin&&(kind==='admin'?browserSession():customerBrowserSession());
  const scope=kind==='customer'?{kind:'customer'}:{};
  if(browserAdmin)markSignedOut(true);
  if (kind === 'admin') clearAdminSession();
  else setCustomerToken(null);
  if(cookieMode){
    await browserLock(()=>browserSessionRequest('logout',{...scope,...(jwtSid(access)?{sid:jwtSid(access)}:{})}));
    return;
  }
  if (!access && !refresh){if(browserAdmin)await browserLock(()=>browserSessionRequest('logout',scope));return;}
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (!refresh && access) headers.set('Authorization', `Bearer ${access}`);
  try {
    await fetch(`${API_BASE}/api/auth/logout`, { credentials: QA_CREDENTIALS,
      method: 'POST', headers, cache: 'no-store',
      body: JSON.stringify(refresh ? { refresh_token: refresh } : {}),
    });
  } catch { /* El navegador ya cerró. Una desconexión no asegura revocación remota. */ }
  // A legacy sign-in on this host must not leave a remembered cookie behind.
  if(browserAdmin)await browserLock(()=>browserSessionRequest('logout',scope));
}
export function clearAdminSession() {
  // Invalidar la memoria antes de cualquier petición de logout.
  adminRefresh = null;
  priorAdminAccess = null;
  if (typeof sessionStorage !== 'undefined') {sessionStorage.removeItem(ADMIN_TOKEN_KEY);sessionStorage.removeItem(ADMIN_BROWSER_KEY);}
  for(const listener of adminListeners)listener('');
}
async function renewAdminAccess(failedToken: string): Promise<string | null> {
  const existing = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  // No reintentar una petición de la cuenta A con el token de la cuenta B.
  if (existing && existing !== failedToken)
    return priorAdminAccess === failedToken && (adminRefresh||browserSession()) ? existing : null;
  if(browserSession())return renewCookieAdmin(failedToken);
  if (!adminRefresh) return null;
  const previous = adminRefresh;
  // Una renovación pendiente de otra cuenta/sesión no puede bloquear ésta.
  if (!adminRefreshing || adminRefreshingFor !== previous) {
    adminRefreshingFor = previous;
    const job = (async () => {
      const response = await fetch(`${API_BASE}/api/auth/refresh`, { credentials: QA_CREDENTIALS,
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: previous }), cache: 'no-store',
      });
      if (!response.ok) return null;
      const data: unknown = await response.json().catch(() => null);
      if (!data || typeof data !== 'object') return null;
      const pair = data as { access_token?: unknown; refresh_token?: unknown };
      if (typeof pair.access_token !== 'string' || typeof pair.refresh_token !== 'string') return null;
      if (adminRefresh !== previous || sessionStorage.getItem(ADMIN_TOKEN_KEY) !== failedToken) return null;
      adminRefresh = pair.refresh_token;
      priorAdminAccess = failedToken;
      sessionStorage.setItem(ADMIN_TOKEN_KEY, pair.access_token);
      for (const listener of adminListeners) listener(pair.access_token);
      return pair.access_token;
    })();
    const flight = job.finally(() => {
      if (adminRefreshing === flight) {
        adminRefreshing = null;
        adminRefreshingFor = null;
      }
    });
    adminRefreshing = flight;
  }
  return adminRefreshing;
}
export function setCustomerRefreshToken(token: string | null) {
  customerRefresh = token;
  priorCustomerAccess = null;
  if(typeof sessionStorage!=='undefined')sessionStorage.removeItem(CUSTOMER_BROWSER_KEY);
}
export function setCustomerToken(token: string | null) {
  if (token) sessionStorage.setItem(CUSTOMER_TOKEN_KEY, token);
  else {
    sessionStorage.removeItem(CUSTOMER_TOKEN_KEY);
    sessionStorage.removeItem(CUSTOMER_BROWSER_KEY);
    customerRefresh = null;
    priorCustomerAccess = null;
  }
}
function isRefreshableRoute(path: string): boolean {
  // Consultas de identidad también necesitan renovar para restaurar una sesión
  // todavía abierta; las mutaciones de auth nunca deben reintentarse.
  return !path.startsWith('/api/auth/') ||
    path === '/api/auth/me' || path === '/api/auth/admin/me';
}
function accessExpired(token: string): boolean {
  try {
    const raw = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, '=')));
    return typeof claims.exp === 'number' && claims.exp <= Math.floor(Date.now() / 1000);
  } catch { return false; }
}
async function renewCookieCustomer(failedToken:string):Promise<string|null>{
  if(signedOut())return null;
  const key='cookie:'+failedToken;
  if(refreshing&&refreshingFor===key)return refreshing;
  const job=browserLock(async()=>{
    if(signedOut()||!customerBrowserSession()||customerToken()!==failedToken)return null;
    const sid=jwtSid(failedToken);if(!sid)return null;
    try{
      const data=await browserSessionRequest('refresh',{kind:'customer',sid});
      if(signedOut()||!customerBrowserSession()||customerToken()!==failedToken)return null;
      if(jwtSid(data.access_token)!==sid||jwtType(data.access_token)!=='customer')throw Object.assign(new Error('La sesión cambió'),{status:401});
      priorCustomerAccess=failedToken;
      return acceptCustomerBrowserToken(data.access_token);
    }catch(e){const status=(e as Error&{status?:number}).status;if(status===401||status===403){if(customerToken()===failedToken)setCustomerToken(null);return null;}throw e;}
  });
  const flight=job.finally(()=>{if(refreshing===flight){refreshing=null;refreshingFor=null;}});
  refreshing=flight;refreshingFor=key;return flight;
}
async function renewCustomerAccess(failedToken: string): Promise<string | null> {
  // Si otra petición renovó esta misma sesión, reutiliza el access nuevo.
  const newer = customerToken();
  if (newer && newer !== failedToken)
    return priorCustomerAccess === failedToken && (customerRefresh||customerBrowserSession()) ? newer : null;
  if(customerBrowserSession())return renewCookieCustomer(failedToken);
  if (!customerRefresh) return null;
  const previousRefresh = customerRefresh;
  // No compartir la renovación de la cuenta anterior después de logout/login.
  if (!refreshing || refreshingFor !== previousRefresh) {
    refreshingFor = previousRefresh;
    const job = (async () => {
      const response = await fetch(`${API_BASE}/api/auth/refresh`, { credentials: QA_CREDENTIALS,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: previousRefresh }),
        cache: 'no-store',
      });
      if (!response.ok) return null;
      const pair: unknown = await response.json().catch(() => null);
      if (!pair || typeof pair !== 'object') return null;
      const tokens = pair as { access_token?: unknown; refresh_token?: unknown };
      if (typeof tokens.access_token !== 'string' || typeof tokens.refresh_token !== 'string') return null;
      // Un cierre de sesión durante la petición no debe reactivar su token.
      if (customerRefresh !== previousRefresh || customerToken() !== failedToken) return null;
      setCustomerToken(tokens.access_token);
      customerRefresh = tokens.refresh_token;
      priorCustomerAccess = failedToken;
      return tokens.access_token;
    })();
    const flight = job.finally(() => {
      if (refreshing === flight) {
        refreshing = null;
        refreshingFor = null;
      }
    });
    refreshing = flight;
  }
  return refreshing;
}
export async function apiRequest(path: string, options: RequestInit = {}): Promise<any> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const suppliedAuth = headers.has('Authorization');
  const explicitToken = suppliedAuth ? headers.get('Authorization')?.replace(/^Bearer /, '') || null : null;
  const token = suppliedAuth ? null : customerToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // Studio always uses the same-origin Pages service binding, not the public API base.
  const target = path.startsWith('/api/studio/v1/') ? path : `${API_BASE}${path}`;
  let response = await fetch(target, { credentials: QA_CREDENTIALS, ...options, headers });
  // Renovar admin únicamente si el Bearer explícito corresponde a esta sesión.
  // Nunca renovar login, logout, token externo ni permisos denegados (403).
  if (response.status === 401 && explicitToken && accessExpired(explicitToken) &&
      (sessionStorage.getItem(ADMIN_TOKEN_KEY) === explicitToken ||
        (priorAdminAccess === explicitToken && Boolean(adminRefresh||browserSession()))) &&
      isRefreshableRoute(path)) {
    const renewed = browserSession()?await renewAdminAccess(explicitToken):await renewAdminAccess(explicitToken).catch(() => null);
    if (renewed) {
      const retryHeaders = new Headers(headers);
      retryHeaders.set('Authorization', `Bearer ${renewed}`);
      response = await fetch(target, { credentials: QA_CREDENTIALS, ...options, headers: retryHeaders });
    }
  }
  // Nunca renovar por errores de permisos ni en rutas de login/logout.
  // Únicamente reintentar una vez si el access JWT del cliente ha expirado.
  if (response.status === 401 && token && !suppliedAuth && isRefreshableRoute(path) && accessExpired(token)) {
    const renewed = customerBrowserSession()?await renewCustomerAccess(token):await renewCustomerAccess(token).catch(() => null);
    if (renewed) {
      const retryHeaders = new Headers(headers);
      retryHeaders.set('Authorization', `Bearer ${renewed}`);
      response = await fetch(target, { credentials: QA_CREDENTIALS, ...options, headers: retryHeaders });
    }
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || data.message || `Error HTTP ${response.status}`);
    Object.assign(error, { status: response.status });
    throw error;
  }
  return data;
}
function withAdmin(token: string, options: RequestInit = {}): RequestInit {
  return { ...options, headers: { ...Object.fromEntries(new Headers(options.headers).entries()), Authorization: `Bearer ${token}` } };
}
const post = (path: string, body: unknown, options: RequestInit = {}) => apiRequest(path, { ...options, method: 'POST', body: JSON.stringify(body) });
const patch = (path: string, body: unknown, options: RequestInit = {}) => apiRequest(path, { ...options, method: 'PATCH', body: JSON.stringify(body) });

/** Descarga una imagen privada con la sesión adecuada para mostrarla en un objeto URL local. */
export async function authorizedImageBlob(path: string, token?: string): Promise<Blob> {
  const auth = token || customerToken();
  if (!auth) throw new Error('Necesitas iniciar sesión para ver este archivo.');
  const response = await fetch(`${API_BASE}${path}`, { credentials: QA_CREDENTIALS,
    headers: { Authorization: `Bearer ${auth}` }
  });
  if (!response.ok) throw new Error('No se pudo cargar esta imagen privada.');
  const blob = await response.blob();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type))
    throw new Error('El archivo no tiene un formato de imagen válido.');
  return blob;
}

async function getAllPublic(path: string, key: 'products' | 'services' | 'gallery', params: Record<string, string> = {}): Promise<any> {
  const all: any[] = [];
  for (let page = 1; page <= 200; page++) {
    const query = new URLSearchParams({ ...params, page: String(page), page_size: '200' });
    const result = await apiRequest(path + '?' + query.toString());
    all.push(...(Array.isArray(result[key]) ? result[key] : []));
    if (!result.has_more) return { [key]: all };
  }
  throw new Error('La lista es muy extensa. Ajusta los filtros o consulta al equipo.');
}

const documentBase=(token?:string)=>token?'/api/admin-customers/documents':'/api/private/documents';
export async function downloadRequestDocument(id:string,filename:string,token?:string){
  const auth=token||customerToken();
  if(!auth)throw new Error('Inicia sesión para descargar el documento.');
  const response=await fetch(API_BASE+documentBase(token)+'/files/'+encodeURIComponent(id),{
    credentials:QA_CREDENTIALS,headers:{Authorization:'Bearer '+auth},cache:'no-store'
  });
  if(!response.ok)throw new Error('Documento no disponible. Comprueba tu sesión.');
  const blob=await response.blob();
  if(blob.size>8*1024*1024||blob.type!=='application/octet-stream')throw new Error('Formato de descarga inesperado.');
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename.replace(/[^a-zA-Z0-9._ -]/g,'_');document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export const api = {
  getAssistantUsage:(token:string,period:string,q:string,page=1,scope='web')=>apiRequest('/api/admin/assistant-usage?'+new URLSearchParams({period,q,page:String(page),scope}),withAdmin(token)),

  listRequestDocuments:(id:string,token?:string)=>apiRequest(documentBase(token)+'/requests/'+encodeURIComponent(id),token?withAdmin(token):{}),
  uploadRequestDocument:(id:string,file:File,token?:string)=>{
    const body=new FormData();body.append('file',file);
    const options:RequestInit={method:'POST',body};
    return apiRequest(documentBase(token)+'/requests/'+encodeURIComponent(id),token?withAdmin(token,options):options);
  },
  getMyQuotes:()=>apiRequest('/api/private/quotes'),
  issueQuote:(token:string,id:string)=>post('/api/quotes/'+encodeURIComponent(id)+'/issue',{},withAdmin(token)),

  getProducts: (params?: Record<string, string>) => getAllPublic('/api/public/products', 'products', params),
  getProduct: (id: string) => apiRequest(`/api/public/products/${encodeURIComponent(id)}`),
  getCategories: () => apiRequest('/api/public/categories'),
  getServices: (featured = false) => getAllPublic('/api/public/services', 'services', featured ? { featured: 'true' } : {}),
  getService: (id: string) => apiRequest(`/api/public/services/${encodeURIComponent(id)}`),
  getFAQ: (params?: Record<string, string>) => apiRequest(`/api/public/faq${params ? '?' + new URLSearchParams(params).toString() : ''}`),
  getGallery: (featured = false) => getAllPublic('/api/public/gallery', 'gallery', featured ? { featured: 'true' } : {}),
  getGalleryCategories: () => apiRequest('/api/public/extras/gallery/categories'),
  getGalleryImages: (id: string) => apiRequest('/api/public/extras/gallery/' + encodeURIComponent(id) + '/images'),
  getServiceImages: (id: string) => apiRequest('/api/public/extras/services/' + encodeURIComponent(id) + '/images'),
  getRequestCategories: () => apiRequest('/api/public/extras/request-categories'),
  getProductReviews: (id: string) => apiRequest('/api/public/extras/products/' + encodeURIComponent(id) + '/reviews'),

  getSettings: () => apiRequest('/api/public/settings'),
  getAssistantConfig: () => apiRequest('/api/assistant/config'),
  getAssistantSessions: (page = 1) => apiRequest('/api/assistant/sessions?page=' + page),
  createAssistantSession: () => post('/api/assistant/sessions', {}),
  renameAssistantSession: (id: string, title: string) =>
    patch('/api/assistant/session/' + encodeURIComponent(id), {title}),
  deleteAssistantSession: (id: string) =>
    apiRequest('/api/assistant/session/' + encodeURIComponent(id), {method:'DELETE'}),
  getAssistantMessages: (id: string) => apiRequest(`/api/assistant/session/${encodeURIComponent(id)}/messages`),
  postAssistantMessage: (body: { session_id?: string; message: string; channel?: string }) => post('/api/assistant/message', body),

  register: (body: { name: string; email: string; phone: string; address: string; city: string; province: string; password: string }) => post('/api/auth/register', body),
  customerLogin: (body: { email: string; password: string }) => post('/api/auth/customer/login', body),
  createTelegramCustomerLinkCode: () => post('/api/auth/telegram/link-code',{}),
  signIn: (body: { email: string; password: string }) => post('/api/auth/sign-in', body),
  logoutAdmin: (token: string) => post('/api/auth/logout', {}, withAdmin(token)),
  me: () => apiRequest('/api/auth/me'),
  updateProfile: (body: { name: string; phone: string; address: string; city: string; province: string }) =>
    apiRequest('/api/auth/me', { method: 'PUT', body: JSON.stringify(body) }),
  changePassword: (body: { current_password: string; new_password: string }) =>
    apiRequest('/api/auth/password', { method: 'PUT', body: JSON.stringify(body) }),
  logout: () => post('/api/auth/logout', {}),
  refreshToken: (body: { refresh_token: string }) => post('/api/auth/refresh', body),
  getMyRequests: () => apiRequest('/api/private/requests'),
  createRequest: (body: { service_id?: string; type?: string; category_id?: string; title: string; description: string; preferred_date?: string;
    available_budget_usd?: string;payment_method?: string;payment_currency?: string;customer_type?: string }) => post('/api/private/requests', body),
  uploadRequestImage: (id: string, file: File) => {
    const body = new FormData(); body.append('file', file);
    return apiRequest('/api/private/extras/requests/' + encodeURIComponent(id) + '/images', { method: 'POST', body });
  },
  getMyRequestImages: (id: string) => apiRequest('/api/private/extras/requests/' + encodeURIComponent(id) + '/images'),
  getReviewEligibility: (id: string) => apiRequest('/api/private/extras/products/' + encodeURIComponent(id) + '/review-eligibility'),
  sendProductReview: (id: string, rating: number, comment: string) =>
    post('/api/private/extras/products/' + encodeURIComponent(id) + '/reviews', { rating, comment }),

  getMyAppointments: () => apiRequest('/api/private/appointments'),
  createAppointment: (body: { title: string; starts_at: string; ends_at: string }) => post('/api/private/appointments', body),
  getCalendarSlots: (date: string, minutes = 60) => apiRequest(`/api/calendar/slots?date=${encodeURIComponent(date)}&duration_minutes=${minutes}`),
  getNotifications: (page?: number, size = 10) => apiRequest('/api/notifications' + (page ? '?page=' + page + '&page_size=' + size : '')),
  markNotificationRead: (id: string) => patch('/api/notifications/' + encodeURIComponent(id) + '/read', {}),
  listSentNotifications: (token: string, page = 1, pageSize = 10) =>
    apiRequest('/api/notifications/admin/sent?page=' + page + '&page_size=' + pageSize, withAdmin(token)),
  getWelcomeAutomation: (token: string) => apiRequest('/api/notifications/admin/automation', withAdmin(token)),
  saveWelcomeAutomation: (token: string, enabled: boolean, title: string, message: string) =>
    apiRequest('/api/notifications/admin/automation', withAdmin(token, {
      method: 'PUT', body: JSON.stringify({enabled,title,message}),
    })),
  getStaffInbox: (token: string, page?: number, size = 10) => apiRequest('/api/notifications/inbox' + (page ? '?page=' + page + '&page_size=' + size : ''), withAdmin(token)),
  markStaffNotificationRead: (token: string, id: string) =>
    patch('/api/notifications/inbox/' + encodeURIComponent(id) + '/read', {}, withAdmin(token)),
  sendCustomerNotification: (token: string, customer_ids: string[], title: string, message: string) =>
    post('/api/notifications/admin/send', { customer_ids, title, message }, withAdmin(token)),
  sendAllCustomerNotifications: (token: string, title: string, message: string) =>
    post('/api/notifications/admin/send-all', { title, message }, withAdmin(token)),

  getRewards: () => apiRequest('/api/rewards'),
  getRewardBalance: () => apiRequest('/api/rewards/balance'),
  getRewardRedemptions: () => apiRequest('/api/rewards/redemptions'),
  getGiveawaysPublic: () => apiRequest('/api/giveaways/public/list'),
  getGiveawayPublic: (id: string) => apiRequest(`/api/giveaways/public/${id}`),
  participateGiveaway: (id: string, body: unknown) => post(`/api/giveaways/public/${id}/participate`, body),

  adminLogin: (body: { email: string; password: string }) => post('/api/auth/login', body),
  setupTelegramWebhook: (token:string) => post('/api/telegram/set-webhook',{},withAdmin(token)),
  getTelegramWebhookInfo: (token:string) => apiRequest('/api/telegram/webhook-info',withAdmin(token)),
  getTelegramStaffLink: (token:string) => apiRequest('/api/telegram/admin/link', withAdmin(token)),
  createTelegramStaffLinkCode: (token:string) => post('/api/telegram/admin/link-code', {}, withAdmin(token)),
  deleteTelegramStaffLink: (token:string) => apiRequest('/api/telegram/admin/link',
    withAdmin(token,{method:'DELETE'})),
  getWhatsAppStaffLink: (token:string) => apiRequest('/api/whatsapp/admin/link', withAdmin(token)),
  createWhatsAppStaffLinkCode: (token:string) => post('/api/whatsapp/admin/link-code', {}, withAdmin(token)),
  deleteWhatsAppStaffLink: (token:string) => apiRequest('/api/whatsapp/admin/link',
    withAdmin(token,{method:'DELETE'})),
  adminMe: (token: string) => apiRequest('/api/auth/admin/me', withAdmin(token)),
  listStaff: (token: string) => apiRequest('/api/admin/users', withAdmin(token)),
  createStaff: (token: string, body: { email: string; password: string; role: 'admin' | 'operator' }) =>
    post('/api/admin/users', body, withAdmin(token)),
  updateStaff: (token: string, id: string, body: { role?: 'admin' | 'operator'; is_active?: boolean }) =>
    patch('/api/admin/users/' + encodeURIComponent(id), body, withAdmin(token)),
  deactivateStaff: (token: string, id: string) =>
    apiRequest('/api/admin/users/' + encodeURIComponent(id), withAdmin(token, { method: 'DELETE' })),

  getCustomerDossier: (token:string,id:string) =>
    apiRequest('/api/dossiers/customers/'+encodeURIComponent(id),withAdmin(token)),
  listChiefAccounts: (token:string) =>
    apiRequest('/api/chief/admin/accounts',withAdmin(token)),
  createChiefAccount: (token:string,body:{brigade_id:string;email:string;password:string}) =>
    post('/api/chief/admin/accounts',body,withAdmin(token)),
  updateChiefAccount: (token:string,id:string,body:{is_active?:boolean;password?:string;expected_updated_at:string}) =>
    patch('/api/chief/admin/accounts/'+encodeURIComponent(id),body,withAdmin(token)),
  chiefLogin: (email:string,password:string) =>
    post('/api/chief/login',{email,password}),
  chiefMe: (token:string) => apiRequest('/api/chief/me',withAdmin(token)),
  chiefLogout: (token:string) => post('/api/chief/logout',{},withAdmin(token)),
  chiefWorks: (token:string) => apiRequest('/api/chief/works',withAdmin(token)),
  chiefWorkReports: (token:string,id:string) =>
    apiRequest('/api/chief/works/'+encodeURIComponent(id)+'/reports',withAdmin(token)),
  chiefAddReport: (token:string,id:string,body:unknown) =>
    post('/api/chief/works/'+encodeURIComponent(id)+'/reports',body,withAdmin(token)),
  chiefWorkEvidence: (token:string,id:string) =>
    apiRequest('/api/chief/works/'+encodeURIComponent(id)+'/evidence',withAdmin(token)),
  staffWorkEvidence: (token:string,id:string) =>
    apiRequest('/api/chief/staff/works/'+encodeURIComponent(id)+'/evidence',withAdmin(token)),
  verifyChiefEvidence: (token:string,workId:string,imageId:string) =>
    apiRequest('/api/chief/staff/works/'+encodeURIComponent(workId)+
      '/evidence/'+encodeURIComponent(imageId)+'/verify',withAdmin(token)),
  chiefUploadEvidence: (token:string,id:string,file:File,stage:string,note:string,reportId?:string) => {
    const body=new FormData();body.append('file',file);body.append('stage',stage);
    if(note.trim())body.append('captured_note',note.trim());
    if(reportId)body.append('report_id',reportId);
    return apiRequest('/api/chief/works/'+encodeURIComponent(id)+'/evidence',
      withAdmin(token,{method:'POST',body}));
  },
  getRequestTechnical: (token:string,id:string) =>
    apiRequest('/api/technical/requests/'+encodeURIComponent(id),withAdmin(token)),
  addWorkReport: (token:string,workId:string,body:unknown) =>
    post('/api/technical/works/'+encodeURIComponent(workId)+'/reports',body,withAdmin(token)),
  reviewWorkReport: (token:string,reportId:string,body:unknown) =>
    patch('/api/technical/reports/'+encodeURIComponent(reportId)+'/review',body,withAdmin(token)),
  reviewChiefCompletion: (token:string,chiefReportId:string,body:unknown) =>
    patch('/api/technical/chief-reports/'+encodeURIComponent(chiefReportId)+'/review',body,withAdmin(token)),
  openServiceCase: (token:string,requestId:string,body:unknown) =>
    post('/api/technical/requests/'+encodeURIComponent(requestId)+'/cases',body,withAdmin(token)),
  addServiceCaseNote: (token:string,caseId:string,note:string) =>
    post('/api/technical/cases/'+encodeURIComponent(caseId)+'/notes',{note},withAdmin(token)),
  resolveServiceCase: (token:string,caseId:string,body:unknown) =>
    patch('/api/technical/cases/'+encodeURIComponent(caseId)+'/resolve',body,withAdmin(token)),
  getRequestFinance: (token:string,id:string) =>
    apiRequest('/api/finance/requests/'+encodeURIComponent(id),withAdmin(token)),
  logFinancialDeclaration: (token:string,id:string,body:unknown) =>
    post('/api/finance/requests/'+encodeURIComponent(id)+'/declarations',body,withAdmin(token)),
  logPaymentReport: (token:string,id:string,body:unknown) =>
    post('/api/finance/requests/'+encodeURIComponent(id)+'/payment-reports',body,withAdmin(token)),
  reviewPaymentReport: (token:string,id:string,body:unknown) =>
    patch('/api/finance/payment-reports/'+encodeURIComponent(id)+'/review',body,withAdmin(token)),
  quoteVersions: (token:string,requestId:string) =>
    apiRequest('/api/quotes/requests/'+encodeURIComponent(requestId),withAdmin(token)),
  createQuoteVersion: (token:string,requestId:string,body:unknown) =>
    post('/api/quotes/requests/'+encodeURIComponent(requestId)+'/versions',body,withAdmin(token)),
  submitQuoteReview: (token:string,id:string) =>
    patch('/api/quotes/'+encodeURIComponent(id)+'/submit',{},withAdmin(token)),
  reviewQuote: (token:string,id:string,decision:'approve'|'reject',reason:string) =>
    patch('/api/quotes/'+encodeURIComponent(id)+'/review',{decision,reason},withAdmin(token)),
  getRequestDossier: (token:string,id:string) =>
    apiRequest('/api/dossiers/requests/'+encodeURIComponent(id),withAdmin(token)),
  logRequestActivity: (token:string,id:string,body:{
    activity_type:'call'|'whatsapp'|'visit'|'follow_up'|'internal_note';
    note:string;next_step?:string;follow_up_date?:string
  }) => post('/api/dossiers/requests/'+encodeURIComponent(id)+'/activities',body,withAdmin(token)),
  adminCustomers: (token: string, q = '', page?: number, pageSize = 12) =>
    apiRequest('/api/admin-customers/customers' + (page !== undefined || q
      ? '?' + new URLSearchParams({ q, page: String(page ?? 1), page_size: String(pageSize) }).toString() : ''),
      withAdmin(token)),
  updateAdminCustomer: (token: string, id: string, body: Record<string, string>) =>
    patch(`/api/admin-customers/customers/${encodeURIComponent(id)}`, body, withAdmin(token)),
  setAdminCustomerStatus: (token: string, id: string, is_active: boolean) =>
    patch(`/api/admin-customers/customers/${encodeURIComponent(id)}/status`, { is_active }, withAdmin(token)),
  deleteAdminCustomer: (token: string, id: string) =>
    apiRequest(`/api/admin-customers/customers/${encodeURIComponent(id)}`, withAdmin(token, { method: 'DELETE' })),
  createAdminRequest: (token: string, body: {
    customer_id?: string;contact_name?: string;contact_phone?: string;
    type: string; title: string; description: string; status: string;
    location: string; preferred_date: string | null;
    available_budget_usd?:string; payment_method?:string; payment_currency?:string; customer_type?:string;
  }) => post('/api/admin-customers/requests', body, withAdmin(token)),
  adminRequests: (token: string, q = '', page?: number, pageSize = 20) =>
    apiRequest('/api/admin-customers/requests' +
      (page !== undefined || q ? '?' + new URLSearchParams({
        q, page: String(page ?? 1), page_size: String(pageSize),
      }).toString() : ''), withAdmin(token)),
  getStaffRequestImages: (token: string, id: string) =>
    apiRequest('/api/admin-customers/extras/requests/' + encodeURIComponent(id) + '/images', withAdmin(token)),
  listAdminRequestCategories: (token: string) => apiRequest('/api/admin/extras/request-categories', withAdmin(token)),
  createAdminRequestCategory: (token: string, body: unknown) => post('/api/admin/extras/request-categories', body, withAdmin(token)),
  updateAdminRequestCategory: (token: string, id: string, body: unknown) =>
    patch('/api/admin/extras/request-categories/' + encodeURIComponent(id), body, withAdmin(token)),
  deleteAdminRequestCategory: (token: string, id: string) =>
    apiRequest('/api/admin/extras/request-categories/' + encodeURIComponent(id), withAdmin(token, { method: 'DELETE' })),

  brigadeAvailability: (token:string,date:string) =>
    apiRequest('/api/brigade-work/availability?date='+encodeURIComponent(date),withAdmin(token)),
  brigadeWorkMonth: (token:string,month:string) =>
    apiRequest('/api/brigade-work/month?month='+encodeURIComponent(month),withAdmin(token)),
  pendingBrigadeApprovals: (token:string) =>
    apiRequest('/api/brigade-work/pending',withAdmin(token)),
  assignBrigadeWork: (token:string,body:{
    brigade_id:string;request_id:string;work_date:string;estimated_minutes:number;busy_acknowledged:boolean
  }) => post('/api/brigade-work',body,withAdmin(token)),
  reviewBrigadeWork: (token:string,id:string,decision:'approve'|'reject',reason:string) =>
    patch('/api/brigade-work/'+encodeURIComponent(id)+'/review',{decision,reason},withAdmin(token)),
  cancelBrigadeWork: (token:string,id:string,reason:string) =>
    patch('/api/brigade-work/'+encodeURIComponent(id)+'/cancel',{reason},withAdmin(token)),
  listBrigades: (token: string) => apiRequest('/api/brigades', withAdmin(token)),
  createBrigade: (token: string, body: {name:string;leader_name:string;specialty:string}) =>
    post('/api/brigades', body, withAdmin(token)),
  updateBrigade: (token:string,id:string,body:{
    name?:string;leader_name?:string;specialty?:string;is_active?:boolean;expected_updated_at:string
  }) => patch('/api/brigades/'+encodeURIComponent(id),body,withAdmin(token)),
  addBrigadeMember: (token:string,id:string,body:{full_name:string;function_name:string}) =>
    post('/api/brigades/'+encodeURIComponent(id)+'/members',body,withAdmin(token)),
  updateBrigadeMember: (token:string,id:string,memberId:string,body:{
    full_name?:string;function_name?:string;is_active?:boolean;expected_updated_at:string
  }) => patch('/api/brigades/'+encodeURIComponent(id)+'/members/'+encodeURIComponent(memberId),body,withAdmin(token)),

  getStaffCalendar: (token: string, month: string) => apiRequest('/api/admin-customers/calendar?month='+encodeURIComponent(month), withAdmin(token)),
  adminAppointments: (token: string, q = '', page?: number, pageSize = 20) =>
    apiRequest('/api/admin-customers/appointments' +
      (page !== undefined || q ? '?' + new URLSearchParams({
        q, page: String(page ?? 1), page_size: String(pageSize),
      }).toString() : ''), withAdmin(token)),
  updateAdminRequest: (token: string, id: string, status: string) => patch(`/api/admin-customers/requests/${id}`, { status }, withAdmin(token)),
  updateAdminRequestDetails: (token: string, id: string, body: {
    title: string; description: string; location: string; preferred_date: string | null; expected_updated_at: string;
  }) => patch('/api/admin-customers/requests/' + encodeURIComponent(id) + '/details', body, withAdmin(token)),
  deleteAdminRequest: (token: string, id: string) => apiRequest(
    '/api/admin-customers/requests/' + encodeURIComponent(id), withAdmin(token, {method:'DELETE'})),
  createAdminAppointment: (token: string, body: {
    customer_id: string; title: string; starts_at: string; ends_at: string;
    status: 'pending'|'confirmed';
  }) => post('/api/admin-customers/appointments', body, withAdmin(token)),
  updateAdminAppointment: (token: string, id: string, status: string) => patch(`/api/admin-customers/appointments/${id}`, { status }, withAdmin(token)),
  getAdminProducts: (token: string) => apiRequest('/api/admin/products', withAdmin(token)),
  getAdminServices: (token: string) => apiRequest('/api/admin/services', withAdmin(token)),
  createAdminProduct: (token: string, body: unknown) => post('/api/admin/products', body, withAdmin(token)),
  createAdminService: (token: string, body: unknown) => post('/api/admin/services', body, withAdmin(token)),
  updateAdminProduct: (token: string, id: string, body: unknown) => patch(`/api/admin/products/${id}`, body, withAdmin(token)),
  updateAdminService: (token: string, id: string, body: unknown) => patch(`/api/admin/services/${id}`, body, withAdmin(token)),
  deleteAdminProduct: (token: string, id: string) => apiRequest(`/api/admin/products/${id}`, withAdmin(token, { method: 'DELETE' })),
  deleteAdminService: (token: string, id: string) => apiRequest(`/api/admin/services/${id}`, withAdmin(token, { method: 'DELETE' })),
  getAdminCategories: (token: string) => apiRequest('/api/admin/categories', withAdmin(token)),
  createAdminCategory: (token: string, body: unknown) => post('/api/admin/categories', body, withAdmin(token)),
  updateAdminCategory: (token: string, id: string, body: unknown) => patch(`/api/admin/categories/${id}`, body, withAdmin(token)),
  deleteAdminCategory: (token: string, id: string) =>
    apiRequest('/api/admin/categories/' + encodeURIComponent(id), withAdmin(token, {method:'DELETE'})),
  uploadProductImage: (token: string, id: string, file: File, altText = '') => {
    const body = new FormData();
    body.append('file', file); body.append('alt_text', altText);
    return apiRequest(`/api/admin/products/${id}/image`, withAdmin(token, { method: 'POST', body }));
  },
  uploadServiceImage: (token: string, id: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return apiRequest(`/api/admin/services/${id}/image`, withAdmin(token, { method: 'POST', body }));
  },
  setProductImageUrl: (token: string, id: string, url: string) =>
    post(`/api/admin/products/${encodeURIComponent(id)}/image-url`, { url }, withAdmin(token)),
  setServiceImageUrl: (token: string, id: string, url: string) =>
    post(`/api/admin/services/${encodeURIComponent(id)}/image-url`, { url }, withAdmin(token)),
  uploadSiteMedia: (token: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return apiRequest('/api/admin/site-media', withAdmin(token, { method: 'POST', body }));
  },
  getAdminGallery: (token: string) => apiRequest('/api/admin/gallery', withAdmin(token)),
  listAdminGalleryCategories: (token: string) => apiRequest('/api/admin/extras/gallery/categories', withAdmin(token)),
  createAdminGalleryCategory: (token: string, name: string) =>
    post('/api/admin/extras/gallery/categories', { name }, withAdmin(token)),
  updateAdminGalleryCategory: (token: string, id: string, body: unknown) =>
    patch('/api/admin/extras/gallery/categories/' + encodeURIComponent(id), body, withAdmin(token)),
  deleteAdminGalleryCategory: (token: string, id: string) =>
    apiRequest('/api/admin/extras/gallery/categories/' + encodeURIComponent(id), withAdmin(token, { method: 'DELETE' })),
  getAdminGalleryImages: (token: string, id: string) =>
    apiRequest('/api/admin/extras/gallery/' + encodeURIComponent(id) + '/images', withAdmin(token)),
  uploadAdminGalleryImage: (token: string, id: string, file: File) => {
    const form = new FormData(); form.append('file', file);
    return apiRequest('/api/admin/extras/gallery/' + encodeURIComponent(id) + '/images', withAdmin(token, { method: 'POST', body: form }));
  },
  deleteAdminGalleryImage: (token: string, id: string, imageId: string) =>
    apiRequest('/api/admin/extras/gallery/' + encodeURIComponent(id) + '/images/' + encodeURIComponent(imageId), withAdmin(token, { method: 'DELETE' })),
  getAdminProductImages: (token: string, id: string) =>
    apiRequest('/api/admin/extras/products/' + encodeURIComponent(id) + '/images', withAdmin(token)),
  deleteAdminProductImage: (token: string, id: string, imageId: string) =>
    apiRequest('/api/admin/extras/products/' + encodeURIComponent(id) + '/images/' + encodeURIComponent(imageId), withAdmin(token, { method: 'DELETE' })),
  getAdminServiceImages: (token: string, id: string) =>
    apiRequest('/api/admin/extras/services/' + encodeURIComponent(id) + '/images', withAdmin(token)),
  uploadAdminServiceImage: (token: string, id: string, file: File) => {
    const form = new FormData(); form.append('file', file);
    return apiRequest('/api/admin/extras/services/' + encodeURIComponent(id) + '/images', withAdmin(token, { method: 'POST', body: form }));
  },
  deleteAdminServiceImage: (token: string, id: string, imageId: string) =>
    apiRequest('/api/admin/extras/services/' + encodeURIComponent(id) + '/images/' + encodeURIComponent(imageId), withAdmin(token, { method: 'DELETE' })),
  verifyProductPurchase: (token: string, id: string, customerId: string, reference = '') =>
    post('/api/admin/extras/products/' + encodeURIComponent(id) + '/verify-purchase', { customer_id: customerId, reference }, withAdmin(token)),
  listAdminProductReviews: (token: string) => apiRequest('/api/admin/extras/product-reviews', withAdmin(token)),
  moderateProductReview: (token: string, id: string, status: 'published' | 'rejected' | 'pending') =>
    patch('/api/admin/extras/product-reviews/' + encodeURIComponent(id), { status }, withAdmin(token)),

  createAdminGallery: (token: string, body: FormData) => apiRequest('/api/admin/gallery', withAdmin(token, { method: 'POST', body })),
  updateAdminGallery: (token: string, id: string, body: unknown) => patch(`/api/admin/gallery/${id}`, body, withAdmin(token)),
  deleteAdminGallery: (token: string, id: string) => apiRequest(`/api/admin/gallery/${id}`, withAdmin(token, { method: 'DELETE' })),
  saveSiteSettings: (token: string, body: Record<string, string>) => apiRequest('/api/admin/site-settings', withAdmin(token, { method: 'PUT', body: JSON.stringify(body) })),
  getAdminConfig: (token: string) => apiRequest('/api/admin/settings', withAdmin(token)),
};
