# Cálculos solares del asesor Bonaire
Última actualización: 11 de noviembre de 2026. Documento técnico de orientación comercial, no memoria de instalación.

## Qué interpreta el cliente
- **W** es potencia instantánea; **kWh** es energía utilizada o almacenada a lo largo del tiempo.
- Las horas equivalentes de uso diario se registran por aparato. En el corte, el cliente puede indicar cuántas horas utilizará cada carga esencial, porque no todas funcionan sin detenerse durante las 15 horas.
- Una nevera usa un factor orientativo de trabajo del compresor de 0,40; todos los factores son ejemplos editables por diseño técnico, no promesas de consumo real.

## Experiencia del cliente: asesoramiento sencillo y ampliación

La primera pregunta es **«¿Ya tienes inversor?»** antes de elegir vivienda, negocio o centro estatal y antes del nivel de conocimientos.

- **Sin inversor:** el cliente solicita un sistema nuevo. La guía sencilla le pide aparatos, cantidad, horas aproximadas de uso diario, cuáles necesita durante cortes y horas deseadas de respaldo; deja los vatios y las horas especiales de cada aparato bajo ajustes opcionales.
- **Con inversor:** el cliente puede informar marca/modelo, potencia nominal en **kW**, capacidad de batería existente en **kWh** y cantidad de paneles instalados (cada dato opcional si lo desconoce). El resultado compara potencia nominal de inversor con la referencia de cargas esenciales y calcula una diferencia de capacidad nominal de batería respecto al respaldo **sin aporte solar**. La diferencia no autoriza mezclar bancos de baterías o ampliar un MPPT sin validación de fabricante.
- En **modo sencillo** no se pregunta el horario del próximo apagón. El respaldo principal se calcula de modo conservador sin atribuir sol al corte. El cliente puede marcar voluntariamente «explorar una solución con paneles»; entonces se añade un **ejemplo explícitamente hipotético de corte diurno** (que empieza a las 9:00), no una previsión sobre el suministro eléctrico. La casilla está inicialmente **desmarcada**. En modo técnico se puede ver y modificar un horario de escenario y datos MPPT dentro de opciones avanzadas, cuando se dispone de ellos.
- Se ofrece una **referencia inicial de hasta diez paneles en vivienda** (ajustable en nivel técnico). La potencia teórica necesaria para abastecer toda la demanda diaria se conserva y, si supera el espacio supuesto, se explica la diferencia. Diez paneles no son un tope normativo ni una promesa de cobertura.
- El resultado incluye **«Productos recomendados para tu estudio»**: de cero a seis tarjetas reales con fotografía, precio publicado cuando exista, familia y enlace directo a la ficha del catálogo; el cliente puede desplazarse horizontalmente, escoger y pulsar «Ver más productos». Se priorizan productos activos que figuren «En existencia»; se muestran como máximo dos por batería, panel e inversor, sin duplicados. Si el catálogo no tiene seis productos apropiados, se muestran menos. No se supone compatibilidad ni compra automática.
- **Sigue siendo orientación, no ingeniería de instalación**: los valores comerciales obtenidos del nombre de un producto no garantizan tensión, arquitectura, disponibilidad final ni aptitud del equipo.

