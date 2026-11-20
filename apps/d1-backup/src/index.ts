import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';

interface Env {
  ACCOUNT_ID: string;
  DATABASE_ID: string;
  D1_EXPORT_API_TOKEN: string;
  BACKUP_BUCKET: R2Bucket;
  BACKUP_WORKFLOW: Workflow;
}

const EXPECTED_DB = 'bbb91e7a-37c6-4290-aa9c-29a8022226b4';
const EXPECTED_ACCOUNT = '466af6f26fce494d6dc640128e200e24';
const CONFIRMATION = 'RESPALDAR_D1_EN_R2';

// Solo se activa mediante la API/CLI de Workflows, con confirmación explícita.
// No loguear respuestas de API completas ni URLs firmadas: contienen acceso al SQL.
export class BonaireD1Backup extends WorkflowEntrypoint<Env> {
  async run(event: WorkflowEvent<{ confirm?: string }>, step: WorkflowStep) {
    if (event.payload?.confirm !== CONFIRMATION) {
      throw new Error('Operación no autorizada: falta confirmación explícita');
    }
    if (this.env.ACCOUNT_ID !== EXPECTED_ACCOUNT ||
        this.env.DATABASE_ID !== EXPECTED_DB ||
        !this.env.D1_EXPORT_API_TOKEN) {
      throw new Error('Configuración de respaldo no válida');
    }

    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${EXPECTED_ACCOUNT}/d1/database/${EXPECTED_DB}/export`;
    const headers = {
      'Authorization': `Bearer ${this.env.D1_EXPORT_API_TOKEN}`,
      'Content-Type': 'application/json',
    };

    const bookmark = await step.do('Solicitar exportacion completa D1', async () => {
      const response = await fetch(endpoint, {
        method: 'POST', headers,
        body: JSON.stringify({ output_format: 'polling', dump_options: { compatibility: 'd1' } }),
      });
      if (!response.ok) throw new Error(`Exportacion D1: HTTP ${response.status}`);
      const body: any = await response.json();
      if (!body.success || typeof body.result?.at_bookmark !== 'string') {
        throw new Error('Cloudflare no devolvio el bookmark de exportacion');
      }
      return body.result.at_bookmark as string;
    });

    const objectKey = `d1/energia-vital/${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}.sql`;
    const saved = await step.do(
      'Esperar exportacion y archivar copia privada',
      { retries: { limit: 40, delay: '10 seconds', backoff: 'constant' }, timeout: '10 minutes' },
      async () => {
        const response = await fetch(endpoint, {
          method: 'POST', headers,
          body: JSON.stringify({
            output_format: 'polling',
            current_bookmark: bookmark,
            dump_options: { compatibility: 'd1' },
          }),
        });
        if (!response.ok) throw new Error(`Consulta exportacion: HTTP ${response.status}`);
        const body: any = await response.json();
        if (!body.success || body.result?.status === 'error') {
          throw new Error('Cloudflare reportó un error de exportación');
        }
        const signedUrl = body.result?.result?.signed_url;
        if (body.result?.status !== 'complete' || typeof signedUrl !== 'string') {
          throw new Error('Exportacion D1 aun en proceso');
        }
        const dump = await fetch(signedUrl);
        if (!dump.ok || !dump.body) throw new Error('No se pudo obtener el SQL');
        const obj = await this.env.BACKUP_BUCKET.put(objectKey, dump.body, {
          httpMetadata: { contentType: 'application/sql' },
        });
        if (!obj || obj.size < 100) throw new Error('El objeto R2 esta vacio o no se confirmo');
        return { key: objectKey, bytes: obj.size, etag: obj.etag };
      },
    );

    const check = await step.do('Verificar objeto R2 y tamaño', async () => {
      const obj = await this.env.BACKUP_BUCKET.head(saved.key);
      if (!obj || obj.size !== saved.bytes || obj.size < 100) {
        throw new Error('El respaldo no existe o el tamano no coincide');
      }
      return { key: saved.key, bytes: obj.size, etag: obj.etag, stored: true };
    });
    // Este resultado contiene solo metadata. NO imprimir/copiar el SQL.
    return check;
  }
}

export default {
  fetch(): Response {
    return new Response('No disponible', { status: 404 });
  },
};
