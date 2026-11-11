/** Contactos de ventas PUBLICADOS por el administrador, nunca números privados ni bots. */
export type SalesManager = {name:string; phone:string};

export function parseSalesManagers(value: unknown): SalesManager[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row: any) => row && typeof row.name === 'string' &&
      row.name.trim().length > 0 && row.name.trim().length <= 60 &&
      typeof row.phone === 'string' && /^\+?[0-9 ()-]{8,25}$/.test(row.phone.trim()) &&
      row.phone.replace(/\D/g, '').length >= 8 &&
      row.phone.replace(/\D/g, '').length <= 15)
      .slice(0,6).map((row: any)=>({name:row.name.trim(),phone:row.phone.trim()}));
  } catch { return []; }
}

/** Solo abre un chat: no crea pedido, pago, factura o compra verificada. */
export function salesWhatsAppLink(manager: SalesManager | undefined, product: {id:string;name:string}): string {
  if (!manager) return '';
  const digits=manager.phone.replace(/\D/g,'');
  if (digits.length<8 || digits.length>15) return '';
  const message='Hola, me interesa comprar este producto de Bonaire.\n'+
    'Producto: '+product.name+'\nID del producto: '+product.id+
    '\n¿Me puedes confirmar disponibilidad, precio final y cómo completar la compra?';
  return 'https://wa.me/'+digits+'?text='+encodeURIComponent(message);
}