## Reglas de cálculo actuales
- Potencia máxima de aparatos: suma de W × cantidad. Para lecturas medidas: tensión × corriente × factor de potencia; en trifásica se aplica raíz de tres. La potencia del interruptor automático **no** mide el consumo.
- Energía diaria: suma de W × cantidad × horas equivalentes/día ÷ 1.000.
- Respaldo por apagón: suma de cargas esenciales W × cantidad × factor de uso × mín(horas de uso durante corte, duración del corte) ÷ 1.000. Si no declara horas específicas del corte se supone toda su duración. La potencia media de respaldo es esa energía dividida entre la duración del corte.
- Batería nominal teórica **sin sol**: energía del corte ÷ (0,80 × 0,90). Es una necesidad energética de escenario, no un artículo obligatorio.
- Inversor orientativo: pico simultáneo de cargas esenciales × 1,25. No basta para comprobar corrientes de arranque, fase ni compatibilidad de instalación.
- Potencia PV ideal: consumo total diario ÷ (horas solares pico × 0,75). Paneles ideales: techo de PV W ÷ W nominal por panel.
- Paneles **propuestos**: mínimo de paneles ideales y límite inicial de espacio supuesto (diez por defecto para vivienda, 24 en negocio, 40 en entidad; editable por técnico). Si no alcanzan los ideales, se señala el déficit; no se finge que diez paneles proporcionan energía ilimitada.
- Producción solar del escenario: paneles propuestos × W/1.000 × horas solares pico × 0,75 × factor meteorológico (soleado 1,00, variable 0,70, nublado 0,35). **Son escenarios ilustrativos**, no pronósticos de Cuba.
- Ventana diurna simplificada: 9:00–16:00. Se distribuye la energía solar diaria como potencia media durante esas siete horas; no representa un perfil horario real. El simulador recorre el corte en intervalos de quince minutos. Calcula el déficit neto instantáneo respecto al promedio de carga esencial, permite recarga cuando hay excedentes y estima el máximo vaciado acumulado. La batería nominal **con paneles** divide ese máximo por 0,72. Se supone batería inicialmente cargada y con capacidad de aceptar la recarga.
- Si el corte comienza a las **17:00 y dura 15 horas, termina a las 08:00**, por lo que **no se atribuye aporte de los paneles dentro de ese corte**. Un corte 17:00–07:00 sería de 14 horas. Los paneles pueden alimentar la casa y cargar baterías durante el día siguiente, pero no suministran energía nocturna por sí solos.
- Referencias comerciales de almacenamiento nominal, no límites normativos: vivienda [5, 10, 12, 15] kWh, negocio [10, 15, 20, 30] kWh, entidad [15, 30, 50] kWh. Si la demanda supera el rango, la interfaz informa que **no cabe en esa referencia** y pide reducir cargas o revisar otro banco. Nunca rebajar en silencio la capacidad calculada para que parezca suficiente.
- Inventario sugerido: consulta solo productos publicados marcados «En existencia» y con unidades positivas si se conoce el stock. Muestra hasta dos alternativas por familia (batería, inversor, panel) ordenadas primero por potencias/capacidades que puedan leerse del nombre. **No certifica compatibilidad**; requiere comprobar tensión, batería/BMS, MPPT, Isc, Voc, Vmp y cadena PV bajo temperatura real.

## Limitaciones
Un estudio definitivo necesita irradiancia por localidad y estación, climatología, sombras, orientación e inclinación, curvas de carga por hora, potencia de carga/descarga real, arranques de motores, degradación, límites eléctricos y aprobación profesional. Una ventana horaria plana y los factores meteorológicos **no** simulan un día real; los resultados solo comparan escenarios y deben tratarse como rangos preliminares. El consumo diario declarado debe corresponder al patrón real de actividad; usar simultáneamente todas las cargas puede sobredimensionar el inversor.

## Referencias para profundizar
- [NLR/NREL SAM — diseño FV y pérdidas](https://samrepo.nlr.gov/help/pvwatts_system_design.html)
- [PVWatts — precauciones e incertidumbre meteorológica](https://pvwatts.nlr.gov/docs/en/help_results_interpret.php)
- [DOE — integración de energía solar y almacenamiento](https://www.energy.gov/cmei/systems/solar-integration-solar-energy-and-storage-basics)
- [SAM — modelo fotovoltaico detallado](https://sam.nlr.gov/photovoltaic)

Estos modelos externos no se ejecutan en el asesor: solo fundamentan la importancia de pérdidas, clima, energía y verificaciones técnicas.

## Pruebas de regresión del estimador
Ejecutar desde la raíz: `node apps/api/tests/solar-estimator.cjs`. Se verifican los resultados históricos, el apagón nocturno de 15 horas, sol durante el corte diurno, ausencia de paneles, reducción de producción con nubes, menos horas de carga esencial y límites MPPT. No requiere Worker local, D1, credenciales ni conexiones remotas.
