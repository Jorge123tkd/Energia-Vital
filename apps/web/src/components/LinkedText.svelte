<script lang="ts">
  /** Solo transforma visualmente HTTPS en enlaces. No cambia el mensaje original. */
  let { content }: { content: string } = $props();
  type Part = {text:string;href?:string};
  function linkParts(message:string):Part[] {
    const parts:Part[]=[];
    const url=/https:\/\/[^\s<>"']+/g;
    let last=0;
    for(const match of message.matchAll(url)){
      const start=match.index ?? 0;
      if(start>last)parts.push({text:message.slice(last,start)});
      const raw=match[0];
      const clean=raw.replace(/[),.!?;:]+$/g,'');
      const suffix=raw.slice(clean.length);
      try {
        const address=new URL(clean);
        if(address.protocol!=='https:')throw Error('not https');
        const host=address.hostname.replace(/^www\./,'');
        const label=host==='eltoque.com' && address.pathname.includes('tasas-de-cambio')
          ? 'elTOQUE · tasas de cambio'
          : host+((address.pathname!=='/'&&address.pathname!=='')?' · ver enlace':'');
        parts.push({text:label,href:clean});
      }catch {parts.push({text:clean});}
      if(suffix)parts.push({text:suffix});
      last=start+raw.length;
    }
    if(last<message.length)parts.push({text:message.slice(last)});
    return parts.length ? parts : [{text:message}];
  }
  let parts=$derived(linkParts(content));
</script>

<span class="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{#each parts as part,i (i)}{#if part.href}<a href={part.href} target="_blank" rel="noopener noreferrer"
  class="text-teal-700 underline underline-offset-2 font-semibold hover:text-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
  title={part.href} aria-label={'Abrir enlace externo: '+part.href}>{part.text}</a>{:else}{part.text}{/if}{/each}</span>
