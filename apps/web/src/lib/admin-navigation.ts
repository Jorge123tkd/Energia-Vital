export const adminPaths={
 requests:'/admin/solicitudes',appointments:'/admin/citas',brigades:'/admin/brigadas',customers:'/admin/clientes',
 'assistant-usage':'/admin/actividad-asistente',products:'/admin/productos',services:'/admin/servicios',
 gallery:'/admin/galeria',site:'/admin/mi-sitio-web',staff:'/admin/personal',notifications:'/admin/notificaciones',studio:'/admin/ev-pro-studio'
} as const;
export type AdminTab=keyof typeof adminPaths;
export function isAdminPath(path:string){return path==='/admin'||path.startsWith('/admin/');}
export function adminTabForPath(path:string,role:'admin'|'operator'='admin'):AdminTab{
 const normalized=path.replace(/\/+$/,'');
 const found=(Object.keys(adminPaths) as AdminTab[]).find(key=>adminPaths[key]===normalized)||'requests';
 return role==='operator'&&!['requests','appointments','brigades','customers','studio'].includes(found)?'requests':found;
}

/** The Studio admin screen must stay hidden until a release explicitly enables it.
 * Direct navigation to /admin/ev-pro-studio cannot bypass the release gate.
 */
export function studioGatedTabForPath(path:string,role:'admin'|'operator'='admin',studioUiEnabled=false):AdminTab{
 const tab=adminTabForPath(path,role);
 return !studioUiEnabled&&tab==='studio'?'requests':tab;
}
