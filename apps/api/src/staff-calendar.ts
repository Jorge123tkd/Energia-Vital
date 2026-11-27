/** Ventana UTC ampliada para eventos del mes local cubano. */
export function calendarMonthWindow(month:string):{start:string;end:string;monthStart:string;monthEnd:string}|null {
  const match=/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.exec(month);
  if(!match)return null;
  const year=Number(match[1]),index=Number(match[2])-1;
  const first=Date.UTC(year,index,1),next=Date.UTC(year,index+1,1);
  return {start:new Date(first-2*86400000).toISOString(),
    end:new Date(next+2*86400000).toISOString(),
    monthStart:new Date(first).toISOString().slice(0,10),
    monthEnd:new Date(next).toISOString().slice(0,10)};
}
