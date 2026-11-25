export function transport(request:(method:string,suffix:string,payload?:unknown)=>Promise<any>):(method:string,payload?:any)=>Promise<any>;
export function pack(snapshot:unknown):Promise<{snapshot:unknown;assets:Map<string,string>}>;
export function unpack(snapshot:unknown,load:(hash:string)=>Promise<string>):Promise<unknown>;
