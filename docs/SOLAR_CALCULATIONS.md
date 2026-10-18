# Cálculos Solares — Energía Vital

Este documento explica los cálculos técnicos del asesor solar, sus fórmulas y supuestos.

## 1. Potencia (P)

Para corriente continua o corriente alterna con factor de potencia conocido:

```
P = V × I × FP
```

Donde:
- **P**: Potencia en vatios (W)
- **V**: Voltaje en voltios (V)
- **I**: Corriente en amperios (A)
- **FP**: Factor de potencia (típicamente 0.85 si no se conoce)

### Ejemplo
Una carga de 10 A a 220 V con FP 0.85:
```
P = 220 × 10 × 0.85 = 1,870 W
```

## 2. Energía consumida

```
Energía (kWh) = Potencia (kW) × Tiempo (horas)
```

### Tabla de referencia

| Autonomía | Energía consumida (1.4 kW de carga) |
|---|---:|
| 5 horas | 7 kWh |
| 8 horas | 11,2 kWh |
| 10 horas | 14 kWh |
| 15 horas | 21 kWh |
| 20 horas | 28 kWh |

## 3. Capacidad nominal de batería

```
Capacidad nominal (kWh) = Energía requerida (kWh) / (Profundidad de descarga × Eficiencia)
```

### Supuestos configurables
- **Profundidad de descarga (DoD)**: 0.8 (80%)
- **Eficiencia de conversión**: 0.9 (90%)

### Ejemplo
Para 14 kWh de energía requerida:
```
Capacidad nominal = 14 / (0.8 × 0.9) = 19.4 kWh
```

## 4. Selección del inversor

```
Inversor mínimo recomendado = Potencia simultánea estimada × 1.25
```

El margen del 25% es configurable desde el panel de administración.

## 5. Dimensionamiento de paneles solares

```
Potencia fotovoltaica requerida (kWp) = Energía diaria a generar (kWh) / (Horas solares pico × Rendimiento global)
```

### Rendimiento global estimado
- 0.75 (75%) considerando pérdidas del sistema, eficiencia del inversor y del regulador MPPT

### Ejemplo
Para generar 14 kWh diarios con 4.5 horas solares pico:
```
Potencia fotovoltaica = 14 / (4.5 × 0.75) = 4.15 kWp
```

Con paneles de 450 W:
```
Cantidad de paneles = (4.15 × 1000) / 450 = 10 paneles (redondeado hacia arriba)
```

## 6. Limitaciones importantes

- Estos cálculos son **estimaciones preliminares**
- No consideran sombras, orientación, temperatura o cableado específico
- La configuración definitiva requiere una **evaluación técnica presencial**
- Los factores (DoD, eficiencia, horas solares) son configurables y deben ajustarse según la ubicación real
- No garantizamos que un número fijo de paneles mantendrá la vivienda en todas las condiciones meteorológicas

## 7. Configuración desde el panel

El administrador puede ajustar en **Configuración del asistente**:
- Profundidad de descarga permitida
- Eficiencia del inversor
- Horas solares pico por defecto
- Margen del inversor
- Potencia nominal de los paneles del catálogo