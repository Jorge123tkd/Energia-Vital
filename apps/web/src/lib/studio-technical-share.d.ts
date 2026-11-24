export interface EngineeringShareProject {id:string;name:string}
export interface EngineeringShareRow {
 id:string;site:string;kind:string;
 body:{title?:string;name?:string;quantity?:number;unit?:string;status?:string;dueDate?:string;productId?:null};
}
export interface EngineeringShareSkip {site:string;kind:string;reason:string}
export function savedProjects(manifest:unknown):EngineeringShareProject[];
export function previewTechnicalRows(manifest:unknown,projectId:string):Promise<{rows:EngineeringShareRow[];skipped:EngineeringShareSkip[]}>;
