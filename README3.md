# Proyecto nuevo — planificador generalista + lista de la compra

Notas de la conversación del 23/10/2026. Es una idea para un proyecto **nuevo** basado en Mi plato. Mi plato no se modifica.

Objetivo: una app y webapp más generalista, abierta a más usuarios, que además ayude con la lista de la compra.

## Qué aprovechamos de Mi plato y qué hay que generalizar

**Se puede reutilizar casi tal cual:**

- El motor de cálculo (`src/lib/engine.js`): macros por ingrediente, equivalencias por proteína o carbohidratos, presupuesto que queda para la cena, avisos.
- El modelo de catálogo con fuentes citadas, que da seriedad.
- El guardado local primero con sincronización y resolución de conflictos.

**Ahora mismo está pensado para una sola persona:**

- Las reglas son las de un plan concreto: desayuno A/B, 200 g de verdura, 150–180 g de carne, sin guarnición en la cena, 1.500 kcal…
- La sincronización usa una llave personal, sin cuentas de usuario.
- El catálogo es cerrado (145 alimentos autorizados).

La clave para generalizarlo es **convertir las reglas en datos**. En vez de tener "desayuno A/B" escrito en el código, cada usuario tendría una **plantilla de plan**: sus comidas, la estructura de cada plato, sus objetivos y sus alimentos permitidos. El plan actual de Mi plato pasaría a ser la primera plantilla. Así serviría para quien sigue un plan de su nutricionista, para quien solo quiere contar macros o para quien solo quiere organizar el menú de la semana.

## Lista de la compra

Es lo que más valor añade, porque sale casi gratis del planificador:

1. Planificas la semana y la app suma los ingredientes de todos los días: "pechuga de pollo: 900 g".
2. Los agrupa por sección del súper (frutería, carnicería, lácteos…).
3. Pasa los gramos a unidades de compra: 900 g de pollo son unas 2 bandejas, 125 g de yogur es 1 envase. Para eso hace falta añadir el formato de venta a cada alimento.
4. Descuenta lo que ya tienes en la despensa (opcional, v2).
5. Lista compartida en tiempo real con quien vive contigo (Supabase Realtime) y marcar productos mientras compras, también sin conexión.

## App y webapp a la vez

De menos a más esfuerzo:

1. **Empezar con una PWA**: la webapp se instala en el móvil como si fuera una app, funciona sin conexión y no hay que pasar por las tiendas. Con React encaja muy bien y es lo más rápido para validar con usuarios reales.
2. **Luego, Capacitor**: envuelve esa misma web en una app de iOS y Android para publicarla en las tiendas. Un solo código.
3. Solo si hiciera falta una experiencia muy nativa, **Expo / React Native** con lógica compartida. No al principio.

Backend: mantener Supabase, pero con cuentas de verdad (Auth con correo o Google/Apple) y **RLS por usuario**, en lugar de la llave personal.

## Cosas serias a tener en cuenta al abrirlo a más gente

- **Protección de datos (RGPD)**: el peso, la dieta o una patología pueden considerarse datos de salud, que son una categoría especial. Hace falta consentimiento explícito, política de privacidad, poder exportar y borrar los datos, y servidores en la UE (Supabase permite elegir la región de Frankfurt).
- **No hacer recomendaciones médicas**: la app ayuda a organizar y calcular, no prescribe. Una vía interesante es que los nutricionistas creen los planes y los asignen a sus pacientes, lo que además podría ser un modelo de negocio.
- **Catálogo**: con más usuarios, 145 alimentos se quedan cortos. Se puede combinar BEDCA (base española oficial) con Open Food Facts (escáner de código de barras), manteniendo la idea de citar siempre la fuente.

## MVP propuesto

1. Cuentas de usuario y perfil con objetivos.
2. Plantillas de plan: la de Mi plato y una genérica de "contar macros".
3. Planificador semanal reutilizando el motor.
4. Lista de la compra generada, agrupada, compartible y que funcione sin conexión.
5. PWA instalable.

Para después: apps de iOS y Android (Capacitor), escáner de código de barras, despensa, modo nutricionista.

## Preguntas pendientes

1. **¿A quién va dirigida?** ¿A cualquiera que quiera comer mejor, a gente que sigue un plan de su nutricionista, o a familias que organizan el menú?
2. **¿Proyecto personal o con idea de monetizarlo** (o hacerlo con Oniria)?
3. **¿Salir en las tiendas desde el principio**, o empezar con la PWA?
4. **¿Nombre?**

## Siguiente paso

Responder las preguntas y, con eso, cerrar visión, alcance del MVP y arquitectura antes de crear el repositorio nuevo.
