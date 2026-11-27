import {Hono} from 'hono';
import type {Env} from '../types';
import {requireStaffAuth,requireAdminAuth} from '../middleware';
import {validateSurvey,surveyQuote} from '../residential-survey';
export const residentialRoutes=new Hono<{Bindings:Env;Variables:{user?:any}}>();
residentialRoutes.use('*',requireStaffAuth);
residentialRoutes.use('*',async(c,next)=>{
 c.header('Cache-Control','private, no-store');
 if(!await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='residential_survey_versions'").first())return c.json({error:'Levantamiento residencial pendiente de migración 030.'},503);
 await next();
});
const validId=(id:unknown):id is string=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);
residentialRoutes.get('/project/:id',requireAdminAuth,async c=>{
 const id=c.req.param('id');if(!validId(id))return c.json({error:'Proyecto inválido'},400);
 const link=await c.env.DB.prepare("SELECT l.request_id,r.title FROM warehouse_project_links l JOIN requests r ON r.id=l.request_id WHERE l.project_id=? AND r.status NOT IN ('cancelled','completed')").bind(id).first();
 if(!link)return c.json({error:'Vincula primero el proyecto con una solicitud comercial activa desde Almacén y compras.'},404);
 return c.json(link);
});
residentialRoutes.get('/requests/:id',async c=>{
 const id=c.req.param('id');if(!validId(id))return c.json({error:'Solicitud inválida'},400);
 const request=await c.env.DB.prepare('SELECT id,status,location FROM requests WHERE id=?').bind(id).first();if(!request)return c.json({error:'Solicitud inexistente'},404);
 const row=await c.env.DB.prepare('SELECT revision,body_json,created_at FROM residential_survey_versions WHERE request_id=? ORDER BY revision DESC LIMIT 1').bind(id).first<{revision:number;body_json:string;created_at:string}>();
 if(!row)return c.json({revision:0,survey:null,proposal:null,request});
 const survey=validateSurvey(JSON.parse(row.body_json));if(!survey)return c.json({error:'Levantamiento incompatible'},409);
 return c.json({revision:row.revision,survey,proposal:surveyQuote(survey,row.revision),request,created_at:row.created_at});
});
residentialRoutes.post('/requests/:id',async c=>{
 const id=c.req.param('id');if(!validId(id))return c.json({error:'Solicitud inválida'},400);
 const length=Number(c.req.header('content-length')||'0');if(length>8192)return c.json({error:'Levantamiento demasiado grande'},413);
 const raw=await c.req.text();if(new TextEncoder().encode(raw).length>8192)return c.json({error:'Levantamiento demasiado grande'},413);
 let b:any;try{b=JSON.parse(raw)}catch{return c.json({error:'JSON inválido'},400)}
 const survey=validateSurvey(b?.survey),expected=b?.expected_revision;
 if(!survey||!Number.isSafeInteger(expected)||expected<0||expected>=1000000||Object.keys(b).sort().join(',')!=='expected_revision,survey')return c.json({error:'Revisa cantidades, modalidad y precios. El aporte del cliente y almacén no puede superar la necesidad.'},400);
 const actor=c.var.user!.user_id;
 try{
 const r=await c.env.DB.prepare("INSERT INTO residential_survey_versions(request_id,revision,mode,body_json,actor_id,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM requests WHERE id=? AND status NOT IN ('cancelled','completed')) AND COALESCE((SELECT MAX(revision) FROM residential_survey_versions WHERE request_id=?),0)=?").bind(id,expected+1,survey.mode,JSON.stringify(survey),actor,new Date().toISOString(),id,id,expected).run();
 if(r.meta?.changes!==1)return c.json({error:'El expediente cambió o está cerrado. Actualiza antes de guardar.'},409);
 return c.json({revision:expected+1,survey,proposal:surveyQuote(survey,expected+1)},201);
 }catch(e){if(/constraint|residential_survey/i.test(String(e)))return c.json({error:'Conflicto de revisión. Actualiza el expediente.'},409);throw e}
});
